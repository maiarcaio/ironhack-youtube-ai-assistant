// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Video } from '../../types/video'
import { SearchableTranscriptView } from './SupplementalViews'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}))

vi.mock('../../services/api/supabaseClient', () => ({
  supabase: {
    from: mocks.from,
  },
}))

const video: Video = {
  id: '11111111-1111-4111-8111-111111111111',
  source_url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  title: 'Searchable lecture',
  thumbnail_url: null,
  status: 'ready',
}

beforeEach(() => {
  mocks.from.mockReturnValue({ select: mocks.select })
  mocks.select.mockReturnValue({ eq: mocks.eq })
  mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  mocks.maybeSingle.mockResolvedValue({
    data: {
      video_id: video.id,
      content: `1
00:00:01,000 --> 00:00:03,500
Hello everyone.

2
00:00:04,000 --> 00:00:07,000
Welcome to VideoMind.`,
      format: 'srt',
      source: 'youtube',
    },
    error: null,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SearchableTranscriptView', () => {
  it('loads the selected transcript and seeks from a genuine timestamp', async () => {
    const user = userEvent.setup()
    const onSeek = vi.fn()

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={onSeek}
      />,
    )

    expect(await screen.findByText('Hello everyone.')).toBeTruthy()
    expect(screen.getByText('Welcome to VideoMind.')).toBeTruthy()
    expect(mocks.from).toHaveBeenCalledWith('transcripts')
    expect(mocks.select).toHaveBeenCalledWith(
      'video_id, content, format, source',
    )
    expect(mocks.eq).toHaveBeenCalledWith('video_id', video.id)

    await user.click(screen.getByRole('button', {
      name: 'Jump to 00:01 in video',
    }))

    expect(onSeek).toHaveBeenCalledExactlyOnceWith(1)
  })

  it('refetches when a selected video transitions to ready', async () => {
    const { rerender } = render(
      <SearchableTranscriptView
        videos={[{ ...video, status: 'processing' }]}
        selectedVideo={{ ...video, status: 'processing' }}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    expect(await screen.findByText('Hello everyone.')).toBeTruthy()
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1)

    rerender(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    await act(async () => undefined)
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Welcome to VideoMind.')).toBeTruthy()
  })

  it('filters transcript text and highlights case-insensitive matches', async () => {
    const user = userEvent.setup()

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    const search = await screen.findByRole('textbox', {
      name: 'Search transcript',
    })

    await user.type(search, 'video')

    expect(screen.queryByText('Hello everyone.')).toBeNull()
    expect(screen.getByText('Video', { selector: 'mark' })).toBeTruthy()
    expect(screen.getByText('1 of 2 segments')).toBeTruthy()
  })

  it('shows a loading state while transcript access is pending', async () => {
    mocks.maybeSingle.mockReturnValue(new Promise(() => undefined))

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    expect(
      (await screen.findByRole('status')).textContent,
    ).toContain('Loading transcript...')
  })

  it('shows an empty state when the selected video has no transcript', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', {
      name: 'No transcript available',
    })).toBeTruthy()
    expect(screen.getByRole('textbox', {
      name: 'Search transcript',
    }).hasAttribute('disabled')).toBe(true)
  })

  it('displays complete TXT content without a timestamp action', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        video_id: video.id,
        content: 'First paragraph.\n\nSecond paragraph.',
        format: 'txt',
        source: 'upload',
      },
      error: null,
    })

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    expect(await screen.findByText((_, element) =>
      element?.tagName === 'P' &&
      element.textContent === 'First paragraph.\n\nSecond paragraph.',
    )).toBeTruthy()
    expect(screen.getByText('No timestamp')).toBeTruthy()
    expect(screen.queryByRole('button', {
      name: /Jump to .* in video/,
    })).toBeNull()
  })

  it('shows the authenticated read error without stale transcript text', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'Transcript access denied.' },
    })

    render(
      <SearchableTranscriptView
        videos={[video]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(
      'Could not load transcript: Transcript access denied.',
    )
    expect(screen.queryByText('Hello everyone.')).toBeNull()
  })

  it('ignores a late transcript response after the selected video changes', async () => {
    let resolveFirstRequest: ((value: {
      data: {
        video_id: string
        content: string
        format: string
        source: string
      }
      error: null
    }) => void) | undefined

    mocks.maybeSingle
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirstRequest = resolve
      }))
      .mockResolvedValueOnce({
        data: {
          video_id: '22222222-2222-4222-8222-222222222222',
          content: 'The current video transcript.',
          format: 'txt',
          source: 'upload',
        },
        error: null,
      })

    const secondVideo: Video = {
      ...video,
      id: '22222222-2222-4222-8222-222222222222',
      title: 'Current lecture',
    }

    const { rerender } = render(
      <SearchableTranscriptView
        videos={[video, secondVideo]}
        selectedVideo={video}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    rerender(
      <SearchableTranscriptView
        videos={[video, secondVideo]}
        selectedVideo={secondVideo}
        onNavigate={vi.fn()}
        onSeek={vi.fn()}
      />,
    )

    expect(await screen.findByText('The current video transcript.')).toBeTruthy()

    await act(async () => {
      resolveFirstRequest?.({
        data: {
          video_id: video.id,
          content: 'This stale transcript must stay hidden.',
          format: 'txt',
          source: 'upload',
        },
        error: null,
      })
    })

    expect(screen.queryByText('This stale transcript must stay hidden.')).toBeNull()
    expect(screen.getByText('The current video transcript.')).toBeTruthy()
  })
})

// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import type { Video } from '../../types/video'
import { TranscriptsLibraryView } from './TranscriptsLibraryView'

const { getVideoTranscript } = vi.hoisted(() => ({ getVideoTranscript: vi.fn() }))
vi.mock('../../services/api/transcriptApi', () => ({ getVideoTranscript }))

const videos: Video[] = [
  { id: 'video-a', source_url: 'https://youtube.com/watch?v=a', title: 'Alpha lecture', thumbnail_url: null, status: 'ready' },
  { id: 'video-b', source_url: 'https://youtube.com/watch?v=b', title: 'Beta lecture', thumbnail_url: null, status: 'ready' },
]

afterEach(() => { cleanup(); getVideoTranscript.mockReset() })

it('loads a transcript on demand, searches it, and seeks genuine timestamps', async () => {
  const user = userEvent.setup()
  const onSeek = vi.fn()
  getVideoTranscript.mockResolvedValue({ video_id: 'video-a', format: 'srt', content: '1\n00:00:04,000 --> 00:00:05,000\nCopper lantern\n' })
  render(<TranscriptsLibraryView videos={videos} onOpenVideo={vi.fn()} onBackToLibrary={vi.fn()} onSeek={onSeek} />)
  await user.click(within(screen.getByRole('region', { name: 'Transcript library' })).getAllByRole('button', { name: 'Read transcript' })[0])
  expect(await screen.findByText('Copper lantern')).toBeTruthy()
  await user.type(screen.getByRole('textbox', { name: 'Search open transcript' }), 'lantern')
  expect(screen.getByText('lantern')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: '00:04' }))
  expect(onSeek).toHaveBeenCalledWith(4)
})
it('keeps archived records readable but prevents opening an archived player', async () => {
  const user = userEvent.setup()
  const onOpenVideo = vi.fn()
  render(<TranscriptsLibraryView videos={videos} archivedVideoIds={new Set(['video-b'])} onOpenVideo={onOpenVideo} onBackToLibrary={vi.fn()} onSeek={vi.fn()} />)
  const archived = screen.getByText('Beta lecture').closest('article')!
  expect(archived.textContent).toContain('Restore in Library to open player')
  expect(within(archived).queryByRole('button', { name: 'Open player' })).toBeNull()
  await user.click(within(archived).getByRole('button', { name: 'Read transcript' }))
  await waitFor(() => expect(getVideoTranscript).toHaveBeenCalledWith('video-b'))
  expect(onOpenVideo).not.toHaveBeenCalled()
})


// @vitest-environment jsdom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createRef } from 'react'

import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import { YouTubePlayer } from './YouTubePlayer'
import type { YouTubePlayerHandle } from './YouTubePlayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  delete window.YT
})

describe('YouTubePlayer', () => {
  it('rejects an invalid YouTube URL', () => {
    render(
      <YouTubePlayer
        sourceUrl="https://example.org/video"
        title="Invalid Video"
      />,
    )

    expect(
      screen.getByText(
        /not a supported YouTube video URL/i,
      ),
    ).toBeTruthy()
  })

  it('does not construct a player for an empty URL', () => {
    render(
      <YouTubePlayer
        sourceUrl=""
        title="Empty Video"
      />,
    )

    expect(
      screen.getByText(
        /not a supported YouTube video URL/i,
      ),
    ).toBeTruthy()
  })

  it('renders the loading state for a valid URL', () => {
    render(
      <YouTubePlayer
        sourceUrl="https://youtu.be/jfKfPfyJRdk"
        title="Test Video"
      />,
    )

    expect(
      screen.getByText(/Loading YouTube player/i),
    ).toBeTruthy()
  })

  it('exposes playback time only after the player is ready', async () => {
    const ref = createRef<YouTubePlayerHandle>()
    const player = {
      seekTo: vi.fn(),
      destroy: vi.fn(),
      getCurrentTime: vi.fn(() => 85.9),
    }

    window.YT = {
      Player: function Player(_element, options) {
        window.setTimeout(() => {
          options.events?.onReady?.({ target: player })
        }, 0)
        return player
      } as never,
    }

    render(
      <YouTubePlayer
        ref={ref}
        sourceUrl="https://youtu.be/jfKfPfyJRdk"
        title="Timestamped Video"
      />,
    )

    expect(ref.current?.getCurrentTime()).toBeNull()

    await waitFor(() => {
      expect(ref.current?.getCurrentTime()).toBe(85.9)
    })
  })
})

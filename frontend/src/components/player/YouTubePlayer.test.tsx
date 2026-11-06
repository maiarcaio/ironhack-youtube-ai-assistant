
// @vitest-environment jsdom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  cleanup,
  render,
  screen,
} from '@testing-library/react'

import { YouTubePlayer } from './YouTubePlayer'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
})

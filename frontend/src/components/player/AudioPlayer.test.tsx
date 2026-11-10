// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'

import { AudioPlayer } from './AudioPlayer'
import type { AudioPlayerHandle } from './AudioPlayer'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AudioPlayer', () => {
  it('loads a signed audio source and seeks after it is ready', async () => {
    const getPlayback = vi.fn().mockResolvedValue({
      video_id: 'audio-uuid',
      url: 'https://storage.example.test/signed-audio-url',
      expires_in: 3600,
      media_type: 'audio' as const,
    })
    const ref = createRef<AudioPlayerHandle>()

    render(
      <AudioPlayer
        ref={ref}
        videoId="audio-uuid"
        title="Lecture recording"
        getPlayback={getPlayback}
      />,
    )

    const audio = await screen.findByLabelText('Audio player: Lecture recording')

    expect(ref.current?.seekTo(5)).toBe(false)

    fireEvent.canPlay(audio)

    expect(ref.current?.seekTo(5)).toBe(true)
    expect((audio as HTMLAudioElement).currentTime).toBe(5)
    expect(getPlayback).toHaveBeenCalledWith('audio-uuid')
  })

  it('does not expose an invalid signed playback response', async () => {
    render(
      <AudioPlayer
        videoId="audio-uuid"
        title="Lecture recording"
        getPlayback={async () => {
          throw new Error('Audio playback unavailable.')
        }}
      />,
    )

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Audio playback unavailable.',
    )
  })
})

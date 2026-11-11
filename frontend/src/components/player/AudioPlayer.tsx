import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import type { AudioPlaybackResponse } from '../../types/video'

import './AudioPlayer.css'

export interface AudioPlayerHandle {
  seekTo(seconds: number): boolean
  getCurrentTime(): number | null
}

interface AudioPlayerProps {
  videoId: string
  title: string
  getPlayback(videoId: string): Promise<AudioPlaybackResponse>
  onReadyChange?: (ready: boolean) => void
  onUnavailable?: () => void
}

export const AudioPlayer = forwardRef<
  AudioPlayerHandle,
  AudioPlayerProps
>(function AudioPlayer(
  {
    videoId,
    title,
    getPlayback,
    onReadyChange,
    onUnavailable,
  },
  ref,
) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const requestGeneration = useRef(0)

  const loadPlayback = useCallback(async () => {
    const generation = ++requestGeneration.current
    setIsReady(false)
    setError(null)
    setPlaybackUrl(null)
    onReadyChange?.(false)

    try {
      const playback = await getPlayback(videoId)

      if (
        playback.video_id !== videoId ||
        playback.media_type !== 'audio'
      ) {
        throw new Error('Audio playback response did not match this recording.')
      }

      if (generation !== requestGeneration.current) return

      setPlaybackUrl(playback.url)
    } catch (caughtError) {
      const message = caughtError instanceof Error
        ? caughtError.message
        : 'Audio playback is unavailable.'

      if (generation !== requestGeneration.current) return
      setPlaybackUrl(null)
      setError(message)
      onUnavailable?.()
    }
  }, [getPlayback, onReadyChange, onUnavailable, videoId])

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number): boolean {
        const audio = audioRef.current

        if (
          !isReady ||
          !audio ||
          !Number.isFinite(seconds) ||
          seconds < 0
        ) {
          return false
        }

        audio.currentTime = seconds
        return true
      },
      getCurrentTime(): number | null {
        const seconds = audioRef.current?.currentTime

        return isReady &&
          typeof seconds === 'number' &&
          Number.isFinite(seconds) &&
          seconds >= 0
          ? seconds
          : null
      },
    }),
    [isReady],
  )

  useEffect(() => {
    let cancelled = false

    void loadPlayback().then(() => {
      if (cancelled) return
    })

    return () => {
      cancelled = true
      requestGeneration.current += 1
      setPlaybackUrl(null)
      onReadyChange?.(false)
    }
  }, [loadPlayback, onReadyChange])

  return (
    <div className="vm-audio-player">
      {playbackUrl && (
        <audio
          ref={audioRef}
          controls
          src={playbackUrl}
          aria-label={`Audio player: ${title}`}
          onCanPlay={() => {
            setIsReady(true)
            onReadyChange?.(true)
          }}
          onError={() => {
            setIsReady(false)
            onReadyChange?.(false)
            onUnavailable?.()
            setError('Audio playback expired or could not be loaded.')
          }}
        />
      )}

      {!playbackUrl && !error && (
        <p className="vm-audio-player-loading" role="status">
          Loading authenticated audio playback…
        </p>
      )}

      {error && (
        <div className="vm-audio-player-notice" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => { void loadPlayback() }}>
            Refresh audio link
          </button>
        </div>
      )}
    </div>
  )
})


import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { extractYouTubeVideoId } from '../../utils/youtube'

import './YouTubePlayer.css'

// Define only the YouTube API methods our application uses.
// This keeps the integration typed without a new dependency.
interface YTPlayerInstance {
  seekTo(seconds: number, allowSeekAhead: boolean): void
  destroy(): void
}

// YouTube passes the player instance through an event object.
interface YTPlayerEvent {
  target: YTPlayerInstance
}

// YouTube sends a numeric error code if playback fails.
interface YTPlayerErrorEvent {
  data: number
}

// Describe how a new YouTube player is constructed.
interface YTPlayerConstructor {
  new (
    element: HTMLElement,
    options: {
      videoId: string
      width?: string
      height?: string
      playerVars?: Record<string, string | number>
      events?: {
        onReady?: (event: YTPlayerEvent) => void
        onError?: (event: YTPlayerErrorEvent) => void
      }
    },
  ): YTPlayerInstance
}

// Describe the global YouTube API object.
interface YTNamespace {
  Player: YTPlayerConstructor
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

// Share the API-loading operation between player instances.
// This prevents inserting duplicate YouTube scripts.
let playerApiPromise: Promise<YTNamespace> | null = null

function loadYouTubePlayerApi(): Promise<YTNamespace> {
  // The API may already be available from an earlier player.
  if (window.YT?.Player) {
    return Promise.resolve(window.YT)
  }

  // Reuse an existing loading operation.
  if (playerApiPromise) {
    return playerApiPromise
  }

  playerApiPromise = new Promise<YTNamespace>(
    (resolve, reject) => {
      // YouTube invokes this global callback once its API loads.
      const previousCallback =
        window.onYouTubeIframeAPIReady

      window.onYouTubeIframeAPIReady = () => {
        previousCallback?.()

        if (window.YT?.Player) {
          resolve(window.YT)
        } else {
          playerApiPromise = null
          reject(
            new Error('YouTube Player API is unavailable.'),
          )
        }
      }

      // Avoid inserting another copy of the same script.
      const existing = document.querySelector(
        'script[data-videomind-youtube-api]',
      )

      if (existing) {
        return
      }

      const script = document.createElement('script')

      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.videomindYoutubeApi = 'true'

      script.onerror = () => {
        playerApiPromise = null
        reject(
          new Error('Unable to load YouTube Player API.'),
        )
      }

      document.head.appendChild(script)
    },
  )

  return playerApiPromise
}

// Expose only the operation needed by timestamp citations.
// Other components do not receive the raw YouTube player.
export interface YouTubePlayerHandle {
  seekTo(seconds: number): boolean
}

interface YouTubePlayerProps {
  sourceUrl: string
  title: string
  onReadyChange?: (ready: boolean) => void
}

export const YouTubePlayer = forwardRef<
  YouTubePlayerHandle,
  YouTubePlayerProps
>(function YouTubePlayer(
  { sourceUrl, title, onReadyChange },
  ref,
) {
  // Convert the source URL into a validated YouTube video ID.
  const videoId = extractYouTubeVideoId(sourceUrl)

  // React owns the outer container.
  // YouTube can replace its inner target element.
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the real YouTube player instance available for seeking.
  const playerRef = useRef<YTPlayerInstance | null>(null)

  // Track readiness and display meaningful errors.
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Let the parent request a seek only after the player is ready.
  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number): boolean {
        // Reject invalid timestamps and unavailable players.
        if (
          !playerRef.current ||
          !Number.isFinite(seconds) ||
          seconds < 0
        ) {
          return false
        }

        playerRef.current.seekTo(seconds, true)
        return true
      },
    }),
    [],
  )

  useEffect(() => {
    let cancelled = false
    let instance: YTPlayerInstance | null = null

    const container = containerRef.current

    // Clear readiness and errors when selecting a new video.
    setIsReady(false)
    setError(null)
    onReadyChange?.(false)

    // An invalid URL must never initialize a YouTube player.
    if (!container || !videoId) {
      return
    }

    // Create a child for the YouTube API to replace.
    const target = document.createElement('div')
    container.appendChild(target)

    async function initializePlayer() {
      try {
        // Load Google's official API if it is not already ready.
        const YT = await loadYouTubePlayerApi()

        // Ignore loading results after this component is removed.
        if (cancelled) return

        instance = new YT.Player(target, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              if (cancelled) return

              // Only a ready player can receive seek commands.
              playerRef.current = event.target
              setIsReady(true)
              setError(null)
              onReadyChange?.(true)
            },

            onError: (event) => {
              if (cancelled) return

              // Do not allow seeking after a playback error.
              playerRef.current = null
              setIsReady(false)
              onReadyChange?.(false)

              const blocked = [
                100,
                101,
                150,
                153,
              ].includes(event.data)

              setError(
                blocked
                  ? 'This video cannot be played here. Open it on YouTube instead.'
                  : 'The YouTube player encountered an error.',
              )
            },
          },
        })
      } catch (caughtError) {
        if (cancelled) return

        playerRef.current = null
        setIsReady(false)
        onReadyChange?.(false)

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to initialize the YouTube player.',
        )
      }
    }

    void initializePlayer()

    // Clean up the old player when the URL changes or
    // the React component is removed.
    return () => {
      cancelled = true

      playerRef.current = null
      onReadyChange?.(false)

      // Release the YouTube player instance.
      instance?.destroy()

      // Remove only elements controlled by YouTube.
      container.replaceChildren()
    }
  }, [videoId, onReadyChange])

  // Render a safe fallback for invalid source URLs.
  if (!videoId) {
    return (
      <div
        className="vm-youtube-player vm-youtube-player-error"
        role="status"
      >
        <p>This is not a supported YouTube video URL.</p>
      </div>
    )
  }

  return (
    <div className="vm-youtube-player">
      {/* YouTube creates the embedded iframe here. */}
      <div
        ref={containerRef}
        className="vm-youtube-player-frame"
        aria-label={`YouTube player: ${title}`}
      />

      {/* Explain errors instead of showing a fake player. */}
      {error && (
        <div
          className="vm-youtube-player-notice"
          role="alert"
        >
          <p>{error}</p>
        </div>
      )}

      {/* Keep the user informed during API initialization. */}
      {!error && !isReady && (
        <span
          className="vm-youtube-player-loading"
          role="status"
        >
          Loading YouTube player…
        </span>
      )}
    </div>
  )
})

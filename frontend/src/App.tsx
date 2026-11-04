
import { useEffect, useState } from 'react'
import {
  ingestVideo,
  getVideoStatus,
} from './services/api/videos'
import type {
  VideoStatus,
  VideoStatusResponse,
} from './types/video'
import './App.css'

function App() {
  // Store the URL entered by the user.
  const [videoUrl, setVideoUrl] = useState('')

  // Track the initial submission request.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Store the submitted video identifier.
  const [videoId, setVideoId] = useState<string | null>(null)

  // Track the video's current processing state.
  const [status, setStatus] = useState<VideoStatus | null>(null)

  // Store optional video information.
  const [videoTitle, setVideoTitle] = useState<string | null>(null)

  // Store errors for display.
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setVideoId(null)
    setStatus(null)
    setVideoTitle(null)

    try {
      const response = await ingestVideo({
        url: videoUrl.trim(),
      })

      setStatus(response.status)
      setVideoId(response.video_id)
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to submit the video.'

      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Poll the backend when a video ID is available.
  useEffect(() => {
    if (!videoId) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    async function checkStatus() {
      try {
        const response: VideoStatusResponse =
          await getVideoStatus(videoId!)

        // Ignore results from an effect that has been cleaned up.
        if (cancelled) return

        setStatus(response.status)
        setVideoTitle(response.title ?? null)

        // Keep polling only while processing is incomplete.
        if (
          response.status === 'queued' ||
          response.status === 'processing'
        ) {
          timeoutId = setTimeout(checkStatus, 1000)
        }
      } catch (caughtError) {
        if (cancelled) return

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to check video status.',
        )
      }
    }

    void checkStatus()

    // Stop polling if the selected video changes or React cleans up.
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [videoId])

  return (
    <main>
      <header>
        <h1>VideoMind AI</h1>
        <p>Turn YouTube videos into interactive learning experiences.</p>
      </header>

      <section>
        <h2>Add a video</h2>

        <form onSubmit={handleSubmit}>
          <label htmlFor="video-url">YouTube URL</label>

          <input
            id="video-url"
            type="url"
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={isSubmitting}
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Add Video'}
          </button>
        </form>

        {videoId && (
          <section aria-label="Video processing status">
            <p>Video ID: {videoId}</p>
            <p role="status">Status: {status ?? 'checking'}</p>

            {status === 'ready' && (
              <p>
                Video ready: {videoTitle ?? 'Untitled video'}
              </p>
            )}
          </section>
        )}

        {error && <p role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default App

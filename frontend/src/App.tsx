
import { useEffect, useState } from 'react'
import { videoApi } from './services/api'
import type {
  VideoStatus,
  VideoStatusResponse,
} from './types/video'
import './App.css'

function App() {
  // Store the URL entered by the user.
  const [videoUrl, setVideoUrl] = useState('')

  // Track whether a video submission is in progress.
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Store the video ID returned by the API.
  const [videoId, setVideoId] = useState<string | null>(null)

  // Track the video's current processing status.
  const [status, setStatus] = useState<VideoStatus | null>(null)

  // Store the video title when processing finishes.
  const [videoTitle, setVideoTitle] = useState<string | null>(null)

  // Store errors so they can be displayed to the user.
  const [error, setError] = useState<string | null>(null)

  // Submit a YouTube URL using our selected API adapter.
  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    // Prevent the browser from refreshing the page.
    event.preventDefault()

    // Prevent repeated submissions while one is running.
    if (isSubmitting) return

    // Reset the previous video result before submitting another.
    setIsSubmitting(true)
    setError(null)
    setVideoId(null)
    setStatus(null)
    setVideoTitle(null)

    try {
      // Submit the URL through the common API interface.
      const response = await videoApi.ingestVideo({
        url: videoUrl.trim(),
      })

      // Store the response in React state.
      setStatus(response.status)
      setVideoId(response.video_id)
    } catch (caughtError) {
      // Convert a failed request into a readable message.
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to submit the video.'

      setError(message)
    } finally {
      // Re-enable the form after the request finishes.
      setIsSubmitting(false)
    }
  }

  // Automatically check the video's status after submission.
  useEffect(() => {
    // No video means there is nothing to monitor.
    if (!videoId) return

    // Capture the ID so TypeScript knows it cannot be null here.
    const currentVideoId = videoId

    // Track whether React has cleaned up this effect.
    let cancelled = false

    // Store the next scheduled polling operation.
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    async function checkStatus() {
      try {
        // Ask the selected API adapter for the current status.
        const response: VideoStatusResponse =
          await videoApi.getVideoStatus(currentVideoId)

        // Ignore responses from an outdated effect.
        if (cancelled) return

        // Update the interface with the latest information.
        setStatus(response.status)
        setVideoTitle(response.title ?? null)

        // Stop polling if the backend reports a failure.
        if (response.status === 'failed') {
          setError(response.error ?? 'Video processing failed.')
          return
        }

        // Check again only while processing is incomplete.
        if (
          response.status === 'queued' ||
          response.status === 'processing'
        ) {
          timeoutId = setTimeout(checkStatus, 1000)
        }
      } catch (caughtError) {
        // Ignore errors from a request that is no longer relevant.
        if (cancelled) return

        // Display the error and stop polling.
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to check video status.'

        setError(message)
      }
    }

    // Start checking immediately.
    void checkStatus()

    // Cancel future checks if the component or video changes.
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

            <p role="status">
              Status: {status ?? 'checking'}
            </p>

            {status === 'ready' && (
              <p>
                Video ready: {videoTitle ?? 'Untitled video'}
              </p>
            )}
          </section>
        )}

        {error && (
          <p role="alert">{error}</p>
        )}
      </section>
    </main>
  )
}

export default App

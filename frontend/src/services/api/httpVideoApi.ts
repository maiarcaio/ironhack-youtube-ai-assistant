
import type { VideoApi } from './VideoApi'
import type {
  IngestVideoRequest,
  IngestVideoResponse,
  VideoStatusResponse,
} from '../../types/video'

import {
  validateIngestVideoResponse,
  validateVideoStatusResponse,
} from './validators'

// Maximum waiting time for each HTTP request: 10 seconds.
const REQUEST_TIMEOUT_MS = 10_000

// Send an HTTP request and retrieve its JSON response.
// We return unknown because external data has not been validated yet.
async function requestJson(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  // Create a controller that can cancel the request.
  const controller = new AbortController()

  // Cancel the request if it exceeds the time limit.
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    // Make the request using the cancellation signal.
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    // HTTP error responses do not automatically cause fetch to throw.
    if (!response.ok) {
      throw new Error(`API request failed (${response.status})`)
    }

    // Parse JSON without assuming its structure is correct.
    return await response.json()
  } catch (error) {
    // Preserve the original error when reporting a timeout.
    if (controller.signal.aborted) {
      throw new Error(
        'The request timed out. Please try again.',
        { cause: error },
      )
    }

    // Preserve other HTTP and network errors.
    throw error
  } finally {
    // Clean up the timer after success or failure.
    clearTimeout(timeoutId)
  }
}

// Create the real HTTP implementation of the VideoApi interface.
export function createHttpVideoApi(baseUrl: string): VideoApi {
  // Remove trailing slashes from the backend URL.
  const apiBase = baseUrl.replace(/\/+$/, '')

  return {
    // Submit a YouTube URL to the backend.
    async ingestVideo(
      request: IngestVideoRequest,
    ): Promise<IngestVideoResponse> {
      const data = await requestJson(
        `${apiBase}/api/videos/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        },
      )

      // Validate the actual response before returning it to React.
      return validateIngestVideoResponse(data)
    },

    // Retrieve the processing status of a video.
    async getVideoStatus(
      videoId: string,
    ): Promise<VideoStatusResponse> {
      const data = await requestJson(
        `${apiBase}/api/videos/${encodeURIComponent(videoId)}/status`,
      )

      // Reject malformed responses before they reach our UI.
      return validateVideoStatusResponse(data)
    },
  }
}

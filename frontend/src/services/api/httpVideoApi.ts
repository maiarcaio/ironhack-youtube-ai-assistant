
import type { VideoApi } from './VideoApi'

import type {
  AudioPlaybackResponse,
  IngestVideoRequest,
  IngestVideoResponse,
  VideoListResponse,
  VideoStatusResponse,
} from '../../types/video'

import {
  validateIngestVideoResponse,
  validateVideoListResponse,
  validateVideoStatusResponse,
} from './validators'

// Stop individual HTTP requests after 10 seconds.
const REQUEST_TIMEOUT_MS = 10_000

// Parse responses as unknown data until they are validated.
async function requestJson(
  url: string,
  options: RequestInit = {},
): Promise<unknown> {
  const controller = new AbortController()

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })

    // HTTP failures must be handled explicitly.
    if (!response.ok) {
      throw new Error(`API request failed (${response.status})`)
    }

    if (response.status === 204) return undefined
    return await response.json()
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The request timed out. Please try again.',
        { cause: error },
      )
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Create a FastAPI-backed implementation of VideoApi.
export function createHttpVideoApi(baseUrl: string): VideoApi {
  const apiBase = baseUrl.replace(/\/+$/, '')

  return {
    // POST /api/v1/videos/ingest
    async ingestVideo(
      request: IngestVideoRequest,
    ): Promise<IngestVideoResponse> {
      const data = await requestJson(
        `${apiBase}/api/v1/videos/ingest`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        },
      )

      return validateIngestVideoResponse(data)
    },

    async uploadAudio(): Promise<IngestVideoResponse> {
      throw new Error('Audio upload requires an authenticated session.')
    },

    async getAudioPlayback(): Promise<AudioPlaybackResponse> {
      throw new Error('Audio playback requires an authenticated session.')
    },

    // GET /api/v1/videos/{video_id}/status
    async getVideoStatus(
      videoId: string,
    ): Promise<VideoStatusResponse> {
      const data = await requestJson(
        `${apiBase}/api/v1/videos/${encodeURIComponent(videoId)}/status`,
      )

      return validateVideoStatusResponse(data)
    },

    // GET /api/v1/videos
    async listVideos(): Promise<VideoListResponse> {
      const data = await requestJson(
        `${apiBase}/api/v1/videos`,
      )

      return validateVideoListResponse(data)
    },

    async listArchivedVideos(): Promise<VideoListResponse> {
      const data = await requestJson(`${apiBase}/api/v1/videos?archived=true`)
      return validateVideoListResponse(data)
    },
    async archiveVideo(videoId: string): Promise<void> { await requestJson(`${apiBase}/api/v1/videos/${encodeURIComponent(videoId)}/archive`, { method: 'POST' }) },
    async restoreVideo(videoId: string): Promise<void> { await requestJson(`${apiBase}/api/v1/videos/${encodeURIComponent(videoId)}/restore`, { method: 'POST' }) },
    async deleteVideo(videoId: string): Promise<void> { await requestJson(`${apiBase}/api/v1/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' }) },
  }
}

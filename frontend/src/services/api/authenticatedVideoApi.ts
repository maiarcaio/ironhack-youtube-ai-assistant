
import type { VideoApi } from './VideoApi'

import type {
  AudioPlaybackResponse,
  IngestVideoRequest,
  IngestVideoResponse,
  VideoListResponse,
  VideoStatusResponse,
} from '../../types/video'

import {
  validateAudioPlaybackResponse,
  validateIngestVideoResponse,
  validateVideoListResponse,
  validateVideoStatusResponse,
} from './validators'

// Authentication is supplied by the frontend's Supabase
// session manager, never by a hardcoded or secret API key.
export type AccessTokenProvider = () => Promise<
  string | null
>

const REQUEST_TIMEOUT_MS = 15_000
const AUDIO_UPLOAD_TIMEOUT_MS = 120_000

function getApiError(
  status: number,
  detail: string | null,
): Error {
  if (status === 401) {
    return new Error(
      'Your session has expired. Please sign in again.',
    )
  }

  if (status === 403) {
    return new Error(
      'You do not have permission to access this video.',
    )
  }

  if (status === 404) {
    return new Error(
      'The requested video was not found.',
    )
  }

  if (status === 409) {
    return new Error(
      detail ?? 'The video is not ready for this operation.',
    )
  }

  return new Error(
    detail ?? `Backend request failed (HTTP ${status}).`,
  )
}

export function createAuthenticatedVideoApi(
  baseUrl: string,
  getAccessToken: AccessTokenProvider,
): VideoApi {
  const apiBase = baseUrl.replace(/\/+$/, '')

  async function requestJson(
    path: string,
    options: RequestInit = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<unknown> {
    // Resolve a fresh token for every API request.
    // Supabase may refresh sessions between requests.
    const accessToken = await getAccessToken()

    if (!accessToken) {
      throw new Error(
        'Please sign in before accessing your video library.',
      )
    }

    const controller = new AbortController()

    const timeoutId = setTimeout(() => {
      controller.abort()
    }, timeoutMs)

    try {
      const response = await fetch(
        `${apiBase}${path}`,
        {
          ...options,
          signal: controller.signal,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        },
      )

      if (!response.ok) {
        let detail: string | null = null

        try {
          const body: unknown = await response.json()

          if (
            typeof body === 'object' &&
            body !== null &&
            'detail' in body &&
            typeof body.detail === 'string'
          ) {
            detail = body.detail
          }
        } catch {
          // Some errors have no JSON response body.
        }

        throw getApiError(response.status, detail)
      }

      if (response.status === 204) return undefined
      return (await response.json()) as unknown
    } catch (error) {
      if (controller.signal.aborted) {
        const isUpload = path === '/api/v1/videos/upload'
        throw new Error(
          isUpload
            ? 'The upload request timed out. It may still have been accepted; refresh your library before trying again.'
            : 'The backend request timed out.',
          { cause: error },
        )
      }

      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    async ingestVideo(
      request: IngestVideoRequest,
    ): Promise<IngestVideoResponse> {
      // The backend creates the library UUID and queue job.
      // Never replace that UUID with the YouTube video ID.
      const result = await requestJson(
        '/api/v1/videos/ingest',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        },
      )

      return validateIngestVideoResponse(result)
    },

    async uploadAudio(file: File): Promise<IngestVideoResponse> {
      const formData = new FormData()
      formData.append('file', file)

      const result = await requestJson(
        '/api/v1/videos/upload',
        {
          method: 'POST',
          body: formData,
        },
        AUDIO_UPLOAD_TIMEOUT_MS,
      )

      return validateIngestVideoResponse(result)
    },

    async getAudioPlayback(
      videoId: string,
    ): Promise<AudioPlaybackResponse> {
      const result = await requestJson(
        `/api/v1/videos/${encodeURIComponent(videoId)}/playback`,
      )

      const playback = validateAudioPlaybackResponse(result)

      if (playback.video_id !== videoId) {
        throw new Error('Audio playback response did not match the requested recording.')
      }

      return playback
    },

    async getVideoStatus(
      videoId: string,
    ): Promise<VideoStatusResponse> {
      const result = await requestJson(
        `/api/v1/videos/${encodeURIComponent(videoId)}/status`,
      )

      // Existing validators convert completed -> ready.
      return validateVideoStatusResponse(result)
    },

    async listVideos(): Promise<VideoListResponse> {
      const result = await requestJson(
        '/api/v1/videos',
      )

      // The backend returns only the authenticated
      // user's videos. The client must not invent records.
      return validateVideoListResponse(result)
    },

    async listArchivedVideos(): Promise<VideoListResponse> {
      const result = await requestJson('/api/v1/videos?archived=true')
      return validateVideoListResponse(result)
    },

    async archiveVideo(videoId: string): Promise<void> {
      await requestJson(`/api/v1/videos/${encodeURIComponent(videoId)}/archive`, { method: 'POST' })
    },

    async restoreVideo(videoId: string): Promise<void> {
      await requestJson(`/api/v1/videos/${encodeURIComponent(videoId)}/restore`, { method: 'POST' })
    },

    async deleteVideo(videoId: string): Promise<void> {
      await requestJson(`/api/v1/videos/${encodeURIComponent(videoId)}`, { method: 'DELETE' })
    },
  }
}

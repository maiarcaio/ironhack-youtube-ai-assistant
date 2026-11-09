
import type { VideoApi } from './VideoApi'

import type {
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

// Authentication is supplied by the frontend's Supabase
// session manager, never by a hardcoded or secret API key.
export type AccessTokenProvider = () => Promise<
  string | null
>

const REQUEST_TIMEOUT_MS = 15_000

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
    }, REQUEST_TIMEOUT_MS)

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

      return (await response.json()) as unknown
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(
          'The backend request timed out.',
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
  }
}

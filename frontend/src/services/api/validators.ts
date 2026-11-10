
import type {
  AudioPlaybackResponse,
  IngestVideoResponse,
  VideoLibraryItem,
  VideoListResponse,
  VideoStatus,
  VideoStatusResponse,
} from '../../types/video'

// These are the status values defined in Diogo's FastAPI V1.
type BackendVideoStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'

// Check that an unknown JSON value is a regular object.
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

// Check whether a status is valid according to OpenAPI V1.
function isBackendVideoStatus(
  value: unknown,
): value is BackendVideoStatus {
  return (
    value === 'queued' ||
    value === 'processing' ||
    value === 'completed' ||
    value === 'failed'
  )
}

// Convert the backend's "completed" status into our UI's "ready".
function toFrontendStatus(
  status: BackendVideoStatus,
): VideoStatus {
  return status === 'completed' ? 'ready' : status
}

// Validate the response from POST /api/v1/videos/ingest.
export function validateIngestVideoResponse(
  value: unknown,
): IngestVideoResponse {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    value.status !== 'queued'
  ) {
    throw new Error(
      'Invalid video ingestion response from the API.',
    )
  }

  return {
    video_id: value.video_id,
    status: 'queued',
  }
}

export function validateAudioPlaybackResponse(
  value: unknown,
): AudioPlaybackResponse {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    typeof value.url !== 'string' ||
    !value.url.startsWith('https://') ||
    typeof value.expires_in !== 'number' ||
    !Number.isFinite(value.expires_in) ||
    value.expires_in <= 0 ||
    value.media_type !== 'audio'
  ) {
    throw new Error('Invalid audio playback response from the API.')
  }

  return {
    video_id: value.video_id,
    url: value.url,
    expires_in: value.expires_in,
    media_type: 'audio',
  }
}

// Validate the response from GET /api/v1/videos/{video_id}/status.
export function validateVideoStatusResponse(
  value: unknown,
): VideoStatusResponse {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    !isBackendVideoStatus(value.status)
  ) {
    throw new Error(
      'Invalid video status response from the API.',
    )
  }

  // The error field can be a string, null, or omitted.
  if (
    value.error !== undefined &&
    value.error !== null &&
    typeof value.error !== 'string'
  ) {
    throw new Error(
      'Invalid video status response from the API.',
    )
  }

  return {
    video_id: value.video_id,
    status: toFrontendStatus(value.status),
    error:
      typeof value.error === 'string'
        ? value.error
        : null,
  }
}

// Validate one item from the FastAPI video library.
function validateVideoLibraryItem(
  value: unknown,
): VideoLibraryItem {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    typeof value.title !== 'string' ||
    !isBackendVideoStatus(value.status)
  ) {
    throw new Error(
      'Invalid video library response from the API.',
    )
  }

  // OpenAPI allows source_url to be a string, null, or absent.
  if (
    value.source_url !== undefined &&
    value.source_url !== null &&
    typeof value.source_url !== 'string'
  ) {
    throw new Error(
      'Invalid video library response from the API.',
    )
  }

  return {
    video_id: value.video_id,
    title: value.title,
    status: toFrontendStatus(value.status),
    source_url:
      typeof value.source_url === 'string'
        ? value.source_url
        : null,
  }
}

// Validate the response from GET /api/v1/videos.
export function validateVideoListResponse(
  value: unknown,
): VideoListResponse {
  // First confirm that the response contains a videos array.
  if (!isRecord(value) || !Array.isArray(value.videos)) {
    throw new Error(
      'Invalid video library response from the API.',
    )
  }

  // Validate every video before returning data to the frontend.
  return {
    videos: value.videos.map(validateVideoLibraryItem),
  }
}

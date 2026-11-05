
import type {
  IngestVideoResponse,
  VideoStatus,
  VideoStatusResponse,
} from '../../types/video'

// Define the processing states supported by our frontend.
const VALID_STATUSES: VideoStatus[] = [
  'queued',
  'processing',
  'ready',
  'failed',
]

// Check whether an unknown value is a regular JavaScript object.
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

// Check whether the backend returned a supported processing status.
function isVideoStatus(value: unknown): value is VideoStatus {
  return VALID_STATUSES.some((status) => status === value)
}

// Validate the response returned when a video is submitted.
// The export keyword allows other files to import this function.
export function validateIngestVideoResponse(
  value: unknown,
): IngestVideoResponse {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    !isVideoStatus(value.status)
  ) {
    throw new Error('Invalid video ingestion response from the API.')
  }

  // Return only the fields that passed validation.
  return {
    video_id: value.video_id,
    status: value.status,
  }
}

// Validate the response returned when checking a video's status.
export function validateVideoStatusResponse(
  value: unknown,
): VideoStatusResponse {
  if (
    !isRecord(value) ||
    typeof value.video_id !== 'string' ||
    value.video_id.trim() === '' ||
    !isVideoStatus(value.status)
  ) {
    throw new Error('Invalid video status response from the API.')
  }

  // Optional fields may be strings, null, or absent.
  if (
    value.title !== undefined &&
    value.title !== null &&
    typeof value.title !== 'string'
  ) {
    throw new Error('Invalid video status response from the API.')
  }

  if (
    value.thumbnail_url !== undefined &&
    value.thumbnail_url !== null &&
    typeof value.thumbnail_url !== 'string'
  ) {
    throw new Error('Invalid video status response from the API.')
  }

  if (
    value.error !== undefined &&
    value.error !== null &&
    typeof value.error !== 'string'
  ) {
    throw new Error('Invalid video status response from the API.')
  }

  // Return a response containing the validated information.
  return {
    video_id: value.video_id,
    status: value.status,
    title: value.title as string | null | undefined,
    thumbnail_url: value.thumbnail_url as string | null | undefined,
    error: value.error as string | null | undefined,
  }
}

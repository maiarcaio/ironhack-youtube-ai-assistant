
import type {
  ChatResponse,
  ChatSource,
  ChatSourceType,
} from '../../types/chat'

// Check whether a value is an object, not an array or null.
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

// A useful identifier must contain non-whitespace text.
function isNonEmptyString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0
  )
}

// Only accept the evidence types defined by FastAPI.
function isSourceType(
  value: unknown,
): value is ChatSourceType {
  return value === 'transcript' || value === 'frame'
}

// Validate optional numeric timestamps.
//
// OpenAPI permits a number, null, or an omitted field.
// When omitted, we normalize the value to null.
function isOptionalTimestamp(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0)
  )
}

// Validate one evidence source.
function validateChatSource(value: unknown): ChatSource {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.chunk_id) ||
    typeof value.excerpt !== 'string' ||
    !isOptionalTimestamp(value.start_seconds) ||
    !isOptionalTimestamp(value.end_seconds) ||
    (value.source_type !== undefined &&
      !isSourceType(value.source_type))
  ) {
    throw new Error('Invalid chat response from the API.')
  }

  // Convert missing timestamps into explicit null values.
  const startSeconds =
    typeof value.start_seconds === 'number'
      ? value.start_seconds
      : null

  const endSeconds =
    typeof value.end_seconds === 'number'
      ? value.end_seconds
      : null

  // Reject contradictory time intervals.
  if (
    startSeconds !== null &&
    endSeconds !== null &&
    endSeconds < startSeconds
  ) {
    throw new Error('Invalid chat response from the API.')
  }

  return {
    chunk_id: value.chunk_id,
    excerpt: value.excerpt,
    start_seconds: startSeconds,
    end_seconds: endSeconds,

    // FastAPI defaults source_type to "transcript".
    source_type:
      isSourceType(value.source_type)
        ? value.source_type
        : 'transcript',
  }
}

// Validate the entire POST /api/v1/chat response.
export function validateChatResponse(
  value: unknown,
): ChatResponse {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.video_id) ||
    !isNonEmptyString(value.thread_id) ||
    typeof value.answer !== 'string' ||
    !Array.isArray(value.sources) ||
    typeof value.insufficient_evidence !== 'boolean'
  ) {
    throw new Error('Invalid chat response from the API.')
  }

  // The model name can be a string, null, or absent.
  if (
    value.model_used !== undefined &&
    value.model_used !== null &&
    typeof value.model_used !== 'string'
  ) {
    throw new Error('Invalid chat response from the API.')
  }

  return {
    video_id: value.video_id,
    thread_id: value.thread_id,
    answer: value.answer,

    // Check every evidence item independently.
    sources: value.sources.map(validateChatSource),

    insufficient_evidence: value.insufficient_evidence,
    model_used:
      typeof value.model_used === 'string'
        ? value.model_used
        : null,
  }
}

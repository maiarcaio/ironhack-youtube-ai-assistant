
/**
 * VideoMind AI — FastAPI integration.
 *
 * Supports:
 * 1. Manual transcript upload (TXT, SRT, VTT).
 * 2. Chat with a selected video.
 * 3. Server-Sent Events (SSE) streaming.
 *
 * This module does not use the unfinished YouTube ingestion API.
 */

// Keep the fallback origin identical to the authenticated video client.
// A host mismatch can bypass a backend's CORS allowlist in local development.
const DEFAULT_API_URL = 'http://localhost:8000'

const API_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_URL
).replace(/\/+$/, '')

// Match the upload restrictions enforced by FastAPI.
const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.txt', '.srt', '.vtt']

export type AccessTokenProvider = () => Promise<string | null>

async function authenticatedHeaders(
  getAccessToken?: AccessTokenProvider,
): Promise<Record<string, string>> {
  if (!getAccessToken) return {}

  const accessToken = await getAccessToken()
  if (!accessToken) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  return { Authorization: `Bearer ${accessToken}` }
}

export interface TranscriptUploadResult {
  video_id: string
  status: 'completed'
  chunks_count: number
}

export interface TranscriptSource {
  chunk_id: string
  excerpt: string
  start_seconds: number | null
  end_seconds: number | null
  source_type: 'transcript' | 'frame'
}

export interface ChatRequest {
  video_id: string
  message: string
  thread_id?: string | null
  analysis_mode?: 'auto' | 'deep'
}

export interface ChatResult {
  video_id: string
  thread_id: string
  answer: string
  sources: TranscriptSource[]
  insufficient_evidence: boolean
  model_used: string | null
}

export interface StreamCallbacks {
  onMeta?: (meta: {
    video_id: string
    thread_id: string
  }) => void
  onToken?: (text: string) => void
  onSources?: (sources: TranscriptSource[]) => void
  onDone?: (result: {
    thread_id: string
    answer: string
    model_used: string | null
    insufficient_evidence: boolean
  }) => void
}

// Validate that an API response is a JSON object.
function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

// Return a useful error message from FastAPI responses.
async function getHttpError(
  response: Response,
): Promise<Error> {
  let detail = `Backend request failed (${response.status}).`

  try {
    const body: unknown = await response.json()

    if (isRecord(body) && typeof body.detail === 'string') {
      detail = body.detail
    }
  } catch {
    // Keep the HTTP status if no JSON error was returned.
  }

  return new Error(detail)
}

// Check the file before sending it to the backend.
function validateTranscriptFile(file: File): void {
  const filename = file.name.toLowerCase()

  if (
    !ALLOWED_EXTENSIONS.some((extension) =>
      filename.endsWith(extension),
    )
  ) {
    throw new Error(
      'Choose a TXT, SRT, or VTT transcript.',
    )
  }

  if (file.size === 0) {
    throw new Error('The transcript file is empty.')
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error('The maximum file size is 2 MB.')
  }
}

/**
 * Upload a transcript for an existing video ID.
 *
 * The backend expects multipart/form-data with:
 * - video_id
 * - file
 *
 * Do not manually set Content-Type: the browser generates
 * the required multipart boundary.
 */
export async function uploadTranscript(
  videoId: string,
  file: File,
  signal?: AbortSignal,
  getAccessToken?: AccessTokenProvider,
): Promise<TranscriptUploadResult> {
  if (!videoId.trim()) {
    throw new Error('A video ID is required.')
  }

  validateTranscriptFile(file)

  const formData = new FormData()
  formData.append('video_id', videoId)
  formData.append('file', file)

  const headers = await authenticatedHeaders(getAccessToken)

  const response = await fetch(
    `${API_URL}/api/v1/transcripts/upload`,
    {
      method: 'POST',
      body: formData,
      signal,
      // Omit headers in public/mock calls so the browser owns multipart boundaries.
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    },
  )

  if (!response.ok) {
    throw await getHttpError(response)
  }

  const result: unknown = await response.json()

  if (
    !isRecord(result) ||
    typeof result.video_id !== 'string' ||
    result.video_id !== videoId ||
    result.status !== 'completed' ||
    typeof result.chunks_count !== 'number' ||
    !Number.isInteger(result.chunks_count) ||
    result.chunks_count < 1
  ) {
    throw new Error(
      'The backend returned an invalid upload response.',
    )
  }

  return {
    video_id: result.video_id,
    status: 'completed',
    chunks_count: result.chunks_count,
  }
}

/**
 * Send a regular, non-streaming RAG chat request.
 */
export async function askVideoQuestion(
  request: ChatRequest,
  signal?: AbortSignal,
  getAccessToken?: AccessTokenProvider,
): Promise<ChatResult> {
  const response = await fetch(`${API_URL}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authenticatedHeaders(getAccessToken)),
    },
    body: JSON.stringify({
  ...request,
  analysis_mode: request.analysis_mode ?? 'auto',
  response_language: null,
}),
    signal,
  })

  if (!response.ok) {
    throw await getHttpError(response)
  }

  const result: unknown = await response.json()

  if (
    !isRecord(result) ||
    typeof result.video_id !== 'string' ||
    typeof result.thread_id !== 'string' ||
    typeof result.answer !== 'string' ||
    !Array.isArray(result.sources) ||
    typeof result.insufficient_evidence !== 'boolean'
  ) {
    throw new Error('Invalid chat response from the backend.')
  }

  return result as unknown as ChatResult
}

/**
 * Parse one complete SSE event block.
 *
 * SSE events arrive as:
 *
 * event: token
 * data: {"text":"Hello"}
 *
 * A blank line separates consecutive events.
 */
function parseSseBlock(
  block: string,
): { event: string; data: unknown } | null {
  let event = 'message'
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) return null

  return {
    event,
    data: JSON.parse(dataLines.join('\n')) as unknown,
  }
}

/**
 * Stream an answer from FastAPI using fetch().
 *
 * We use fetch instead of EventSource because the backend
 * requires a POST request with a JSON body.
 *
 * The caller receives events as tokens arrive.
 */
export async function streamVideoQuestion(
  request: ChatRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  getAccessToken?: AccessTokenProvider,
): Promise<void> {
  if (!request.video_id.trim()) {
    throw new Error('A video ID is required.')
  }

  if (
    !request.message.trim() ||
    request.message.length > 500
  ) {
    throw new Error(
      'Your question must contain 1–500 characters.',
    )
  }

  const response = await fetch(
    `${API_URL}/api/v1/chat/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(await authenticatedHeaders(getAccessToken)),
      },
      body: JSON.stringify({
        ...request,
        analysis_mode: request.analysis_mode ?? 'auto',
        response_language: null,
      }),
      signal,
    },
  )

  if (!response.ok) {
    throw await getHttpError(response)
  }

  if (!response.body) {
    throw new Error('The backend did not return a stream.')
  }

  const contentType =
    response.headers.get('content-type') || ''

  if (!contentType.includes('text/event-stream')) {
    throw new Error('The backend returned a non-SSE response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  let buffer = ''
  let completed = false

  // Dispatch the event only after parsing its JSON payload.
  function handleEvent(block: string): void {
    const parsed = parseSseBlock(block)
    if (!parsed) return

    const { event, data } = parsed

    if (!isRecord(data)) {
      throw new Error('Invalid streaming event payload.')
    }

    switch (event) {
      case 'meta':
        if (
          typeof data.video_id !== 'string' ||
          typeof data.thread_id !== 'string'
        ) {
          throw new Error('Invalid stream metadata.')
        }

        callbacks.onMeta?.({
          video_id: data.video_id,
          thread_id: data.thread_id,
        })
        break

      case 'token':
        if (typeof data.text !== 'string') {
          throw new Error('Invalid streamed token.')
        }

        callbacks.onToken?.(data.text)
        break

      case 'sources':
        if (!Array.isArray(data.sources)) {
          throw new Error('Invalid source citations.')
        }

        callbacks.onSources?.(
          data.sources as TranscriptSource[],
        )
        break

      case 'done':
        if (
          typeof data.thread_id !== 'string' ||
          typeof data.answer !== 'string' ||
          typeof data.insufficient_evidence !== 'boolean'
        ) {
          throw new Error('Invalid completion event.')
        }

        completed = true

        callbacks.onDone?.({
          thread_id: data.thread_id,
          answer: data.answer,
          model_used:
            typeof data.model_used === 'string'
              ? data.model_used
              : null,
          insufficient_evidence:
            data.insufficient_evidence,
        })
        break

      case 'error':
        throw new Error(
          typeof data.message === 'string'
            ? data.message
            : 'The AI response failed.',
        )
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()

      if (done) break

      // TextDecoder handles UTF-8 characters split across chunks.
      buffer += decoder.decode(value, { stream: true })

      // Normalize CRLF from HTTP streams.
      buffer = buffer.replace(/\r\n/g, '\n')

      // Process every complete SSE block in the buffer.
      let boundary = buffer.indexOf('\n\n')

      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        handleEvent(block)

        boundary = buffer.indexOf('\n\n')
      }
    }

    // Flush any remaining decoded text.
    buffer += decoder.decode()
    buffer = buffer.replace(/\r\n/g, '\n')

    if (buffer.trim()) {
      handleEvent(buffer.trim())
    }

    // A closed stream without "done" is not a valid completion.
    if (!completed) {
      throw new Error(
        'The AI response ended before completion.',
      )
    }
  } finally {
    reader.releaseLock()
  }
}

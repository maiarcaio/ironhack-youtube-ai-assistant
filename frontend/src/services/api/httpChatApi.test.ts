
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createHttpChatApi } from './httpChatApi'
import { validateChatResponse } from './chatValidators'

// Use a fake address; tests will not call the real backend.
const BASE_URL = 'http://localhost:8000'

// Restore real timers and network behavior after every test.
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// A realistic response matching Diogo's V1 contract.
function exampleChatResponse() {
  return {
    video_id: 'video-123',
    thread_id: 'thread-456',
    answer: 'The speaker discusses retrieval-augmented generation.',
    sources: [
      {
        chunk_id: 'chunk-001',
        excerpt: 'Retrieval connects a question to relevant evidence.',
        start_seconds: null,
        end_seconds: null,
        source_type: 'transcript',
      },
    ],
    insufficient_evidence: false,
    model_used: 'gpt-6.1-terra',
  }
}

describe('FastAPI V1 chat client', () => {
  it('sends the correct request and validates the answer', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(exampleChatResponse()), {
        status: 200,
      }),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpChatApi(BASE_URL)

    const result = await api.sendMessage({
      video_id: 'video-123',
      message: 'What does the speaker explain?',
    })

    expect(result.thread_id).toBe('thread-456')
    expect(result.sources).toHaveLength(1)

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/chat`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_id: 'video-123',
          message: 'What does the speaker explain?',
          analysis_mode: 'auto',
          thread_id: null,
        }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('preserves an existing thread ID', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(exampleChatResponse()), {
        status: 200,
      }),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpChatApi(BASE_URL)

    await api.sendMessage({
      video_id: 'video-123',
      message: 'Explain further.',
      thread_id: 'thread-456',
    })

    const options = mockFetch.mock.calls[0][1] as RequestInit
    const body = JSON.parse(options.body as string)

    expect(body.thread_id).toBe('thread-456')
  })

  it('rejects responses for the wrong video', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...exampleChatResponse(),
            video_id: 'another-video',
          }),
          { status: 200 },
        ),
      ),
    )

    const api = createHttpChatApi(BASE_URL)

    await expect(
      api.sendMessage({
        video_id: 'video-123',
        message: 'Summarize the video.',
      }),
    ).rejects.toThrow('Chat response video ID mismatch.')
  })

  it('accepts an insufficient-evidence response', () => {
    const result = validateChatResponse({
      video_id: 'video-123',
      thread_id: 'thread-456',
      answer: 'No relevant information was found.',
      sources: [],
      insufficient_evidence: true,
    })

    expect(result.insufficient_evidence).toBe(true)
    expect(result.sources).toEqual([])
    expect(result.model_used).toBeNull()
  })

  it('rejects malformed evidence', () => {
    expect(() =>
      validateChatResponse({
        ...exampleChatResponse(),
        sources: [
          {
            chunk_id: 'chunk-001',
            excerpt: 'Evidence',
            start_seconds: 'not-a-number',
          },
        ],
      }),
    ).toThrow('Invalid chat response from the API.')
  })

  it('reports an HTTP 503 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, { status: 503 }),
      ),
    )

    const api = createHttpChatApi(BASE_URL)

    await expect(
      api.sendMessage({
        video_id: 'video-123',
        message: 'What happened?',
      }),
    ).rejects.toThrow('Chat request failed (503)')
  })

  it('rejects unsupported Deep Analysis locally', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpChatApi(BASE_URL)

    await expect(
      api.sendMessage({
        video_id: 'video-123',
        message: 'Analyze this.',
        analysis_mode: 'deep',
      }),
    ).rejects.toThrow('Deep Analysis is not available yet.')

    // No network request should be made.
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('times out a stalled chat request', async () => {
    vi.useFakeTimers()

    const mockFetch = vi.fn(
      (_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(
              new DOMException('Aborted', 'AbortError'),
            ),
            { once: true },
          )
        }),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpChatApi(BASE_URL)

    // Attach the assertion before advancing fake time.
    const assertion = expect(
      api.sendMessage({
        video_id: 'video-123',
        message: 'What is discussed?',
      }),
    ).rejects.toThrow(
      'The chat request timed out. Please try again.',
    )

    await vi.advanceTimersByTimeAsync(45_000)
    await assertion
  })
})

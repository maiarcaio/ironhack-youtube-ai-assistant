
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createHttpVideoApi } from './httpVideoApi'

// Simulated backend location.
const BASE_URL = 'http://localhost:8000'

// Restore network functions and timers after each test.
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('HTTP Video API adapter — FastAPI V1', () => {
  it('does not expose unauthenticated logical delete operations', async () => {
    await expect(createHttpVideoApi(BASE_URL).deleteVideo('video-123')).rejects.toThrow('requires an authenticated session')
  })
  // TEST 1: Verify video ingestion follows the OpenAPI V1 contract.
  it('sends a video ingestion request', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'video-123',
          status: 'queued',
        }),
        { status: 202 },
      ),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(BASE_URL)

    const result = await api.ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    expect(result.video_id).toBe('video-123')
    expect(result.status).toBe('queued')

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/videos/ingest`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  // TEST 2: Convert the backend "completed" status to UI "ready".
  it('retrieves and normalizes the video status', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'video-123',
          status: 'completed',
          error: null,
        }),
        { status: 200 },
      ),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(BASE_URL)
    const result = await api.getVideoStatus('video-123')

    expect(result.video_id).toBe('video-123')
    expect(result.status).toBe('ready')
    expect(result.error).toBeNull()

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/videos/video-123/status`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  // TEST 3: Report backend HTTP errors.
  it('reports an ingestion failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, { status: 500 }),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.ingestVideo({
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      }),
    ).rejects.toThrow('API request failed (500)')
  })

  // TEST 4: Preserve network connection errors.
  it('propagates a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('Failed to fetch'),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow('Failed to fetch')
  })

  // TEST 5: Verify cancellation after 10 seconds.
  it('cancels a request after the timeout', async () => {
    vi.useFakeTimers()

    // A hanging request rejects only when the signal is aborted.
    const mockFetch = vi.fn(
      (_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => {
              reject(
                new DOMException('Aborted', 'AbortError'),
              )
            },
            { once: true },
          )
        }),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(BASE_URL)

    // Attach the rejection assertion before advancing time.
    const timeoutAssertion = expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow(
      'The request timed out. Please try again.',
    )

    await vi.advanceTimersByTimeAsync(10_000)
    await timeoutAssertion

    expect(mockFetch).toHaveBeenCalledTimes(1)

    const requestOptions = mockFetch.mock.calls[0][1]
    expect(requestOptions?.signal?.aborted).toBe(true)
  })

  // TEST 6: Reject invalid ingestion responses.
  it('rejects an invalid video ingestion response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            video_id: 123,
            status: 'completed',
          }),
          { status: 202 },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.ingestVideo({
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      }),
    ).rejects.toThrow(
      'Invalid video ingestion response from the API.',
    )
  })

  // TEST 7: Reject incorrect status response types.
  it('rejects an invalid video status response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            video_id: 'video-123',
            status: 'completed',
            error: 42,
          }),
          { status: 200 },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow(
      'Invalid video status response from the API.',
    )
  })

  // TEST 8: The backend is not implemented yet.
  it('reports an HTTP 501 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: 'Video ingestion is not implemented yet.',
          }),
          { status: 501 },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.ingestVideo({
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      }),
    ).rejects.toThrow('API request failed (501)')
  })

  // TEST 9: Reject statuses outside the FastAPI V1 contract.
  it('rejects an unsupported backend status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            video_id: 'video-123',
            status: 'ready',
          }),
          { status: 200 },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    await expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow(
      'Invalid video status response from the API.',
    )
  })
})

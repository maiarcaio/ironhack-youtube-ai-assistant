
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createHttpVideoApi } from './httpVideoApi'

// Backend address used only during testing.
const BASE_URL = 'http://localhost:8000'

// Clean up after every test to prevent tests from affecting one another.
afterEach(() => {
  // Restore normal timers after tests that simulate time.
  vi.useRealTimers()

  // Restore the original global fetch function.
  vi.unstubAllGlobals()
})

describe('HTTP Video API adapter', () => {
  // TEST 1: Verify that ingestion sends the correct POST request.
  it('sends a video ingestion request', async () => {
    // Simulate a successful response from the backend.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'video-123',
          status: 'queued',
        }),
        {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    // Replace the real fetch function with our simulation.
    vi.stubGlobal('fetch', mockFetch)

    // Create the HTTP API client.
    const api = createHttpVideoApi(BASE_URL)

    // Simulate submitting a YouTube video.
    const result = await api.ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    // Verify the response.
    expect(result.video_id).toBe('video-123')
    expect(result.status).toBe('queued')

    // Verify the URL, method, headers, request body and cancellation signal.
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/videos/ingest`,
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

  // TEST 2: Verify that the client retrieves a video's status.
  it('retrieves the status of a video', async () => {
    // Simulate a video that has finished processing.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'video-123',
          status: 'ready',
          title: 'AI Engineering Introduction',
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      ),
    )

    // Replace fetch with the simulated response.
    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(BASE_URL)

    // Request the video status.
    const result = await api.getVideoStatus('video-123')

    // Verify the returned information.
    expect(result.video_id).toBe('video-123')
    expect(result.status).toBe('ready')
    expect(result.title).toBe('AI Engineering Introduction')

    // Verify the status endpoint and cancellation signal.
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/videos/video-123/status`,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
  })

  // TEST 3: Verify that HTTP errors are reported.
  it('reports an ingestion failure', async () => {
    // Simulate HTTP 500: Internal Server Error.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 500,
        }),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    // Verify that the client rejects the failed request.
    await expect(
      api.ingestVideo({
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      }),
    ).rejects.toThrow('API request failed (500)')
  })

  // TEST 4: Verify that network failures are preserved.
  it('propagates a network failure', async () => {
    // Simulate a connection failure rather than an HTTP response.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(
        new TypeError('Failed to fetch'),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    // Verify that the original network error is reported.
    await expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow('Failed to fetch')
  })

  // TEST 5: Verify that requests are cancelled after 10 seconds.
  it('cancels a request after the 10-second timeout', async () => {
    // Use a simulated clock instead of waiting 10 real seconds.
    vi.useFakeTimers()

    // Simulate a server that never responds unless cancelled.
    const mockFetch = vi.fn(
      (_url: string, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // Listen for the abort signal from AbortController.
          options?.signal?.addEventListener(
            'abort',
            () => {
              // Real fetch rejects with AbortError when cancelled.
              reject(new DOMException('Aborted', 'AbortError'))
            },
            { once: true },
          )
        }),
    )

    // Replace the real network function with our simulation.
    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(BASE_URL)

    // Start the request and attach the rejection assertion immediately.
    const timeoutAssertion = expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow(
      'The request timed out. Please try again.',
    )

    // Advance the simulated clock by exactly 10 seconds.
    await vi.advanceTimersByTimeAsync(10_000)

    // Confirm that the request was rejected with our timeout message.
    await timeoutAssertion

    // Verify that fetch was called exactly once.
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Read the options passed into fetch.
    const requestOptions = mockFetch.mock.calls[0][1]

    // Confirm the request's AbortSignal was actually aborted.
    expect(requestOptions?.signal?.aborted).toBe(true)
  })

  // TEST 6: Reject a video ingestion response containing invalid data.
  it('rejects an invalid video ingestion response', async () => {
    // Simulate a response with a numeric ID and unsupported status.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            video_id: 123,
            status: 'completed',
          }),
          {
            status: 202,
          },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    // The validator must reject data that violates our API contract.
    await expect(
      api.ingestVideo({
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      }),
    ).rejects.toThrow(
      'Invalid video ingestion response from the API.',
    )
  })

  // TEST 7: Reject a video status response with invalid metadata.
  it('rejects an invalid video status response', async () => {
    // Simulate a response with a number where a title string is expected.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            video_id: 'video-123',
            status: 'ready',
            title: 42,
          }),
          {
            status: 200,
          },
        ),
      ),
    )

    const api = createHttpVideoApi(BASE_URL)

    // The validator must detect the invalid title.
    await expect(
      api.getVideoStatus('video-123'),
    ).rejects.toThrow(
      'Invalid video status response from the API.',
    )
  })
})

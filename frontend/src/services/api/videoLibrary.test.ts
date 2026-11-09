
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createHttpVideoApi } from './httpVideoApi'
import { mockVideoApi } from './mockVideoApi'
import { validateVideoListResponse } from './validators'

// Restore the normal fetch function after every test.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FastAPI V1 video library', () => {
  it('calls the correct library endpoint', async () => {
    // Pretend FastAPI returned one completed video.
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          videos: [
            {
              video_id: 'video-123',
              title: 'Python Fundamentals',
              status: 'completed',
              source_url:
                'https://www.youtube.com/watch?v=jfKfPfyJRdk',
            },
          ],
        }),
        { status: 200 },
      ),
    )

    vi.stubGlobal('fetch', mockFetch)

    const api = createHttpVideoApi(
      'http://localhost:8000',
    )

    const result = await api.listVideos()

    // Verify that we call Diogo's actual V1 endpoint.
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/videos',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )

    expect(result.videos).toHaveLength(1)
    expect(result.videos[0].video_id).toBe('video-123')

    // The adapter converts backend statuses for React.
    expect(result.videos[0].status).toBe('ready')
  })

  it('accepts an empty video library', () => {
    const result = validateVideoListResponse({
      videos: [],
    })

    expect(result.videos).toEqual([])
  })

  it('accepts an omitted optional source URL', () => {
    const result = validateVideoListResponse({
      videos: [
        {
          video_id: 'video-456',
          title: 'AI Fundamentals',
          status: 'queued',
        },
      ],
    })

    expect(result.videos[0].source_url).toBeNull()
  })

  it('rejects a missing videos array', () => {
    expect(() =>
      validateVideoListResponse({}),
    ).toThrow(
      'Invalid video library response from the API.',
    )
  })

  it('rejects an unsupported backend status', () => {
    expect(() =>
      validateVideoListResponse({
        videos: [
          {
            video_id: 'video-123',
            title: 'Python Fundamentals',
            status: 'ready',
          },
        ],
      }),
    ).toThrow(
      'Invalid video library response from the API.',
    )
  })

  it('rejects an invalid video ID', () => {
    expect(() =>
      validateVideoListResponse({
        videos: [
          {
            video_id: 123,
            title: 'Python Fundamentals',
            status: 'completed',
          },
        ],
      }),
    ).toThrow(
      'Invalid video library response from the API.',
    )
  })

  it('handles an unimplemented backend library', async () => {
    // HTTP 501 means FastAPI has not implemented this route.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: 'Video library is not implemented yet.',
          }),
          { status: 501 },
        ),
      ),
    )

    const api = createHttpVideoApi(
      'http://localhost:8000',
    )

    await expect(api.listVideos()).rejects.toThrow(
      'API request failed (501)',
    )
  })
})

describe('Mock video library', () => {
  it('returns a previously submitted video', async () => {
    const sourceUrl =
      'https://www.youtube.com/watch?v=jfKfPfyJRdk'

    // Submit a video to our simulated backend.
    const submitted = await mockVideoApi.ingestVideo({
      url: sourceUrl,
    })

    // Read the collection through the same API interface.
    const library = await mockVideoApi.listVideos()

    const matchingVideo = library.videos.find(
      (video) => video.video_id === submitted.video_id,
    )

    expect(matchingVideo).toBeDefined()
    expect(matchingVideo?.source_url).toBe(sourceUrl)
    expect(matchingVideo?.status).toBe('queued')
  })
})

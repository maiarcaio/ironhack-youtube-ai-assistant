import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createAuthenticatedVideoApi } from './authenticatedVideoApi'

const BASE_URL = 'http://localhost:8000/'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('authenticated video API adapter', () => {
  it('sends the current Supabase token and normalizes completed', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('access-token')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: '5fb3e50c-14ff-4ecf-b3f2-4ed5de5e7f99',
          status: 'completed',
        }),
        { status: 200 },
      ),
    )

    vi.stubGlobal('fetch', fetchMock)

    const api = createAuthenticatedVideoApi(BASE_URL, getAccessToken)
    const result = await api.getVideoStatus(
      '5fb3e50c-14ff-4ecf-b3f2-4ed5de5e7f99',
    )

    expect(result.status).toBe('ready')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/videos/5fb3e50c-14ff-4ecf-b3f2-4ed5de5e7f99/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('does not call the backend when no session is available', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const api = createAuthenticatedVideoApi(
      BASE_URL,
      async () => null,
    )

    await expect(api.listVideos()).rejects.toThrow(
      'Please sign in before accessing your video library.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a useful permission error from the backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ detail: 'Not the owner.' }),
          { status: 403 },
        ),
      ),
    )

    const api = createAuthenticatedVideoApi(
      BASE_URL,
      async () => 'access-token',
    )

    await expect(api.getVideoStatus('video-123')).rejects.toThrow(
      'You do not have permission to access this video.',
    )
  })
})

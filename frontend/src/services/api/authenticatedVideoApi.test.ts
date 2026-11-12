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
  it('validates archive and restore mutation responses', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ video_id: 'v1', archived: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ video_id: 'v1', archived: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createAuthenticatedVideoApi(BASE_URL, async () => 'token')
    await expect(api.archiveVideo('v1')).resolves.toBeUndefined()
    await expect(api.restoreVideo('v1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid mutation response and handles DELETE 204', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ video_id: 'wrong', archived: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const api = createAuthenticatedVideoApi(BASE_URL, async () => 'token')
    await expect(api.archiveVideo('v1')).rejects.toThrow('Invalid library mutation response')
    await expect(api.deleteVideo('v1')).resolves.toBeUndefined()
  })

  it('maps common mutation errors without fabricating success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'Still processing.' }), { status: 409 })))
    const api = createAuthenticatedVideoApi(BASE_URL, async () => 'token')
    await expect(api.deleteVideo('v1')).rejects.toThrow('Still processing.')
  })
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

  it('uploads audio as authenticated multipart form data', async () => {
    const getAccessToken = vi.fn().mockResolvedValue('access-token')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'c5c319a8-9fd7-4573-8e12-a88b95ad0550',
          status: 'queued',
        }),
        { status: 202 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = createAuthenticatedVideoApi(BASE_URL, getAccessToken)
    const file = new File(['audio'], 'lecture.mp3', {
      type: 'audio/mpeg',
    })

    await expect(api.uploadAudio(file)).resolves.toEqual({
      video_id: 'c5c319a8-9fd7-4573-8e12-a88b95ad0550',
      status: 'queued',
    })

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/videos/upload',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer access-token' },
        body: expect.any(FormData),
      }),
    )
    expect(options.headers).not.toHaveProperty('Content-Type')
    expect((options.body as FormData).get('file')).toBe(file)
  })

  it('retrieves an authenticated signed audio playback URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          video_id: 'c5c319a8-9fd7-4573-8e12-a88b95ad0550',
          url: 'https://storage.example.test/signed-audio-url',
          expires_in: 3600,
          media_type: 'audio',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const api = createAuthenticatedVideoApi(
      BASE_URL,
      async () => 'access-token',
    )

    await expect(
      api.getAudioPlayback('c5c319a8-9fd7-4573-8e12-a88b95ad0550'),
    ).resolves.toMatchObject({
      video_id: 'c5c319a8-9fd7-4573-8e12-a88b95ad0550',
      media_type: 'audio',
    })
  })
})

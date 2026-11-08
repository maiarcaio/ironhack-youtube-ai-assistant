import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const API = 'http://localhost:8000'
const VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'
const UUID = '11111111-1111-4111-8111-111111111111'
const TOKEN_A = 'offline-token-a'

function sessionResponse(email: string, token: string) {
  const now = new Date().toISOString()
  return {
    access_token: token,
    refresh_token: `refresh-${token}`,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: `user-${email}`,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      created_at: now,
      updated_at: now,
    },
  }
}

async function signIn(page: Page, email = 'a@example.test') {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('offline-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('VideoMind authenticated browser workflow — simulated', () => {
  test('restores a persisted failure reason without polling completed videos', async ({ page }) => {
    const failedUuid = '33333333-3333-4333-8333-333333333333'
    const readyUuid = '44444444-4444-4444-8444-444444444444'
    const statusRequests: string[] = []

    await page.route('http://supabase.test/auth/v1/token**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) })
    })
    await page.route(`${API}/api/v1/videos`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [
        { video_id: failedUuid, title: 'Persisted failed lecture', status: 'failed', source_url: VIDEO_URL },
        { video_id: readyUuid, title: 'Completed lecture', status: 'completed', source_url: VIDEO_URL },
      ] }) })
    })
    await page.route(`${API}/api/v1/videos/*/status`, async (route) => {
      const requestedUuid = route.request().url().split('/').at(-2) ?? ''
      statusRequests.push(requestedUuid)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        video_id: requestedUuid,
        status: 'failed',
        error: 'Could not process YouTube captions. Upload a TXT, SRT or VTT transcript instead.',
      }) })
    })

    await page.goto('/')
    await signIn(page)
    await expect(page.getByText('Processing failed — recovery available')).toBeVisible()
    await page.getByRole('button', { name: 'Persisted failed lecture' }).click()

    await expect(page.getByText('Could not process YouTube captions. Upload a TXT, SRT or VTT transcript instead.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open Q&A' }).click()
    await expect(page.getByText('Automatic processing failed — recovery available')).toBeVisible()
    await expect(page.getByText('Waiting for indexing')).toHaveCount(0)
    expect(statusRequests).toEqual([failedUuid])

    await page.reload()
    await expect(page.getByRole('button', { name: 'Persisted failed lecture' })).toBeVisible()
    await page.getByRole('button', { name: 'Persisted failed lecture' }).click()
    await expect(page.getByText('Could not process YouTube captions. Upload a TXT, SRT or VTT transcript instead.', { exact: true })).toBeVisible()
    expect(statusRequests).toEqual([failedUuid, failedUuid])
  })

  test('keeps a failed video recoverable when its error detail cannot be refreshed', async ({ page }) => {
    const failedUuid = '55555555-5555-4555-8555-555555555555'

    await page.route('http://supabase.test/auth/v1/token**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) })
    })
    await page.route(`${API}/api/v1/videos`, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [
        { video_id: failedUuid, title: 'Failure detail unavailable', status: 'failed', source_url: VIDEO_URL },
      ] }) })
    })
    await page.route(`${API}/api/v1/videos/${failedUuid}/status`, async (route) => {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Status service unavailable.' }) })
    })

    await page.goto('/')
    await signIn(page)
    await page.getByRole('button', { name: 'Failure detail unavailable' }).click()

    await expect(page.getByText('failed', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Upload transcript' })).toBeVisible()
    await expect(page.getByText('Video processing failed. The backend did not provide a specific reason.', { exact: true })).toBeVisible()
  })

  test('loads UUID records, ingests a URL, reaches Ready, streams citations, and seeks', async ({ page }) => {
    let library = [{
      video_id: UUID,
      title: 'Backend lecture',
      status: 'queued',
      source_url: VIDEO_URL,
    }]
    let statusCalls = 0
    let ingestAuthorization = ''

    await page.route('http://supabase.test/auth/v1/token**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) })
    })
    await page.route('**/auth/v1/logout**', async (route) => route.fulfill({ status: 204 }))
    await page.route(`${API}/api/v1/videos`, async (route) => {
      expect(route.request().headers().authorization).toBe(`Bearer ${TOKEN_A}`)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: library }) })
    })
    await page.route(`${API}/api/v1/videos/ingest`, async (route) => {
      ingestAuthorization = route.request().headers().authorization ?? ''
      expect(route.request().postDataJSON()).toEqual({ url: VIDEO_URL })
      library = [{ video_id: UUID, title: 'Backend lecture', status: 'queued', source_url: VIDEO_URL }]
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ video_id: UUID, status: 'queued' }) })
    })
    await page.route(`${API}/api/v1/videos/${UUID}/status`, async (route) => {
      statusCalls += 1
      const status = statusCalls < 2 ? 'queued' : statusCalls < 3 ? 'processing' : 'completed'
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ video_id: UUID, status, error: null }) })
    })
    await page.route('https://www.youtube.com/iframe_api', async (route) => {
      await route.fulfill({ contentType: 'application/javascript', body: `window.YT={Player:function(_element,options){this.seekTo=(seconds)=>window.__videomindSeek=seconds;this.destroy=()=>{};setTimeout(()=>options.events.onReady({target:this}),0)}};window.onYouTubeIframeAPIReady();` })
    })
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        if (String(input).endsWith('/api/v1/chat/stream')) {
          ;(window as Window & { __chatAuth?: string }).__chatAuth = new Headers(init?.headers).get('Authorization') ?? ''
          const encoder = new TextEncoder()
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode('event: meta\ndata: {"video_id":"11111111-1111-4111-8111-111111111111","thread_id":"thread-a"}\n\n'))
              setTimeout(() => controller.enqueue(encoder.encode('event: token\ndata: {"text":"Partial "}\n\n')), 40)
              setTimeout(() => controller.enqueue(encoder.encode('event: token\ndata: {"text":"answer."}\n\n')), 120)
              setTimeout(() => controller.enqueue(encoder.encode('event: sources\ndata: {"sources":[{"chunk_id":"chunk-1","excerpt":"Timestamped evidence","start_seconds":85,"end_seconds":92,"source_type":"transcript"}]}\n\n')), 140)
              setTimeout(() => { controller.enqueue(encoder.encode('event: done\ndata: {"thread_id":"thread-a","answer":"Partial answer.","insufficient_evidence":false}\n\n')); controller.close() }, 180)
            },
          })
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
        }
        return originalFetch(input, init)
      }
    })

    await page.goto('/')
    await signIn(page)
    await expect(page.getByRole('button', { name: 'Backend lecture' })).toBeVisible()

    await page.getByRole('button', { name: 'Add video' }).click()
    await page.getByLabel('YouTube URL').fill(VIDEO_URL)
    await page.getByRole('button', { name: /Add to library/i }).click()
    expect(ingestAuthorization).toBe(`Bearer ${TOKEN_A}`)

    await page.getByRole('button', { name: 'Backend lecture' }).click()
    await expect(page.getByText(/Chat is unavailable/i)).toBeVisible()
    await expect(page.getByText('ready')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel('Your question')).toBeEnabled()

    await page.getByLabel('Your question').fill('What does the lecture cover?')
    await page.getByRole('button', { name: 'Send question' }).click()
    await expect(page.getByText('Partial', { exact: true })).toBeVisible()
    await expect(page.getByText('Partial answer.')).toBeVisible()
    await expect(page.getByText('Timestamped evidence')).toBeVisible()
    expect(await page.evaluate(() => (window as Window & { __chatAuth?: string }).__chatAuth)).toBe(`Bearer ${TOKEN_A}`)

    await page.getByRole('button', { name: 'Jump to 01:25 in video' }).click()
    await expect.poll(() => page.evaluate(() => (window as Window & { __videomindSeek?: number }).__videomindSeek)).toBe(85)
    expect(statusCalls).toBeGreaterThanOrEqual(3)
  })

  test('shows fallback only after failure and waits for status after upload', async ({ page }) => {
    const failedUuid = '22222222-2222-4222-8222-222222222222'
    let status = 'processing'
    let uploadHeaders = ''
    let uploadBody = ''
    let uploadAttempts = 0
    let postUploadStatusCalls = 0

    await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) }))
    await page.route(`${API}/api/v1/videos`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: failedUuid, title: 'Failed lecture', status, source_url: VIDEO_URL }] }) }))
    await page.route(`${API}/api/v1/videos/${failedUuid}/status`, async (route) => {
      if (uploadAttempts > 1 && status === 'processing') {
        postUploadStatusCalls += 1
        if (postUploadStatusCalls >= 2) status = 'completed'
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ video_id: failedUuid, status, error: status === 'failed' ? 'Captions unavailable.' : null }) })
    })
    await page.route(`${API}/api/v1/transcripts/upload`, async (route) => {
      uploadAttempts += 1
      uploadHeaders = route.request().headers().authorization ?? ''
      uploadBody = route.request().postData() ?? ''

      if (uploadAttempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Transcript indexing is temporarily unavailable.' }) })
        return
      }

      status = 'processing'
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ video_id: failedUuid, status: 'completed', chunks_count: 2 }) })
    })

    await page.goto('/')
    await signIn(page)
    await page.getByRole('button', { name: 'Failed lecture' }).click()
    await expect(page.getByText('Upload transcript')).toHaveCount(0)

    status = 'failed'
    await expect(page.getByRole('heading', { name: 'Upload transcript' })).toBeVisible({ timeout: 5_000 })
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    await page.getByLabel('Transcript file').setInputFiles({ name: 'fallback.srt', mimeType: 'text/plain', buffer: Buffer.from('1\n00:01:25,000 --> 00:01:30,000\nEvidence') })
    await page.getByRole('button', { name: 'Upload transcript' }).click()
    await expect.poll(() => uploadHeaders).toBe(`Bearer ${TOKEN_A}`)
    expect(uploadBody).toContain(`name="video_id"\r\n\r\n${failedUuid}`)
    expect(uploadBody).toContain('filename="fallback.srt"')
    await expect(page.getByText('Transcript indexing is temporarily unavailable.')).toBeVisible()
    await expect(page.getByText('failed', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled()

    await page.getByRole('button', { name: 'Upload transcript' }).click()
    await expect(page.getByRole('heading', { name: 'Upload transcript' })).toHaveCount(0)
    await expect(page.getByText('ready', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByLabel('Your question')).toBeEnabled()
    await expect(page.getByText(/Chat is unavailable/i)).toHaveCount(0)
    expect(uploadAttempts).toBe(2)
  })

  test('clears the previous library when a different user signs in', async ({ page }) => {
    await page.route('http://supabase.test/auth/v1/token**', async (route) => {
      const email = String(route.request().postDataJSON().email)
      const token = email === 'b@example.test' ? 'offline-token-b' : TOKEN_A
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse(email, token)) })
    })
    await page.route('**/auth/v1/logout**', async (route) => route.fulfill({ status: 204 }))
    await page.route(`${API}/api/v1/videos`, async (route) => {
      const title = route.request().headers().authorization === 'Bearer offline-token-b' ? 'User B lecture' : 'User A lecture'
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: UUID, title, status: 'completed', source_url: VIDEO_URL }] }) })
    })

    await page.goto('/')
    await signIn(page, 'a@example.test')
    await expect(page.getByText('User A lecture')).toBeVisible()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible()
    await signIn(page, 'b@example.test')
    await expect(page.getByText('User B lecture')).toBeVisible()
    await expect(page.getByText('User A lecture')).toHaveCount(0)
  })

  test('reports an interrupted stream without a final answer', async ({ page }) => {
    await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) }))
    await page.route(`${API}/api/v1/videos`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: UUID, title: 'Ready lecture', status: 'completed', source_url: VIDEO_URL }] }) }))
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window)
      window.fetch = async (input, init) => {
        if (String(input).endsWith('/api/v1/chat/stream')) {
          const encoder = new TextEncoder()
          const stream = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('event: token\ndata: {"text":"Partial evidence"}\n\n')); controller.close() } })
          return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
        }
        return originalFetch(input, init)
      }
    })

    await page.goto('/')
    await signIn(page)
    await page.getByRole('button', { name: 'Ready lecture' }).click()
    await page.getByLabel('Your question').fill('Will this stream complete?')
    await page.getByRole('button', { name: 'Send question' }).click()
    await expect(page.getByText('Partial evidence')).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText(/ended before completion/i)
    await expect(page.getByText('Partial answer.')).toHaveCount(0)
  })

  test('reports an expired backend authorization while retaining no fabricated library', async ({ page }) => {
    await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse('a@example.test', TOKEN_A)) }))
    await page.route(`${API}/api/v1/videos`, async (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Token expired' }) }))

    await page.goto('/')
    await signIn(page)
    await expect(page.getByRole('alert')).toHaveText(/session has expired/i)
    await expect(page.getByText('Your library starts here')).toBeVisible()
  })
})

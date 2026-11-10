import { expect, test } from '@playwright/test'

const API = 'http://localhost:8000'
const VIDEO_ID = '11111111-1111-4111-8111-111111111111'
const VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'
const TOKEN = 'offline-transcript-token'

function sessionResponse() {
  const now = new Date().toISOString()

  return {
    access_token: TOKEN,
    refresh_token: 'offline-transcript-refresh',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: {
      id: 'transcript-user',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'transcript@example.test',
      created_at: now,
      updated_at: now,
    },
  }
}

test('searches an authenticated transcript and seeks its video timestamp', async ({ page }) => {
  await page.route('http://supabase.test/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionResponse()),
    })
  })
  await page.route(`${API}/api/v1/videos`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        videos: [{
          video_id: VIDEO_ID,
          title: 'Transcript lecture',
          status: 'completed',
          source_url: VIDEO_URL,
        }],
      }),
    })
  })
  await page.route('http://supabase.test/rest/v1/transcripts**', async (route) => {
    expect(route.request().headers().authorization).toBe(`Bearer ${TOKEN}`)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        video_id: VIDEO_ID,
        content: `1
00:00:10,000 --> 00:00:15,000
Opening context.

2
00:01:25,000 --> 00:01:32,000
Timestamped evidence for transcript search.`,
        format: 'srt',
        source: 'youtube',
      }),
    })
  })
  await page.route('https://www.youtube.com/iframe_api', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.YT={Player:function(_element,options){this.seekTo=(seconds)=>window.__videomindSeek=seconds;this.getCurrentTime=()=>0;this.destroy=()=>{};setTimeout(()=>options.events.onReady({target:this}),0)}};window.onYouTubeIframeAPIReady();`,
    })
  })

  await page.goto('/')
  await page.getByLabel('Email').fill('transcript@example.test')
  await page.getByLabel('Password').fill('offline-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Transcript lecture' }).click()
  await page.getByRole('button', { name: 'Searchable Transcript' }).click()

  await expect(page.getByText('Opening context.')).toBeVisible()
  await page.getByRole('textbox', { name: 'Search transcript' }).fill('evidence')
  await expect(page.getByText('evidence', { exact: true })).toBeVisible()
  await expect(page.getByText('1 of 2 segments')).toBeVisible()

  await page.getByRole('button', {
    name: 'Jump to 01:25 in video',
  }).click()

  await expect(page.getByRole('region', {
    name: 'Video workspace',
  })).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __videomindSeek?: number }).__videomindSeek,
  )).toBe(85)
})

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const API = 'http://localhost:8000'
const VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'
const UUID = '11111111-1111-4111-8111-111111111111'

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

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('offline-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('persists, isolates, exports and reopens authenticated notes', async ({ page }) => {
  await page.route('http://supabase.test/auth/v1/token**', async (route) => {
    const email = String(route.request().postDataJSON().email)
    const token = email.startsWith('b@') ? 'offline-token-b' : 'offline-token-a'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sessionResponse(email, token)),
    })
  })
  await page.route('**/auth/v1/logout**', async (route) => {
    await route.fulfill({ status: 204 })
  })
  await page.route(`${API}/api/v1/videos`, async (route) => {
    const isUserB = route.request().headers().authorization === 'Bearer offline-token-b'
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        videos: [{
          video_id: UUID,
          title: isUserB ? 'User B lecture' : 'User A lecture',
          status: 'completed',
          source_url: VIDEO_URL,
        }],
      }),
    })
  })
  await page.route('https://www.youtube.com/iframe_api', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.YT={Player:function(_element,options){this.seekTo=(seconds)=>window.__videomindSeek=seconds;this.getCurrentTime=()=>85.9;this.destroy=()=>{};setTimeout(()=>options.events.onReady({target:this}),0)}};window.onYouTubeIframeAPIReady();`,
    })
  })

  await page.goto('/')
  await signIn(page, 'a@example.test')
  await page.getByRole('button', { name: 'User A lecture' }).click()
  await page.getByRole('tab', { name: 'Notes (0)' }).click()
  await page.getByLabel('Quick note').fill('Similarity search explanation')
  await page.getByRole('button', { name: 'Save quick note' }).click()
  await expect(page.getByText('Note at 01:25')).toBeVisible()

  await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
  await expect(page.getByText('Stored only in this browser')).toBeVisible()
  await page.getByRole('button', { name: 'Edit Note at 01:25' }).click()
  await page.getByLabel('Edit note title').fill('Updated playback insight')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toBeVisible()

  await page.getByLabel('Search saved notes').fill('not present')
  await expect(page.getByText(/No notes found/i)).toBeVisible()
  await page.getByLabel('Search saved notes').fill('')
  await page.getByRole('button', { name: 'Study Note' }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export all' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^videomind-notes-\d{4}-\d{2}-\d{2}\.md$/)
  const stream = await download.createReadStream()
  let markdown = ''
  for await (const chunk of stream) markdown += chunk.toString()
  expect(markdown).toContain('Updated playback insight')
  expect(markdown).toContain('User A lecture')

  await page.reload()
  await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible()
  await signIn(page, 'b@example.test')
  await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await signIn(page, 'a@example.test')
  await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toBeVisible()
  await page.getByRole('button', { name: 'Open Updated playback insight in video' }).click()
  await expect.poll(() => page.evaluate(() => (
    window as Window & { __videomindSeek?: number }
  ).__videomindSeek)).toBe(85)

  await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
  await page.getByRole('button', { name: 'Delete Updated playback insight' }).click()
  await expect(page.getByRole('heading', { name: 'Updated playback insight' })).toHaveCount(0)
})

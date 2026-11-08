import { expect, test } from '@playwright/test'

const VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'

test.describe('VideoMind browser reliability — simulated mock mode', () => {
  test('loads without authentication and keeps chat unavailable for mock videos', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Demo mode')).toBeVisible()
    await expect(page.getByText('DEMO DATA')).toBeVisible()
    await expect(page.getByText('LIVE DATA')).toHaveCount(0)
    await page.getByRole('button', { name: 'Add video' }).click()
    await expect(page.getByRole('dialog', { name: 'Add YouTube Lecture' })).toBeVisible()

    await page.getByLabel('YouTube URL').fill(VIDEO_URL)
    await page.getByRole('button', { name: /Add to library/i }).click()

    const video = page.getByRole('button', { name: /Processing video|Mock video/i })
    await expect(video).toBeVisible()
    await video.click()

    await expect(page.getByRole('region', { name: 'Video workspace' })).toBeVisible()
    await expect(page.getByText(/demonstration mode/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled()
    await expect(page.getByText(/indexed by the backend/i)).toBeVisible()

    await page.getByRole('button', { name: 'Open Q&A' }).click()
    await expect(page.getByText('Demo video — not indexed')).toBeVisible()
    await expect(page.getByText('Transcript indexed')).toHaveCount(0)
  })

  test('supports navigation and remains usable at a mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')

    await page.getByRole('button', { name: 'Search videos' }).click()
    await expect(page.getByRole('searchbox')).toBeFocused()

    const horizontalOverflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(horizontalOverflow).toBe(false)
  })

  test('keeps mock notes separate from authenticated-user storage', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'videomind.notes.v1.user.user-a',
        JSON.stringify({
          version: 1,
          notes: [{
            id: 'private-note',
            videoId: 'private-video',
            videoTitle: 'Private lecture',
            title: 'Authenticated private note',
            content: 'Must not appear in mock mode.',
            tag: 'Private',
            seconds: 10,
            createdAt: '2026-11-07T10:00:00.000Z',
            updatedAt: '2026-11-07T10:00:00.000Z',
          }],
        }),
      )
    })
    await page.route('https://www.youtube.com/iframe_api', async (route) => {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `window.YT={Player:function(_element,options){this.seekTo=()=>{};this.getCurrentTime=()=>42;this.destroy=()=>{};setTimeout(()=>options.events.onReady({target:this}),0)}};window.onYouTubeIframeAPIReady();`,
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Saved Notes', exact: true }).click()
    await expect(page.getByText('Authenticated private note')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add video' }).click()
    await page.getByLabel('YouTube URL').fill(VIDEO_URL)
    await page.getByRole('button', { name: /Add to library/i }).click()
    await page.getByRole('button', { name: /Processing video|Mock video/i }).click()
    await page.getByRole('tab', { name: 'Notes (0)' }).click()
    await page.getByLabel('Quick note').fill('Mock-only note')
    await page.getByRole('button', { name: 'Save quick note' }).click()
    await expect(page.getByText('Note at 00:42')).toBeVisible()

    const storage = await page.evaluate(() => ({
      mock: localStorage.getItem('videomind.notes.v1.mock'),
      authenticated: localStorage.getItem('videomind.notes.v1.user.user-a'),
    }))
    expect(storage.mock).toContain('Mock-only note')
    expect(storage.authenticated).toContain('Authenticated private note')
    expect(storage.authenticated).not.toContain('Mock-only note')
  })
})

import { expect, test } from '@playwright/test'

const VIDEO_URL = 'https://www.youtube.com/watch?v=jfKfPfyJRdk'

test.describe('VideoMind browser reliability — simulated mock mode', () => {
  test('loads without authentication and keeps chat unavailable for mock videos', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('Demo mode')).toBeVisible()
    await expect(page.getByLabel('YouTube URL')).toBeVisible()

    await page.getByLabel('YouTube URL').fill(VIDEO_URL)
    await page.getByRole('button', { name: /Add to library/i }).click()

    const video = page.getByRole('button', { name: /Processing video|Mock video/i })
    await expect(video).toBeVisible()
    await video.click()

    await expect(page.getByRole('region', { name: 'Video workspace' })).toBeVisible()
    await expect(page.getByText(/demonstration mode/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send question' })).toBeDisabled()
    await expect(page.getByText(/indexed by the backend/i)).toBeVisible()
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
})

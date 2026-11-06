import { expect, test } from '@playwright/test'

test.describe('VideoMind browser reliability — intercepted authentication', () => {
  test('shows login and reports an intercepted sign-in failure', async ({ page }) => {
    await page.route('http://supabase.test/auth/v1/token**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'invalid_credentials',
          message: 'Invalid login credentials',
        }),
      })
    })

    await page.goto('/')
    await expect(page.getByRole('main', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Continue your learning' })).toBeVisible()

    await page.getByLabel('Email').fill('offline@example.test')
    await page.getByLabel('Password').fill('not-a-real-password')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByRole('alert')).toHaveText('Invalid login credentials')
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})

import { expect, test } from '@playwright/test'

const API = 'http://localhost:8000'
const ID = '77777777-7777-4777-8777-777777777777'

function sessionResponse() {
  const now = new Date().toISOString()
  return { access_token: 'library-token', refresh_token: 'library-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'library-user', aud: 'authenticated', role: 'authenticated', email: 'library@example.test', created_at: now, updated_at: now } }
}

async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('Email').fill('library@example.test')
  await page.getByLabel('Password').fill('offline-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test.describe('authenticated library management — intercepted', () => {
  test('cancelling removal via Escape keeps the card and sends no DELETE', async ({ page }) => {
    let deletes = 0
    await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse()) }))
    await page.route(`${API}/api/v1/videos**`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: ID, title: 'Disposable lecture', status: 'completed', source_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }] }) }))
    await page.route(`${API}/api/v1/videos/${ID}`, async (route) => { deletes += 1; await route.fulfill({ status: 204 }) })
    await page.goto('/')
    await signIn(page)
    await expect(page.getByText('Disposable lecture')).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(deletes).toBe(0)
    await expect(page.getByRole('button', { name: 'Disposable lecture' })).toBeVisible()
  })

  test('confirmed removal sends exactly one DELETE', async ({ page }) => {
    let deletes = 0
    await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse()) }))
    await page.route(`${API}/api/v1/videos**`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: ID, title: 'Disposable lecture', status: 'completed', source_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }] }) }))
    await page.route(`${API}/api/v1/videos/${ID}`, async (route) => { deletes += 1; await route.fulfill({ status: 204 }) })
    await page.goto('/')
    await signIn(page)
    await expect(page.getByText('Disposable lecture')).toBeVisible()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.poll(() => deletes).toBe(1)
  })
})

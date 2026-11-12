// Deterministic, intercepted browser coverage: no live account or model calls.
import { expect, test } from '@playwright/test'

const API = 'http://localhost:8000'
const UUID = '99999999-9999-4999-8999-999999999999'

function sessionResponse() {
  const now = new Date().toISOString()
  return { access_token: 'chat-layout-token', refresh_token: 'chat-layout-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: 'chat-layout-user', aud: 'authenticated', role: 'authenticated', email: 'chat-layout@example.test', created_at: now, updated_at: now } }
}

test('keeps the responsive workspace readable and scrollable across representative viewports', async ({ page }) => {
  await page.route('http://supabase.test/auth/v1/token**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sessionResponse()) }))
  await page.route(`${API}/api/v1/videos`, async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ videos: [{ video_id: UUID, title: 'Responsive lecture', status: 'completed', source_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw' }] }) }))
  await page.route(`${API}/api/v1/chat/stream`, async (route) => {
    const encoder = new TextEncoder()
    const answer = Array.from({ length: 8 }, (_, index) => `Paragraph ${index + 1} explains a grounded concept with readable prose and a source reference.`).join('\n\n')
    const body = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`event: meta\ndata: {"video_id":"${UUID}","thread_id":"layout-thread"}\n\n`)); controller.enqueue(encoder.encode(`event: token\ndata: {"text":${JSON.stringify(answer)}}\n\n`)); controller.enqueue(encoder.encode('event: sources\ndata: {"sources":[{"chunk_id":"owner:video:0001","excerpt":"Grounded evidence","start_seconds":12,"end_seconds":18,"source_type":"transcript"}]}\n\n')); controller.enqueue(encoder.encode(`event: done\ndata: {"thread_id":"layout-thread","answer":${JSON.stringify(answer)},"insufficient_evidence":false}\n\n`)); controller.close() } })
    await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: await new Response(body).text() })
  })
  await page.route('https://www.youtube.com/iframe_api', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.YT={Player:function(_element,options){this.seekTo=(seconds)=>window.__videomindSeek=seconds;this.getCurrentTime=()=>0;this.destroy=()=>{};setTimeout(()=>options.events.onReady({target:this}),0)}};window.onYouTubeIframeAPIReady();`,
    })
  })

  await page.goto('/')
  await page.getByLabel('Email').fill('chat-layout@example.test')
  await page.getByLabel('Password').fill('offline-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('button', { name: 'Responsive lecture' }).click()
  await page.getByRole('button', { name: 'Open Q&A' }).click()
  const question = page.getByLabel('Your question')
  await question.fill('Explain the lecture')
  await page.getByRole('button', { name: 'Send question' }).click()
  await expect(page.getByText('Paragraph 1 explains a grounded concept with readable prose and a source reference.').first()).toBeVisible()

  const conversation = page.locator('.vm-chat-panel-conversation')
  await expect.poll(async () => conversation.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
  await conversation.evaluate((element) => { element.scrollTop = 0 })
  const positionBeforeUpdate = await conversation.evaluate((element) => element.scrollTop)
  await question.fill('Follow up with more detail')
  await page.getByRole('button', { name: 'Send question' }).click()
  const repeatedParagraph = page.getByText('Paragraph 8 explains a grounded concept with readable prose and a source reference.')
  await expect(repeatedParagraph).toHaveCount(2)
  await expect(repeatedParagraph.nth(1)).toBeVisible()
  const positionAfterUpdate = await conversation.evaluate((element) => element.scrollTop)
  expect(positionBeforeUpdate).toBe(0)
  expect(positionAfterUpdate).toBeLessThan(80)

  await expect(page.getByRole('button', { name: /Terra Quick answers/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Sol Deep Analysis/ })).toBeVisible()
  await page.getByRole('button', { name: /Sol Deep Analysis/ }).click()
  await expect(page.getByRole('button', { name: /Sol Deep Analysis/ })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: /Terra Quick answers/ }).click()
  await expect(page.getByRole('button', { name: /Terra Quick answers/ })).toHaveAttribute('aria-pressed', 'true')

  const citation = page.getByRole('button', { name: 'Jump to 00:12 in video' }).first()
  await expect(citation).toBeVisible()
  await citation.click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __videomindSeek?: number }).__videomindSeek)).toBe(12)

  await page.getByRole('tab', { name: 'Transcript' }).click()
  await page.getByRole('tab', { name: /Notes/ }).click()
  await page.getByRole('tab', { name: 'Ask AI' }).click()
  await expect(page.getByText('Paragraph 1 explains a grounded concept with readable prose and a source reference.').first()).toBeVisible()

  let overflowSeen = false
  for (const width of [375, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width < 800 ? 800 : 900 })
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.vm-chat-panel')
      const conversation = document.querySelector('.vm-chat-panel-conversation')
      return { bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth, panelWidth: panel?.getBoundingClientRect().width ?? 0, conversationOverflow: (conversation?.scrollHeight ?? 0) > (conversation?.clientHeight ?? 0) }
    })
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1)
    expect(metrics.panelWidth).toBeGreaterThanOrEqual(width < 1280 ? Math.min(width - 90, 520) : 360)
    overflowSeen = overflowSeen || metrics.conversationOverflow
    if (width === 375 || width === 1024) await page.screenshot({ path: `test-results/chat-responsive-${width}.png`, fullPage: true })
    await expect(page.getByRole('button', { name: /Terra/ })).toBeVisible()
    await expect(question).toBeVisible()
  }
  expect(overflowSeen).toBe(true)
})

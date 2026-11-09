
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ingestVideo, getVideoStatus } from './videos'

// Restore real timers after every test.
afterEach(() => {
  vi.useRealTimers()
})

describe('Video processing lifecycle', () => {
  it('moves from queued to processing to ready', async () => {
    // Control the clock so the test runs without waiting several seconds.
    vi.useFakeTimers()

    // Start with a fixed time to make the test predictable.
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))

    // Ingestion simulates a 500 ms network delay.
    const ingestion = ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    await vi.advanceTimersByTimeAsync(500)
    const created = await ingestion

    expect(created.status).toBe('queued')

    // The status request simulates a 200 ms delay.
    const firstCheck = getVideoStatus(created.video_id)
    await vi.advanceTimersByTimeAsync(200)
    const queued = await firstCheck

    expect(queued.status).toBe('queued')

    // Move forward to the processing phase.
    await vi.advanceTimersByTimeAsync(1500)

    const secondCheck = getVideoStatus(created.video_id)
    await vi.advanceTimersByTimeAsync(200)
    const processing = await secondCheck

    expect(processing.status).toBe('processing')

    // Move forward until processing should be complete.
    await vi.advanceTimersByTimeAsync(2500)

    const finalCheck = getVideoStatus(created.video_id)
    await vi.advanceTimersByTimeAsync(200)
    const ready = await finalCheck

    expect(ready.status).toBe('ready')
    expect(ready.title).toBe('Example YouTube Video')
  })
})

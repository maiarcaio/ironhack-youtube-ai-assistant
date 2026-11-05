
import { describe, expect, it } from 'vitest'
import { mockVideoApi } from './mockVideoApi'

// Verify that the mock adapter follows our video API contract.
describe('Mock Video API adapter', () => {
  it('accepts a video through the API interface', async () => {
    const response = await mockVideoApi.ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    expect(response.video_id).toBeTruthy()
    expect(response.status).toBe('queued')
  })

  it('can retrieve a submitted video status', async () => {
    const response = await mockVideoApi.ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    const status = await mockVideoApi.getVideoStatus(
      response.video_id,
    )

    expect(status.video_id).toBe(response.video_id)
    expect(['queued', 'processing', 'ready']).toContain(
      status.status,
    )
  })
})

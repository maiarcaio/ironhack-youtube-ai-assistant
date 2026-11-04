
import { describe, expect, it } from 'vitest'
import { ingestVideo, getVideoStatus } from './videos'

// Group all tests related to our video API service.
describe('Video API mock service', () => {

  // Test 1: A valid YouTube URL should be accepted.
  it('accepts a valid YouTube URL', async () => {
    const response = await ingestVideo({
      url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    })

    // Check that a video ID was generated.
    expect(response.video_id).toBeTruthy()

    // Check that processing starts in the queued state.
    expect(response.status).toBe('queued')
  })

  // Test 2: URLs from unsupported websites should be rejected.
  it('rejects non-YouTube URLs', async () => {
    await expect(
      ingestVideo({
        url: 'https://example.com/video',
      }),
    ).rejects.toThrow('Please enter a valid YouTube URL.')
  })

  // Test 3: Every submission should receive a unique ID.
  it('generates unique video IDs', async () => {
    const first = await ingestVideo({
      url: 'https://youtu.be/jfKfPfyJRdk',
    })

    const second = await ingestVideo({
      url: 'https://youtu.be/jfKfPfyJRdk',
    })

    // Two different submissions should not share an ID.
    expect(first.video_id).not.toBe(second.video_id)
  })

  // Test 4: Requesting a nonexistent video should fail.
  it('rejects unknown video IDs', async () => {
    await expect(
      getVideoStatus('unknown-video'),
    ).rejects.toThrow('Video not found.')
  })
})

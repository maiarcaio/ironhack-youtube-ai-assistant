
import { describe, expect, it } from 'vitest'

import {
  createYouTubeEmbedUrl,
  extractYouTubeVideoId,
} from './youtube'

const VIDEO_ID = 'jfKfPfyJRdk'

describe('extractYouTubeVideoId', () => {
  it('extracts IDs from standard watch URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('extracts IDs from short links', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtu.be/${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('extracts IDs from Shorts URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtube.com/shorts/${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('extracts IDs from embed URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtube.com/embed/${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('extracts IDs from live video URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtube.com/live/${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('supports mobile YouTube URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://m.youtube.com/watch?v=${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('supports privacy-enhanced embed URLs', () => {
    expect(
      extractYouTubeVideoId(
        `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('accepts normal tracking and timestamp parameters', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtu.be/${VIDEO_ID}?si=example&t=120`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('accepts a YouTube URL without a scheme', () => {
    expect(
      extractYouTubeVideoId(
        `www.youtube.com/watch?v=${VIDEO_ID}`,
      ),
    ).toBe(VIDEO_ID)
  })

  it('rejects deceptive hostnames', () => {
    expect(
      extractYouTubeVideoId(
        `https://youtube.com.example.org/watch?v=${VIDEO_ID}`,
      ),
    ).toBeNull()
  })

  it('rejects unrelated websites', () => {
    expect(
      extractYouTubeVideoId(
        `https://example.org/watch?v=${VIDEO_ID}`,
      ),
    ).toBeNull()
  })

  it('rejects invalid video IDs', () => {
    expect(
      extractYouTubeVideoId(
        'https://youtube.com/watch?v=invalid',
      ),
    ).toBeNull()
  })

  it('rejects insecure HTTP URLs', () => {
    expect(
      extractYouTubeVideoId(
        `http://youtube.com/watch?v=${VIDEO_ID}`,
      ),
    ).toBeNull()
  })

  it('rejects empty input', () => {
    expect(extractYouTubeVideoId('')).toBeNull()
    expect(extractYouTubeVideoId('   ')).toBeNull()
  })

  it('rejects arbitrary text', () => {
    expect(
      extractYouTubeVideoId('not a youtube link'),
    ).toBeNull()
  })
})

describe('createYouTubeEmbedUrl', () => {
  it('creates a privacy-enhanced embed URL', () => {
    expect(
      createYouTubeEmbedUrl(
        `https://youtu.be/${VIDEO_ID}`,
      ),
    ).toBe(
      `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`,
    )
  })

  it('returns null for unsupported URLs', () => {
    expect(
      createYouTubeEmbedUrl('https://example.org/video'),
    ).toBeNull()
  })
})

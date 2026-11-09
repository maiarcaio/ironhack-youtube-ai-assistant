
/**
 * VideoMind AI — YouTube URL utilities.
 *
 * Converts a supported YouTube URL into a video ID.
 * The video ID is the 11-character identifier used by
 * YouTube's embedded player.
 *
 * Important: URL parsing does not prove that a video
 * exists, is public, or permits embedding.
 */

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
])

const SHORT_LINK_HOSTS = new Set([
  'youtu.be',
  'www.youtu.be',
])

/**
 * Accept a URL only when its hostname belongs to
 * YouTube. This excludes misleading domains such as
 * youtube.com.example.org.
 */
export function extractYouTubeVideoId(
  input: string,
): string | null {
  const trimmed = input.trim()

  if (!trimmed) return null

  let url: URL

  try {
    // Allow a pasted YouTube domain without "https://".
    const normalized =
      /^https?:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`

    url = new URL(normalized)
  } catch {
    return null
  }

  // Accept secure URLs only.
  if (url.protocol !== 'https:') {
    return null
  }

  // Reject credentials or nonstandard ports.
  if (url.username || url.password || url.port) {
    return null
  }

  const hostname = url.hostname.toLowerCase()
  const segments = url.pathname
    .split('/')
    .filter(Boolean)

  let candidate: string | null = null

  if (SHORT_LINK_HOSTS.has(hostname)) {
    // Example: https://youtu.be/jfKfPfyJRdk
    if (segments.length === 1) {
      candidate = segments[0]
    }
  } else if (YOUTUBE_HOSTS.has(hostname)) {
    const [section, videoId] = segments

    if (section === 'watch' && segments.length === 1) {
      // Example: youtube.com/watch?v=jfKfPfyJRdk
      candidate = url.searchParams.get('v')
    } else if (
      segments.length === 2 &&
      ['shorts', 'embed', 'live', 'v'].includes(section)
    ) {
      // Examples:
      // youtube.com/shorts/jfKfPfyJRdk
      // youtube.com/embed/jfKfPfyJRdk
      // youtube.com/live/jfKfPfyJRdk
      candidate = videoId
    }
  } else {
    return null
  }

  // Never construct a player URL using an invalid ID.
  return candidate && VIDEO_ID_PATTERN.test(candidate)
    ? candidate
    : null
}

/**
 * A privacy-enhanced URL for embedding.
 * Returns null rather than an invalid iframe URL.
 */
export function createYouTubeEmbedUrl(
  input: string,
): string | null {
  const videoId = extractYouTubeVideoId(input)

  return videoId
    ? `https://www.youtube-nocookie.com/embed/${videoId}`
    : null
}

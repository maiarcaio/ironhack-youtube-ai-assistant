
import type {
  IngestVideoRequest,
  IngestVideoResponse,
  VideoListResponse,
  VideoStatus,
  VideoStatusResponse,
} from '../../types/video'

// One record stored by our simulated backend.
interface MockVideo {
  id: string
  sourceUrl: string
  createdAt: number
}

// Map stores records using their application video ID as the key.
// These records exist only in memory, not in a database.
const mockVideos = new Map<string, MockVideo>()

// Simulate network latency so we can test loading behavior.
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// Determine a video's simulated processing state.
//
// We use the same function for status polling and library listing,
// so the two endpoints cannot disagree about the current state.
function getMockStatus(video: MockVideo): VideoStatus {
  const elapsed = Date.now() - video.createdAt

  if (elapsed < 1500) {
    return 'queued'
  }

  if (elapsed < 4000) {
    return 'processing'
  }

  return 'ready'
}

// Validate the URL before accepting a simulated video.
// This checks the domain, not whether the video is available.
function validateYouTubeUrl(value: string): void {
  if (!value.trim()) {
    throw new Error('A video URL is required.')
  }

  const url = new URL(value)

  const supportedHosts = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ]

  if (
    url.protocol !== 'https:' &&
    url.protocol !== 'http:'
  ) {
    throw new Error('Please enter a valid YouTube URL.')
  }

  if (!supportedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error('Please enter a valid YouTube URL.')
  }
}

// Simulate POST /api/v1/videos/ingest.
export async function ingestVideo(
  request: IngestVideoRequest,
): Promise<IngestVideoResponse> {
  validateYouTubeUrl(request.url)

  await delay(500)

  // The application's ID is different from the YouTube ID.
  const videoId = crypto.randomUUID()

  mockVideos.set(videoId, {
    id: videoId,
    sourceUrl: request.url,
    createdAt: Date.now(),
  })

  return {
    video_id: videoId,
    status: 'queued',
  }
}

// Simulate GET /api/v1/videos/{video_id}/status.
export async function getVideoStatus(
  videoId: string,
): Promise<VideoStatusResponse> {
  await delay(200)

  const video = mockVideos.get(videoId)

  if (!video) {
    throw new Error('Video not found.')
  }

  const status = getMockStatus(video)

  return {
    video_id: video.id,
    status,

    // This is test metadata, not a real YouTube title.
    title:
      status === 'ready'
        ? 'Example YouTube Video'
        : undefined,
  }
}

// Simulate GET /api/v1/videos.
//
// The mock returns the same normalized structure as our
// real HTTP adapter, so React can use either implementation.
export async function listVideos(): Promise<VideoListResponse> {
  const videos = Array.from(mockVideos.values()).map(
    (video) => ({
      video_id: video.id,

      // The mock still uses a clearly artificial title.
      title: 'Example YouTube Video',

      status: getMockStatus(video),
      source_url: video.sourceUrl,
    }),
  )

  return { videos }
}


import type {
  IngestVideoRequest,
  IngestVideoResponse,
  VideoStatusResponse,
} from '../../types/video'

// Represents a video being processed by our mock backend.
interface MockVideo {
  id: string
  createdAt: number
}

// Store submitted videos in memory while the page is open.
const mockVideos = new Map<string, MockVideo>()

// Simulates a small amount of network latency.
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

// Simulate submitting a video to the backend.
export async function ingestVideo(
  request: IngestVideoRequest,
): Promise<IngestVideoResponse> {
  if (!request.url.trim()) {
    throw new Error('A video URL is required.')
  }

  // URL validates the structure, not whether the video exists.
  const url = new URL(request.url)

  // Accept only supported YouTube domains in this mock.
  const supportedHosts = [
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'youtu.be',
  ]

  if (!supportedHosts.includes(url.hostname.toLowerCase())) {
    throw new Error('Please enter a valid YouTube URL.')
  }

  await delay(500)

  // Generate a different identifier for every submission.
  const videoId = crypto.randomUUID()

  mockVideos.set(videoId, {
    id: videoId,
    createdAt: Date.now(),
  })

  return {
    video_id: videoId,
    status: 'queued',
  }
}

// Simulate checking the processing status of a video.
export async function getVideoStatus(
  videoId: string,
): Promise<VideoStatusResponse> {
  await delay(200)

  const video = mockVideos.get(videoId)

  if (!video) {
    throw new Error('Video not found.')
  }

  // Calculate how long this mock video has been processing.
  const elapsed = Date.now() - video.createdAt

  if (elapsed < 1500) {
    return {
      video_id: video.id,
      status: 'queued',
    }
  }

  if (elapsed < 4000) {
    return {
      video_id: video.id,
      status: 'processing',
    }
  }

  return {
    video_id: video.id,
    status: 'ready',
    title: 'Example YouTube Video',
  }
}

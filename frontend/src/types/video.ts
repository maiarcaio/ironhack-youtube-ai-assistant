
// The processing states used by our React interface.
export type VideoStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'

// The complete video object used inside our existing React UI.
export interface Video {
  id: string
  source_url: string
  title: string
  thumbnail_url: string | null
  status: VideoStatus
  // The authenticated list endpoint does not expose a timestamp yet.
  created_at?: string
  error?: string | null
}

// Request sent when the user submits a YouTube URL.
export interface IngestVideoRequest {
  url: string
}

// Response returned immediately after submitting a video.
export interface IngestVideoResponse {
  video_id: string
  status: VideoStatus
}

export interface AudioPlaybackResponse {
  video_id: string
  url: string
  expires_in: number
  media_type: 'audio'
}

// Normalized status response used by our frontend.
export interface VideoStatusResponse {
  video_id: string
  status: VideoStatus
  title?: string | null
  thumbnail_url?: string | null
  error?: string | null
}

// One video returned by the FastAPI library endpoint.
// This is a frontend-friendly representation of the backend item.
export interface VideoLibraryItem {
  video_id: string
  title: string
  status: VideoStatus
  source_url: string | null
}

// The complete video collection returned by listVideos().
export interface VideoListResponse {
  videos: VideoLibraryItem[]
}


// Represents all possible video processing states.
export type VideoStatus =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed'

// Represents a video stored in the application.
export interface Video {
  id: string
  source_url: string
  title: string
  thumbnail_url: string | null
  status: VideoStatus
  created_at: string
  error?: string | null
}

// Data sent to the backend when requesting video ingestion.
export interface IngestVideoRequest {
  url: string
}

// Initial response from the backend after ingestion is requested.
export interface IngestVideoResponse {
  video_id: string
  status: VideoStatus
}

// Response used to check whether processing has finished.
export interface VideoStatusResponse {
  video_id: string
  status: VideoStatus
  title?: string | null
  thumbnail_url?: string | null
  error?: string | null
}

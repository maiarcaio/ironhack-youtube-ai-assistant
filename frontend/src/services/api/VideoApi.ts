
import type {
  IngestVideoRequest,
  IngestVideoResponse,
  VideoStatusResponse,
} from '../../types/video'

// Defines the operations that every video API must provide.
export interface VideoApi {
  // Submit a YouTube URL and receive a video identifier.
  ingestVideo(
    request: IngestVideoRequest,
  ): Promise<IngestVideoResponse>

  // Retrieve the current processing status of a video.
  getVideoStatus(
    videoId: string,
  ): Promise<VideoStatusResponse>
}

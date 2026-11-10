
import type {
  AudioPlaybackResponse,
  IngestVideoRequest,
  IngestVideoResponse,
  VideoListResponse,
  VideoStatusResponse,
} from '../../types/video'

// This interface is a contract shared by both API implementations.
//
// React does not need to know whether the data comes from
// our mock backend or Diogo's FastAPI application.
export interface VideoApi {
  // Submit a YouTube video for processing.
  ingestVideo(
    request: IngestVideoRequest,
  ): Promise<IngestVideoResponse>

  uploadAudio(file: File): Promise<IngestVideoResponse>

  getAudioPlayback(videoId: string): Promise<AudioPlaybackResponse>

  // Check whether one video has finished processing.
  getVideoStatus(
    videoId: string,
  ): Promise<VideoStatusResponse>

  // Retrieve the collection of available videos.
  listVideos(): Promise<VideoListResponse>
}

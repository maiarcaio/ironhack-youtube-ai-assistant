
import type { VideoApi } from './VideoApi'
import {
  ingestVideo,
  getVideoStatus,
} from './videos'

// Adapt the existing mock functions to our common API contract.
export const mockVideoApi: VideoApi = {
  ingestVideo,
  getVideoStatus,
}

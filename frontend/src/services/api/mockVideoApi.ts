
import type { VideoApi } from './VideoApi'

import {
  ingestVideo,
  getVideoStatus,
  listVideos,
} from './videos'

// The mock adapter implements the same interface as FastAPI.
//
// We reuse the existing mock functions instead of duplicating
// the simulation logic inside this file.
export const mockVideoApi: VideoApi = {
  ingestVideo,
  getVideoStatus,
  listVideos,
}

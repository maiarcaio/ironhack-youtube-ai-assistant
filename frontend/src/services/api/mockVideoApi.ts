
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
  async uploadAudio() {
    throw new Error('Audio upload is unavailable in demo mode.')
  },
  async getAudioPlayback() {
    throw new Error('Audio playback is unavailable in demo mode.')
  },
  getVideoStatus,
  listVideos,
}

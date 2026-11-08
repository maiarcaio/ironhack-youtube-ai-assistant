
import type { VideoApi } from './VideoApi'
import { mockVideoApi } from './mockVideoApi'
import { createHttpVideoApi } from './httpVideoApi'

// Demo data is available only through explicit configuration.
const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true'

// The backend URL is supplied through Vite environment variables.
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Select the implementation once, keeping React independent.
export const videoApi: VideoApi = useMockApi
  ? mockVideoApi
  : createHttpVideoApi(apiBaseUrl)

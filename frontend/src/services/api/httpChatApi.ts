
import type {
  ChatRequest,
  ChatResponse,
} from '../../types/chat'

import { validateChatResponse } from './chatValidators'

// RAG generation can take longer than a simple status request.
const CHAT_TIMEOUT_MS = 45_000

// Defines the functionality provided by our chat client.
export interface ChatApi {
  sendMessage(request: ChatRequest): Promise<ChatResponse>
}

export type AccessTokenProvider = () => Promise<string | null>

// Create a chat client for a particular backend address.
export function createHttpChatApi(
  baseUrl: string,
  getAccessToken?: AccessTokenProvider,
): ChatApi {
  // Remove trailing slashes to avoid malformed URLs.
  const apiBase = baseUrl.replace(/\/+$/, '')

  return {
    async sendMessage(
      request: ChatRequest,
    ): Promise<ChatResponse> {
      // Avoid sending blank questions to the backend.
      if (!request.video_id.trim()) {
        throw new Error('A video must be selected.')
      }

      if (!request.message.trim()) {
        throw new Error('Please enter a question.')
      }

      // The current backend has not implemented Deep Analysis.
      if (
        request.analysis_mode !== undefined &&
        request.analysis_mode !== 'auto'
      ) {
        throw new Error('Deep Analysis is not available yet.')
      }

      // Explicit language selection is not implemented yet.
      if (request.response_language != null) {
        throw new Error(
          'Explicit response language is not available yet.',
        )
      }

      const accessToken = getAccessToken
        ? await getAccessToken()
        : null

      if (getAccessToken && !accessToken) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      // AbortController cancels a request that takes too long.
      const controller = new AbortController()

      const timeoutId = setTimeout(() => {
        controller.abort()
      }, CHAT_TIMEOUT_MS)

      try {
        const response = await fetch(
          `${apiBase}/api/v1/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : {}),
            },
            body: JSON.stringify({
              video_id: request.video_id,
              message: request.message,
              analysis_mode: 'auto',

              // Preserve the backend conversation identifier.
              thread_id: request.thread_id ?? null,
            }),
            signal: controller.signal,
          },
        )

        // fetch() doesn't automatically reject HTTP errors.
        if (!response.ok) {
          throw new Error(
            `Chat request failed (${response.status})`,
          )
        }

        // Treat external JSON as unknown until validated.
        const data: unknown = await response.json()

        const validatedResponse = validateChatResponse(data)

        // Prevent one video's response being used for another.
        if (validatedResponse.video_id !== request.video_id) {
          throw new Error('Chat response video ID mismatch.')
        }

        return validatedResponse
      } catch (error) {
        if (controller.signal.aborted) {
          throw new Error(
            'The chat request timed out. Please try again.',
            { cause: error },
          )
        }

        throw error
      } finally {
        // Prevent the timer from running after completion.
        clearTimeout(timeoutId)
      }
    },
  }
}

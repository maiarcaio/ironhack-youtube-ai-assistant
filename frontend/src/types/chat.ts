
/**
 * Types for Diogo's FastAPI V1 chat contract.
 *
 * An interface describes which properties an object
 * must have and which ones are optional.
 */

// The backend defines two possible analysis modes.
// Only "auto" is implemented in the current RAG backend.
export type ChatAnalysisMode = 'auto' | 'deep'

// Evidence can originate from a transcript or video frame.
export type ChatSourceType = 'transcript' | 'frame'

// The information React sends when asking a question.
export interface ChatRequest {
  video_id: string
  message: string

  // Reuse this ID when continuing a conversation.
  thread_id?: string | null

  // The current backend supports "auto".
  analysis_mode?: ChatAnalysisMode

  // Explicit language selection is not implemented yet.
  response_language?: string | null
}

// One piece of supporting evidence returned by RAG.
export interface ChatSource {
  chunk_id: string
  excerpt: string

  // Null means the backend has no verified timestamp.
  start_seconds: number | null
  end_seconds: number | null

  source_type: ChatSourceType
}

// The complete response expected from FastAPI.
export interface ChatResponse {
  video_id: string
  thread_id: string
  answer: string
  sources: ChatSource[]

  // True means the evidence was not sufficient.
  insufficient_evidence: boolean

  model_used: string | null
}

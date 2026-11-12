
import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

import type { ChatApi } from '../../services/api/httpChatApi'
import type { ChatSource, ChatAnalysisMode } from '../../types/chat'
import type {
  streamVideoQuestion,
} from '../../services/api/videomindBackend'

import { ChatMessage } from './ChatMessage'
import type {
  AssistantMessageStatus,
  ConversationMessage,
} from './ChatMessage'

import './ChatPanel.css'

// Each video maintains an independent conversation and thread.
interface ChatSession {
  messages: ConversationMessage[]
  threadId: string | null
}

// Streaming is optional to preserve existing ChatApi tests.
interface ChatPanelProps {
  videoId: string | null
  isReadyForChat: boolean
  api: ChatApi
  stream?: typeof streamVideoQuestion
  onSeek?: (seconds: number) => void
  presentation?: 'workspace' | 'qa'
}

const EMPTY_SESSION: ChatSession = {
  messages: [],
  threadId: null,
}

function AnalysisModeIcon({ mode }: { mode: ChatAnalysisMode }) {
  if (mode === 'auto') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.5 13a7.5 7.5 0 0 1 15 0" />
        <path d="M4 16c2-1.6 4-1.6 6 0s4 1.6 6 0 3.3-1.6 4-1" />
        <path d="M7 19h10" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M4.5 12c0-3.8 3.4-6.8 7.5-6.8s7.5 3 7.5 6.8-3.4 6.8-7.5 6.8S4.5 15.8 4.5 12Z" />
      <path d="M8.3 4.4c2.2 1.2 4.3 3.7 5.7 6.7 1.5 3.2 1.8 6.3 1 8.5" />
    </svg>
  )
}

export function ChatPanel({
  videoId,
  isReadyForChat,
  api,
  stream,
  onSeek,
  presentation = 'workspace',
}: ChatPanelProps) {
  // Store data independently for each selected video.
  const [sessions, setSessions] = useState<
    Record<string, ChatSession>
  >({})

  const [drafts, setDrafts] = useState<
    Record<string, string>
  >({})

  const [errors, setErrors] = useState<
    Record<string, string | null>
  >({})

  const [sendingByVideo, setSendingByVideo] = useState<
    Record<string, boolean>
  >({})

  // Terra is the default; Sol enables Deep Analysis.
  const [analysisMode, setAnalysisMode] = useState<ChatAnalysisMode>('auto')

  // Refs protect against duplicate requests before rerendering.
  const pendingRequests = useRef(new Set<string>())
  const nextMessageNumber = useRef(0)

  const activeId = videoId ?? ''
  const session = sessions[activeId] ?? EMPTY_SESSION
  const draft = drafts[activeId] ?? ''
  const isSending = sendingByVideo[activeId] === true
  const error = errors[activeId] ?? null
  const latestSources = ([...session.messages]
    .reverse()
    .find((message): message is Extract<ConversationMessage, { role: 'assistant' }> => message.role === 'assistant' && Boolean(message.sources?.length))
    ?.sources ?? []).filter((source): source is ChatSource & { start_seconds: number } => source.start_seconds !== null)

  const canSubmit =
    Boolean(videoId) &&
    isReadyForChat &&
    !isSending &&
    draft.trim().length > 0 &&
    draft.length <= 500

  function updateDraft(value: string) {
    if (!videoId) return

    setDrafts((current) => ({
      ...current,
      [videoId]: value,
    }))
  }

  function createMessageId(videoKey: string): string {
    nextMessageNumber.current += 1
    return `${videoKey}-message-${nextMessageNumber.current}`
  }

  // Update one conversation without changing other videos.
  function updateSession(
    videoKey: string,
    updater: (previous: ChatSession) => ChatSession,
  ) {
    setSessions((current) => ({
      ...current,
      [videoKey]: updater(
        current[videoKey] ?? EMPTY_SESSION,
      ),
    }))
  }

  // Modify the same assistant message as tokens arrive.
  function updateAssistantMessage(
    videoKey: string,
    messageId: string,
    changes: {
      text?: string
      sources?: ChatSource[]
      insufficient_evidence?: boolean
      status?: AssistantMessageStatus
    },
  ) {
    updateSession(videoKey, (previous) => ({
      ...previous,
      messages: previous.messages.map((message) =>
        message.id === messageId &&
        message.role === 'assistant'
          ? { ...message, ...changes }
          : message,
      ),
    }))
  }

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    // Capture the original video before starting async work.
    const requestVideoId = videoId

    if (
      !requestVideoId ||
      !isReadyForChat ||
      pendingRequests.current.has(requestVideoId)
    ) {
      return
    }

    const question = (drafts[requestVideoId] ?? '').trim()

    if (!question || question.length > 500) return

    const threadId =
      sessions[requestVideoId]?.threadId ?? null
    const requestedAnalysisMode = analysisMode

    pendingRequests.current.add(requestVideoId)

    setSendingByVideo((current) => ({
      ...current,
      [requestVideoId]: true,
    }))

    setErrors((current) => ({
      ...current,
      [requestVideoId]: null,
    }))

    setDrafts((current) => ({
      ...current,
      [requestVideoId]: '',
    }))

    const userMessage: ConversationMessage = {
      id: createMessageId(requestVideoId),
      role: 'user',
      text: question,
    }

    updateSession(requestVideoId, (previous) => ({
      ...previous,
      messages: [...previous.messages, userMessage],
    }))

    let activeAssistantId: string | null = null

    try {
      if (stream) {
        // Create one assistant message to update progressively.
        const assistantId = createMessageId(requestVideoId)
        activeAssistantId = assistantId
        const assistantStatus: AssistantMessageStatus = 'pending'

        const assistantMessage: ConversationMessage = {
          id: assistantId,
          role: 'assistant',
          text: '',
          sources: [],
          insufficient_evidence: false,
          status: assistantStatus,
        }

        updateSession(requestVideoId, (previous) => ({
          ...previous,
          messages: [...previous.messages, assistantMessage],
        }))

        // Keep a local copy because React state updates are async.
        let streamedAnswer = ''
        let receivedThreadId: string | null = null

        await stream(
          {
            video_id: requestVideoId,
            message: question,
            thread_id: threadId,
            analysis_mode: requestedAnalysisMode,
          },
          {
            onMeta(meta) {
              if (meta.video_id !== requestVideoId) {
                throw new Error(
                  'Streaming response video ID mismatch.',
                )
              }

              receivedThreadId = meta.thread_id
            },

            onToken(text) {
              streamedAnswer += text

              updateAssistantMessage(
                requestVideoId,
                assistantId,
                { text: streamedAnswer, status: 'streaming' },
              )
            },

            onSources(sources) {
              // Sources include the real transcript timestamps.
              updateAssistantMessage(
                requestVideoId,
                assistantId,
                { sources },
              )
            },

            onDone(result) {
              // The completion event is authoritative.
              updateAssistantMessage(
                requestVideoId,
                assistantId,
                {
                  text: result.answer,
                  insufficient_evidence:
                    result.insufficient_evidence,
                  status: 'complete',
                },
              )

              // Save the conversation thread for the next turn.
              updateSession(requestVideoId, (previous) => ({
                ...previous,
                threadId:
                  receivedThreadId ??
                  result.thread_id,
              }))
            },
          },
        )
      } else {
        // Preserve the existing non-streaming API behavior.
        const response = await api.sendMessage({
          video_id: requestVideoId,
          message: question,
          thread_id: threadId,
          analysis_mode: requestedAnalysisMode,
        })

        if (response.video_id !== requestVideoId) {
          throw new Error(
            'Chat response video ID mismatch.',
          )
        }

        const assistantMessage: ConversationMessage = {
          id: createMessageId(requestVideoId),
          role: 'assistant',
          text: response.answer,
          sources: response.sources,
          insufficient_evidence:
            response.insufficient_evidence,
          status: 'complete',
        }

        updateSession(requestVideoId, (previous) => ({
          messages: [
            ...previous.messages,
            assistantMessage,
          ],
          threadId: response.thread_id,
        }))
      }
    } catch (caughtError) {
      // Preserve visible partial text but report the failed stream.
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : 'The question could not be answered.'

      setErrors((current) => ({
        ...current,
        [requestVideoId]: message,
      }))

      if (activeAssistantId) {
        updateAssistantMessage(
          requestVideoId,
          activeAssistantId,
          { status: 'error' },
        )
      }
    } finally {
      pendingRequests.current.delete(requestVideoId)

      setSendingByVideo((current) => ({
        ...current,
        [requestVideoId]: false,
      }))
    }
  }

  return (
    <section
      className={`vm-chat-panel ${presentation === 'qa' ? 'vm-chat-panel-qa' : ''}`}
      aria-label="Video Q&A"
    >
      <header className="vm-chat-panel-header">
        <div>
          <p className="vm-chat-panel-eyebrow">
            GROUNDED VIDEO Q&A
          </p>

          <h2>Ask VideoMind AI</h2>

          <p className="vm-chat-panel-description">
            Explore your video through questions and
            source-backed answers.
          </p>
        </div>
      </header>

      {presentation === 'qa' && (
        <section className="vm-chat-referenced" aria-label="Referenced moments">
          <div className="vm-chat-referenced-heading"><h3>Referenced moments</h3><span>{latestSources.length} citations found</span></div>
          {latestSources.length > 0 ? latestSources.map((source) => (
            <button key={source.chunk_id} type="button" onClick={() => onSeek?.(source.start_seconds)} className="vm-chat-reference-card" aria-label={`Jump to ${Math.floor(source.start_seconds / 60).toString().padStart(2, '0')}:${Math.floor(source.start_seconds % 60).toString().padStart(2, '0')} in video`}><strong>{Math.floor(source.start_seconds / 60).toString().padStart(2, '0')}:{Math.floor(source.start_seconds % 60).toString().padStart(2, '0')}</strong><span>{source.excerpt}</span></button>
          )) : <div className="vm-chat-reference-empty">Cited moments will appear here after the backend returns transcript evidence.</div>}
        </section>
      )}

      <div
        className="vm-chat-panel-conversation"
        aria-label="Conversation"
        aria-live="polite"
      >
        {session.messages.length === 0 && (
          <div className="vm-chat-empty">
            <span className="vm-chat-empty-icon">
              ✦
            </span>

            <h3>Start exploring this video</h3>

            <p>
              Ask about concepts, explanations, or
              ideas discussed in the video.
            </p>
          </div>
        )}

        {session.messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onSeek={onSeek}
          />
        ))}

        {isSending && (
          <div
            className="vm-chat-loading"
            role="status"
            aria-live="polite"
          >
            <span className="vm-chat-loading-spinner" aria-hidden="true" />
            {stream
              ? 'Receiving answer…'
              : 'Preparing grounded answer…'}
          </div>
        )}
      </div>

      {error && (
        <p
          className="vm-chat-panel-error"
          role="alert"
        >
          {error}
        </p>
      )}

      {!videoId && (
        <p className="vm-chat-panel-notice">
          Select a video to start a conversation.
        </p>
      )}

      {videoId && !isReadyForChat && (
        <p className="vm-chat-panel-notice">
          Chat is unavailable until this video has
          been indexed by the backend.
        </p>
      )}

      <fieldset
        disabled={isSending}
        aria-label="Analysis mode"
        className="vm-analysis-mode"
      >
        <legend>Analysis mode</legend>
        <div className="vm-analysis-mode-options">
          <button
            type="button"
            aria-label="Terra Quick answers"
            aria-pressed={analysisMode === 'auto'}
            onClick={() => setAnalysisMode('auto')}
          >
            <span className="vm-analysis-mode-icon">
              <AnalysisModeIcon mode="auto" />
            </span>
            <span className="vm-analysis-mode-copy">
              <strong>Terra</strong>
              <small>Quick answers</small>
            </span>
          </button>
          <button
            type="button"
            aria-label="Sol Deep Analysis"
            aria-pressed={analysisMode === 'deep'}
            onClick={() => setAnalysisMode('deep')}
          >
            <span className="vm-analysis-mode-icon">
              <AnalysisModeIcon mode="deep" />
            </span>
            <span className="vm-analysis-mode-copy">
              <strong>Sol</strong>
              <small>Deep Analysis</small>
            </span>
          </button>
        </div>
      </fieldset>

      <form
        className="vm-chat-composer"
        onSubmit={handleSubmit}
      >
        <label htmlFor="vm-chat-question">
          Your question
        </label>

        <textarea
          id="vm-chat-question"
          rows={3}
          value={draft}
          maxLength={500}
          onChange={(event) => {
            updateDraft(event.target.value)
          }}
          placeholder="Ask something about this video…"
          disabled={
            !videoId ||
            !isReadyForChat ||
            isSending
          }
        />

        <div className="vm-chat-composer-actions">
          <span>
            Responses depend on available video evidence.
          </span>

          <button
            type="submit"
            disabled={!canSubmit}
          >
            {isSending ? 'Answering…' : 'Send question'}
          </button>
        </div>
      </form>
    </section>
  )
}

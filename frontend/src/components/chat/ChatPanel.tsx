
import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

import type { ChatApi } from '../../services/api/httpChatApi'
import type { ChatSource } from '../../types/chat'
import type {
  streamVideoQuestion,
} from '../../services/api/videomindBackend'

import { ChatMessage } from './ChatMessage'
import type { ConversationMessage } from './ChatMessage'

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

    try {
      if (stream) {
        // Create one assistant message to update progressively.
        const assistantId = createMessageId(requestVideoId)

        const assistantMessage: ConversationMessage = {
          id: assistantId,
          role: 'assistant',
          text: '',
          sources: [],
          insufficient_evidence: false,
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
                { text: streamedAnswer },
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
          analysis_mode: 'auto',
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
          >
            {stream
              ? 'Streaming answer from VideoMind AI…'
              : 'Retrieving evidence and preparing an answer…'}
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

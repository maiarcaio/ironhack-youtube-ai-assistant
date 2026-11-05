
import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

import type { ChatApi } from '../../services/api/httpChatApi'
import { ChatMessage } from './ChatMessage'
import type { ConversationMessage } from './ChatMessage'

import './ChatPanel.css'

// Every video has its own messages and backend thread ID.
interface ChatSession {
  messages: ConversationMessage[]
  threadId: string | null
}

// The panel depends on an API interface, not a specific backend.
interface ChatPanelProps {
  videoId: string | null
  isReadyForChat: boolean
  api: ChatApi
  onSeek?: (seconds: number) => void
}

// Used when a video has no existing conversation.
const EMPTY_SESSION: ChatSession = {
  messages: [],
  threadId: null,
}

export function ChatPanel({
  videoId,
  isReadyForChat,
  api,
  onSeek,
}: ChatPanelProps) {
  // Store conversation histories using the video ID as the key.
  const [sessions, setSessions] = useState<
    Record<string, ChatSession>
  >({})

  // Keep each video's unfinished question separately.
  const [drafts, setDrafts] = useState<
    Record<string, string>
  >({})

  // Error messages also belong to a specific video.
  const [errors, setErrors] = useState<
    Record<string, string | null>
  >({})

  // Track which videos currently have a pending question.
  const [sendingByVideo, setSendingByVideo] = useState<
    Record<string, boolean>
  >({})

  // A Set prevents duplicate submissions before React rerenders.
  const pendingRequests = useRef(new Set<string>())

  // Generate stable, locally unique message IDs.
  const nextMessageNumber = useRef(0)

  // Read only the session for the currently selected video.
  const activeId = videoId ?? ''
  const session = sessions[activeId] ?? EMPTY_SESSION
  const draft = drafts[activeId] ?? ''
  const isSending = sendingByVideo[activeId] === true
  const error = errors[activeId] ?? null

  // Never allow submissions for an unavailable video.
  const canSubmit =
    Boolean(videoId) &&
    isReadyForChat &&
    !isSending &&
    draft.trim().length > 0

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

  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    // Prevent the browser from refreshing the page.
    event.preventDefault()

    // Capture the video ID before making an asynchronous request.
    // The selected video could change while the API is responding.
    const requestVideoId = videoId

    if (
      !requestVideoId ||
      !isReadyForChat ||
      pendingRequests.current.has(requestVideoId)
    ) {
      return
    }

    const question = (drafts[requestVideoId] ?? '').trim()

    if (!question) return

    // Save the current thread ID for this specific video.
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

    // Clear only the selected video's composer.
    setDrafts((current) => ({
      ...current,
      [requestVideoId]: '',
    }))

    const userMessage: ConversationMessage = {
      id: createMessageId(requestVideoId),
      role: 'user',
      text: question,
    }

    // Show the user's question immediately.
    setSessions((current) => {
      const previous = current[requestVideoId] ?? EMPTY_SESSION

      return {
        ...current,
        [requestVideoId]: {
          ...previous,
          messages: [...previous.messages, userMessage],
        },
      }
    })

    try {
      // Our tested HTTP client handles validation and timeouts.
      const response = await api.sendMessage({
        video_id: requestVideoId,
        message: question,
        thread_id: threadId,
        analysis_mode: 'auto',
      })

      // This check also protects clients used in testing.
      if (response.video_id !== requestVideoId) {
        throw new Error('Chat response video ID mismatch.')
      }

      const assistantMessage: ConversationMessage = {
        id: createMessageId(requestVideoId),
        role: 'assistant',
        text: response.answer,
        sources: response.sources,
        insufficient_evidence:
          response.insufficient_evidence,
      }

      // Store the answer under the ORIGINAL video ID.
      // A late response must never appear in another video.
      setSessions((current) => {
        const previous =
          current[requestVideoId] ?? EMPTY_SESSION

        return {
          ...current,
          [requestVideoId]: {
            messages: [
              ...previous.messages,
              assistantMessage,
            ],
            threadId: response.thread_id,
          },
        }
      })
    } catch (caughtError) {
      // Show an actual failure; do not generate a fake answer.
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
      className="vm-chat-panel"
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
            Retrieving evidence and preparing an answer…
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
            Send question
          </button>
        </div>
      </form>
    </section>
  )
}

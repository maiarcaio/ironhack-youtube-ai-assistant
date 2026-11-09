
import type { ChatSource } from '../../types/chat'
import { SourceCitation } from './SourceCitation'

import './ChatMessage.css'

// A discriminated union describes our two message types.
//
// A user message contains a question.
// An assistant message also contains evidence information.
//
// TypeScript uses "role" to determine which properties exist.
export type ConversationMessage =
  | {
      id: string
      role: 'user'
      text: string
    }
  | {
      id: string
      role: 'assistant'
      text: string
      sources: ChatSource[]
      insufficient_evidence: boolean
    }

interface ChatMessageProps {
  message: ConversationMessage

  // The player integration will supply this callback later.
  onSeek?: (seconds: number) => void
}

// Display one message without making network requests.
export function ChatMessage({
  message,
  onSeek,
}: ChatMessageProps) {
  const isAssistant = message.role === 'assistant'

  const label = isAssistant ? 'VideoMind AI' : 'You'

  return (
    <article
      className={`vm-chat-message vm-chat-message--${message.role}`}
      aria-label={`${label} message`}
    >
      <header className="vm-chat-message-header">
        <span className="vm-chat-message-author">
          {label}
        </span>

        {isAssistant && message.insufficient_evidence && (
          <span className="vm-chat-evidence-warning">
            Insufficient evidence
          </span>
        )}
      </header>

      <div className="vm-chat-message-body">
        {message.text.trim()
          ? message.text
          : isAssistant
            ? 'No answer was returned by the API.'
            : ''}
      </div>

      {isAssistant && message.sources.length > 0 && (
        <section
          className="vm-chat-message-evidence"
          aria-label="Supporting evidence"
        >
          <h3>Evidence from this video</h3>

          <div className="vm-chat-message-sources">
            {message.sources.map((source) => (
              <SourceCitation
                key={source.chunk_id}
                source={source}
                onSeek={onSeek}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

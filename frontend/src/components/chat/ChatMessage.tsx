
import { Fragment } from 'react'
import type { ReactNode } from 'react'

import type { ChatSource } from '../../types/chat'
import { SourceCitation } from './SourceCitation'

import './ChatMessage.css'

export type AssistantMessageStatus =
  | 'pending'
  | 'streaming'
  | 'complete'
  | 'error'

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
      status?: AssistantMessageStatus
    }

interface ChatMessageProps {
  message: ConversationMessage

  // The player integration will supply this callback later.
  onSeek?: (seconds: number) => void
}

function renderInlineFormatting(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }

      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index}>{part.slice(1, -1)}</em>
      }

      return part
    })
}

function FormattedAssistantText({ text }: { text: string }) {
  return text
    .split(/\r?\n(?:[ \t]*\r?\n)+/)
    .map((paragraph, paragraphIndex) => (
      <p key={paragraphIndex}>
        {paragraph.split(/\r?\n/).map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {renderInlineFormatting(line)}
          </Fragment>
        ))}
      </p>
    ))
}

function presentCitationMarkers(text: string, sources: ChatSource[]): string {
  if (sources.length === 0) return text
  const known = new Set(sources.map((source) => source.chunk_id.match(/\d+/g)?.at(-1)).filter(Boolean).map(Number))
  return text.replace(/\[Chunks?\s+(\d+)(?:\s*[–-]\s*(\d+))?\]/gi, (marker, first: string, last?: string) => {
    const values = last
      ? Array.from({ length: Number(last) - Number(first) + 1 }, (_, index) => String(Number(first) + index).padStart(first.length, '0'))
      : [first]
    return values.every((value) => known.has(Number(value))) ? '' : marker
  }).replace(/[ \t]{2,}/g, ' ').trim()
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

      <div
        className={`vm-chat-message-body${isAssistant ? ' vm-chat-message-body--formatted' : ''}`}
      >
        {message.text.trim()
          ? isAssistant
            ? <FormattedAssistantText text={presentCitationMarkers(message.text, message.sources)} />
            : message.text
          : isAssistant
            ? message.status === 'complete' || message.status === undefined
              ? 'No answer was returned by the API.'
              : null
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

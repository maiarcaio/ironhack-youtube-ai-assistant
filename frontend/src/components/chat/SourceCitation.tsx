
import type { ChatSource } from '../../types/chat'
import './SourceCitation.css'

// The parent can supply a seek handler after the
// YouTube player has been integrated.
interface SourceCitationProps {
  source: ChatSource
  onSeek?: (seconds: number) => void
}

// Convert a verified number of seconds to a readable time.
// Videos over one hour use HH:MM:SS.
function formatTimestamp(value: number): string {
  const totalSeconds = Math.floor(value)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const paddedSeconds = String(seconds).padStart(2, '0')
  const paddedMinutes = String(minutes).padStart(2, '0')

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${paddedMinutes}:${paddedSeconds}`
  }

  return `${paddedMinutes}:${paddedSeconds}`
}

// Display only evidence supplied by the backend.
export function SourceCitation({
  source,
  onSeek,
}: SourceCitationProps) {
  const sourceLabel =
    source.source_type === 'frame'
      ? 'Video frame'
      : 'Transcript'

  // A zero-second timestamp is valid.
  // Null, negative, and non-finite values are not.
  const startSeconds =
    source.start_seconds !== null &&
    Number.isFinite(source.start_seconds) &&
    source.start_seconds >= 0
      ? source.start_seconds
      : null

  const timestamp =
    startSeconds !== null
      ? formatTimestamp(startSeconds)
      : null

  // Seeking is only enabled when both a real timestamp
  // and a player callback are available.
  const canSeek =
    startSeconds !== null &&
    typeof onSeek === 'function'

  function handleSeek() {
    if (startSeconds !== null) {
      onSeek?.(startSeconds)
    }
  }

  return (
    <article
      className="vm-source-citation"
      aria-label={`${sourceLabel} evidence`}
    >
      <div className="vm-source-header">
        <span className="vm-source-type">
          {sourceLabel} evidence
        </span>

        {canSeek ? (
          <button
            type="button"
            className="vm-source-seek"
            onClick={handleSeek}
            aria-label={`Jump to ${timestamp} in video`}
          >
            ▶ {timestamp}
          </button>
        ) : timestamp !== null ? (
          <span className="vm-source-time">
            {timestamp}
          </span>
        ) : (
          <span className="vm-source-unavailable">
            Timestamp unavailable
          </span>
        )}
      </div>

      <blockquote className="vm-source-excerpt">
        {source.excerpt.trim()
          ? source.excerpt
          : 'No evidence excerpt was provided.'}
      </blockquote>

      <div className="vm-source-footer">
        <span>Source ID</span>
        <code>{source.chunk_id}</code>
      </div>
    </article>
  )
}

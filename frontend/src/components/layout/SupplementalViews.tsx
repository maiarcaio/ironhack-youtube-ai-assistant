import { useEffect, useMemo, useState } from 'react'

import { getVideoTranscript } from '../../services/api/transcriptApi'
import type { Video } from '../../types/video'
import {
  parseTranscript,
  type TranscriptSegment,
} from '../../utils/transcriptParser'

import './SupplementalViews.css'

interface SupplementalProps {
  videos: Video[]
  selectedVideo: Video | null
  onNavigate: (page: 'library' | 'workspace' | 'qa') => void
}

interface TranscriptProps extends SupplementalProps {
  onSeek: (seconds: number) => void
  compact?: boolean
}

function ScreenHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="vm-screen-header"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header>
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  const twoDigits = (value: number) => String(value).padStart(2, '0')

  return hours > 0
    ? `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`
    : `${twoDigits(minutes)}:${twoDigits(remainingSeconds)}`
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const search = query.trim()
  if (!search) return text

  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))

  return parts.map((part, index) =>
    part.toLocaleLowerCase() === search.toLocaleLowerCase()
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part,
  )
}

export function SearchableTranscriptView(props: TranscriptProps) {
  return (
    <TranscriptContent
      key={props.selectedVideo?.id ?? 'no-video'}
      {...props}
    />
  )
}

export function TranscriptContent({ selectedVideo, onNavigate, onSeek, compact = false }: TranscriptProps) {
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(Boolean(selectedVideo))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const videoId = selectedVideo?.id

    if (!videoId) {
      return
    }

    void getVideoTranscript(videoId)
      .then((transcript) => {
        if (!cancelled) {
          setSegments(
            transcript
              ? parseTranscript(transcript.content, transcript.format)
              : [],
          )
        }
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : 'Unable to load transcript.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedVideo?.id])

  const filteredSegments = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return search
      ? segments.filter((segment) =>
          segment.text.toLocaleLowerCase().includes(search),
        )
      : segments
  }, [query, segments])

  return <div className={compact ? 'vm-transcript-compact' : 'vm-screen'}>
    {!compact && <ScreenHeader eyebrow="SEARCHABLE TRANSCRIPT" title="Every moment, searchable." description="Find and revisit exact spoken moments from a video." />}
    <div className={compact ? 'vm-transcript-layout vm-transcript-layout-compact' : 'vm-transcript-layout'}>
      <section className="vm-paper">
        <div className="vm-search-surface"><span>⌕</span><input aria-label="Search transcript" placeholder="Search transcript" value={query} onChange={(event) => setQuery(event.target.value)} disabled={loading || segments.length === 0} /></div>
        {loading && <div className="vm-unavailable-panel" role="status"><p>Loading transcript...</p></div>}
        {!loading && error && <div className="vm-unavailable-panel" role="alert"><h2>Transcript unavailable</h2><p>{error}</p></div>}
        {!loading && !error && segments.length === 0 && <div className="vm-unavailable-panel"><div>▤</div><h2>No transcript available</h2><p>Select a video with a readable transcript.</p></div>}
        {!loading && !error && segments.length > 0 && <>
          <p className="vm-transcript-count" aria-live="polite">{filteredSegments.length} of {segments.length} segments</p>
          <div className="vm-transcript-segments">
          {filteredSegments.length === 0 ? <div className="vm-unavailable-panel"><h2>No matching transcript text</h2><p>Try another search term.</p></div> : filteredSegments.map((segment) => <article className="vm-transcript-segment" key={segment.id}>
            {segment.startSeconds === null ? <span className="vm-transcript-time">No timestamp</span> : <button type="button" className="vm-transcript-time" onClick={() => onSeek(segment.startSeconds!)} aria-label={`Jump to ${formatTimestamp(segment.startSeconds)} in video`}>{formatTimestamp(segment.startSeconds)}</button>}
            <p><HighlightedText text={segment.text} query={query} /></p>
          </article>)}
          </div>
        </>}
      </section>
      {!compact && <aside className="vm-paper vm-context-card"><p>VIDEO CONTEXT</p><h2>{selectedVideo?.title ?? 'Choose a video'}</h2><span>{segments.length > 0 ? 'Use a timestamp to return to the matching video moment.' : 'Transcript content appears here when available.'}</span>{selectedVideo && <button type="button" onClick={() => onNavigate('workspace')}>Back to video</button>}</aside>}
    </div>
  </div>
}

export function SettingsView({ videos, isMockMode }: Pick<SupplementalProps, 'videos'> & { isMockMode: boolean }) {
  return <div className="vm-screen vm-settings">
    <ScreenHeader eyebrow="SETTINGS / WORKSPACE PREFERENCES" title="VideoMind settings" description="Controls are shown only where the connected services can support them." />
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">↓</div><div><h2>Transcript export</h2><p>Saved Notes can already be exported as Markdown from the Saved Notes page. Full transcript export requires a backend transcript-read contract.</p></div><button type="button" disabled>Unavailable</button></section>
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">◌</div><div><h2>{isMockMode ? 'Demonstration data' : 'Authentication'}</h2><p>{isMockMode ? 'This explicitly configured demo library is stored only for the current browser session.' : 'Your library is scoped to the signed-in account. Use the existing sign-out control in the header.'}</p></div><span className="vm-status">{videos.length} video{videos.length === 1 ? '' : 's'} in this library</span></section>
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">✦</div><div><h2>Grounded answers</h2><p>{isMockMode ? 'Chat remains unavailable for demo videos because they have not been indexed by the real backend.' : 'Chat is enabled only after the backend reports a video ready; citations use returned source timestamps.'}</p></div><span className="vm-status">{isMockMode ? 'Demo workflow' : 'Connected workflow'}</span></section>
  </div>
}

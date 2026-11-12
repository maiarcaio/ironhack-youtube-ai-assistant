import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { getVideoTranscript } from '../../services/api/transcriptApi'
import type { Video } from '../../types/video'
import { parseTranscript, type TranscriptSegment } from '../../utils/transcriptParser'

interface Props {
  videos: Video[]
  archivedVideoIds?: Set<string>
  onOpenVideo: (video: Video, seconds?: number) => void
  onBackToLibrary: () => void
}

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function mark(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.split(new RegExp(`(${escaped})`, 'gi')).map((part, index) =>
    part.toLocaleLowerCase() === query.trim().toLocaleLowerCase()
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : part,
  )
}

export function TranscriptsLibraryView({ videos, archivedVideoIds = new Set(), onOpenVideo, onBackToLibrary }: Props) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [sourceContent, setSourceContent] = useState<string | null>(null)
  const [format, setFormat] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readerQuery, setReaderQuery] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const requestRef = useRef(0)
  const exportRequestRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; requestRef.current += 1; exportRequestRef.current += 1 }
  }, [])

  const uniqueVideos = useMemo(() => Array.from(new Map(videos.map((video) => [video.id, video])).values()), [videos])
  const filteredVideos = useMemo(() => {
    const value = query.trim().toLocaleLowerCase()
    return value ? uniqueVideos.filter((video) => `${video.title} ${video.source_url}`.toLocaleLowerCase().includes(value)) : uniqueVideos
  }, [query, uniqueVideos])
  const selectedVideo = uniqueVideos.find((video) => video.id === selectedId) ?? null
  const selectedArchived = selectedVideo ? archivedVideoIds.has(selectedVideo.id) || Boolean(selectedVideo.archived_at) : false
  const filteredSegments = useMemo(() => {
    const value = readerQuery.trim().toLocaleLowerCase()
    return value ? segments.filter((segment) => segment.text.toLocaleLowerCase().includes(value)) : segments
  }, [readerQuery, segments])

  async function openTranscript(video: Video): Promise<void> {
    const requestId = ++requestRef.current
    setSelectedId(video.id)
    setLoading(true)
    setError(null)
    setReaderQuery('')
    setSegments([])
    setSourceContent(null)
    try {
      const transcript = await getVideoTranscript(video.id)
      if (!mountedRef.current || requestId !== requestRef.current) return
      if (!transcript || transcript.video_id !== video.id) {
        setFormat(null)
        setError('No transcript is available for this video yet.')
        return
      }
      setFormat(transcript.format)
      setSourceContent(transcript.content)
      setSegments(parseTranscript(transcript.content, transcript.format))
    } catch (caught: unknown) {
      if (!mountedRef.current || requestId !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : 'Unable to load this transcript.')
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setLoading(false)
    }
  }

  function download(filename: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function exportSelected(): void {
    if (!selectedVideo || !sourceContent) return
    download(`videomind-transcript-${selectedVideo.id}.md`, `# ${selectedVideo.title}\n\nSource: ${selectedVideo.source_url}\nFormat: ${format ?? 'unknown'}\n\n${sourceContent}\n`)
  }

  async function exportAll(): Promise<void> {
    if (exporting) return
    const exportId = ++exportRequestRef.current
    setExporting(true)
    setExportMessage(null)
    const sections: string[] = []
    let failures = 0
    try {
      for (const video of uniqueVideos) {
        if (!mountedRef.current || exportId !== exportRequestRef.current) return
        try {
          const transcript = await getVideoTranscript(video.id)
          if (!transcript || transcript.video_id !== video.id) { failures += 1; continue }
          sections.push(`## ${video.title}\n\nSource: ${video.source_url}\nFormat: ${transcript.format}\n\n${transcript.content}`)
        } catch { failures += 1 }
      }
      if (!mountedRef.current || exportId !== exportRequestRef.current) return
      if (sections.length > 0) download(`videomind-transcripts-${new Date().toISOString().slice(0, 10)}.md`, `# VideoMind transcripts\n\nStored transcripts exported from the authenticated browser session.\n\n${sections.join('\n\n---\n\n')}`)
      setExportMessage(failures ? `Exported ${sections.length}; ${failures} transcript${failures === 1 ? '' : 's'} could not be loaded.` : `Exported ${sections.length} transcript${sections.length === 1 ? '' : 's'}.`)
    } finally {
      if (mountedRef.current && exportId === exportRequestRef.current) setExporting(false)
    }
  }

  return <div className="vm-screen">
    <header className="vm-screen-header"><p>LIBRARY / TRANSCRIPTS</p><h1>Every transcript, one place.</h1><span>Search stored transcripts on demand, then jump back to the exact moment in context.</span></header>
    <div className="flex flex-wrap items-center gap-3 mb-5">
      <button type="button" onClick={onBackToLibrary} className="text-sm text-[#9a442d]">← Library</button>
      <label className="vm-search-surface flex-1 min-w-[220px]"><span>⌕</span><input aria-label="Search transcripts" placeholder="Search video titles" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <button type="button" onClick={() => { void exportAll() }} disabled={exporting || uniqueVideos.length === 0} className="px-4 py-2 rounded-xl bg-[#31302f] text-white text-sm disabled:opacity-50">{exporting ? 'Exporting…' : 'Export all'}</button>
    </div>
    {exportMessage && <p role="status" className="text-sm text-[#55423e] mb-4">{exportMessage}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(260px,360px)_1fr]">
      <section className="vm-paper space-y-3" aria-label="Transcript library">
        <div className="flex items-center justify-between"><h2>Stored transcripts</h2><span className="vm-status">{filteredVideos.length}</span></div>
        {filteredVideos.length === 0 && <p className="text-sm text-[#88726d]">No videos match your search.</p>}
        {filteredVideos.map((video) => {
          const archived = archivedVideoIds.has(video.id) || Boolean(video.archived_at)
          return <article key={video.id} className={`rounded-xl border p-3 ${selectedId === video.id ? 'border-[#9a442d] bg-[#fff8f4]' : 'border-[#eadfd8]'}`}>
            <h3 className="font-semibold text-[#31302f]">{video.title}</h3>
            <p className="text-xs text-[#88726d] mt-1">{archived ? 'Archived' : 'Active'} · Transcript loads when opened</p>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => { void openTranscript(video) }} className="px-3 py-1.5 rounded-lg border border-[#dbc1ba] text-xs">Read transcript</button>
              {archived ? <span className="text-xs text-[#88726d] py-1.5">Restore in Library to open player</span> : <button type="button" onClick={() => onOpenVideo(video)} className="px-3 py-1.5 rounded-lg bg-[#9a442d] text-white text-xs">Open player</button>}
            </div>
          </article>
        })}
      </section>
      <section className="vm-paper" aria-label="Transcript reader">
        {!selectedVideo && <div className="vm-unavailable-panel"><h2>Select a transcript</h2><p>Choose Read transcript to retrieve the complete stored text.</p></div>}
        {selectedVideo && <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-[#9a442d]">{format ?? 'TRANSCRIPT'}</p><h2>{selectedVideo.title}</h2></div>{sourceContent && <button type="button" onClick={exportSelected} className="text-sm text-[#9a442d]">Download</button>}</div>
          {loading && <p role="status" className="mt-5">Loading transcript…</p>}
          {!loading && error && <div role="alert" className="vm-unavailable-panel mt-5"><h2>Transcript unavailable</h2><p>{error}</p></div>}
          {!loading && !error && segments.length > 0 && <><label className="vm-search-surface mt-5 block"><span>⌕</span><input aria-label="Search open transcript" placeholder="Search transcript text" value={readerQuery} onChange={(event) => setReaderQuery(event.target.value)} /></label><p className="vm-transcript-count">{filteredSegments.length} of {segments.length} segments</p>{selectedArchived && <p className="text-sm text-[#88726d] mt-3">Restore this record in Library before opening the player or seeking to a timestamp.</p>}<div className="vm-transcript-segments">{filteredSegments.map((segment) => <article className="vm-transcript-segment" key={segment.id}>{segment.startSeconds === null || selectedArchived ? <span className="vm-transcript-time">{segment.startSeconds === null ? 'No timestamp' : `${timestamp(segment.startSeconds)} · Restore first`}</span> : <button type="button" className="vm-transcript-time" onClick={() => onOpenVideo(selectedVideo, segment.startSeconds ?? 0)}>{timestamp(segment.startSeconds)}</button>}<p>{mark(segment.text, readerQuery)}</p></article>)}</div></>}
        </>}
      </section>
    </div>
  </div>
}

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { useNotes } from '../../features/notes/notesContext'
import { formatNoteTimestamp } from '../../features/notes/notesStorage'
import type { Video } from '../../types/video'

interface WorkspaceNotesPanelProps {
  video: Video
  getPlaybackTime: () => number | null
  onOpenAllNotes: () => void
  onSeek: (seconds: number) => void
}

export function WorkspaceNotesPanel({
  video,
  getPlaybackTime,
  onOpenAllNotes,
  onSeek,
}: WorkspaceNotesPanelProps) {
  const { notes, status, error: storageError, createNote } = useNotes()
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const videoNotes = useMemo(
    () => notes.filter((note) => note.videoId === video.id),
    [notes, video.id],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const text = content.trim()
    const seconds = getPlaybackTime()

    if (!text) return

    if (seconds === null) {
      setError('Wait until the YouTube player is ready, then save the note.')
      return
    }

    const timestamp = formatNoteTimestamp(seconds)
    const created = createNote({
      videoId: video.id,
      videoTitle: video.title,
      title: `Note at ${timestamp}`,
      content: text,
      tag: 'Study Note',
      seconds,
    })

    if (!created) {
      setError(storageError ?? 'Unable to save this note in the browser.')
      return
    }

    setContent('')
    setError(null)
  }

  return (
    <div className="p-5 flex flex-col gap-5 min-h-[560px]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#9a442d]">Quick notes</p>
        <h2 className="mt-1 text-lg font-semibold text-[#1c1b1a]">Capture this moment</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#615e5c]">The playback timestamp is captured when you save. Notes stay only in this browser.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor="workspace-quick-note" className="text-xs font-semibold text-[#55423e]">Quick note</label>
        <textarea
          id="workspace-quick-note"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="What did you learn from this moment?"
          rows={3}
          disabled={status !== 'ready'}
          className="w-full p-3 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs outline-none focus:ring-1 focus:ring-[#9a442d] disabled:opacity-50"
        />
        <button type="submit" disabled={!content.trim() || status !== 'ready'} className="w-full py-2 rounded-xl bg-[#9a442d] hover:bg-[#5b1604] disabled:opacity-45 text-white text-xs font-semibold shadow-xs">
          Save quick note
        </button>
      </form>

      {(error || storageError) && <p role="alert" className="text-xs text-[#ba1a1a]">{error ?? storageError}</p>}

      <div className="space-y-2.5 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-[#1c1b1a]">Notes for this video</h3>
          <span className="text-[10px] text-[#88726d]">{videoNotes.length}</span>
        </div>
        {videoNotes.length === 0 ? (
          <div className="p-5 rounded-xl bg-[#f7f3f0] border border-dashed border-[#dbc1ba] text-center text-xs text-[#88726d]">No notes for this video yet.</div>
        ) : videoNotes.map((note) => (
          <article key={note.id} className="p-3 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <strong className="text-xs text-[#1c1b1a]">{note.title}</strong>
              <button type="button" onClick={() => onSeek(note.seconds)} className="font-mono text-[11px] text-[#9a442d] font-bold hover:underline">{formatNoteTimestamp(note.seconds)}</button>
            </div>
            <p className="text-xs text-[#55423e] leading-relaxed">{note.content}</p>
          </article>
        ))}
      </div>

      <button type="button" onClick={onOpenAllNotes} className="text-xs font-semibold text-[#9a442d] hover:text-[#5b1604] self-start">Open all saved notes →</button>
    </div>
  )
}

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { useNotes } from '../../features/notes/notesContext'
import {
  formatNoteTimestamp,
  parseNoteTimestamp,
  serializeNotesMarkdown,
} from '../../features/notes/notesStorage'
import type { VideoNote } from '../../features/notes/notesStorage'
import type { Video } from '../../types/video'

interface SavedNotesViewProps {
  videos: Video[]
  onOpenNote: (note: VideoNote) => void
}

function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function SavedNotesView({
  videos,
  onOpenNote,
}: SavedNotesViewProps) {
  const {
    status,
    storageKey,
    notes,
    error,
    recoveryRaw,
    createNote,
    updateNote,
    deleteNote,
    resetRecovery,
  } = useNotes()
  const [selectedTag, setSelectedTag] = useState('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [selectedVideoId, setSelectedVideoId] = useState(
    videos[0]?.id ?? '',
  )
  const [newTimestamp, setNewTimestamp] = useState('00:00')
  const [newTag, setNewTag] = useState('Core Concept')
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTag, setEditTag] = useState('')
  const [editTimestamp, setEditTimestamp] = useState('00:00')

  const effectiveSelectedVideoId = videos.some(
    (video) => video.id === selectedVideoId,
  ) ? selectedVideoId : videos[0]?.id ?? ''

  const tags = useMemo(
    () => ['all', ...Array.from(new Set(notes.map((note) => note.tag)))],
    [notes],
  )
  const availableVideoIds = useMemo(
    () => new Set(videos.map((video) => video.id)),
    [videos],
  )
  const filteredNotes = useMemo(() => {
    const query = searchFilter.trim().toLowerCase()

    return notes.filter((note) => {
      const matchesTag = selectedTag === 'all' || note.tag === selectedTag
      const matchesSearch = !query || [
        note.title,
        note.content,
        note.tag,
        note.videoTitle,
      ].some((value) => value.toLowerCase().includes(query))

      return matchesTag && matchesSearch
    })
  }, [notes, searchFilter, selectedTag])

  function handleCreate(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const seconds = parseNoteTimestamp(newTimestamp)
    const targetVideo = videos.find(
      (video) => video.id === effectiveSelectedVideoId,
    )

    if (!targetVideo || seconds === null) {
      setFormError('Choose a video and enter a valid timestamp such as 08:42.')
      return
    }

    const created = createNote({
      videoId: targetVideo.id,
      videoTitle: targetVideo.title,
      title: newTitle,
      content: newContent,
      tag: newTag,
      seconds,
    })

    if (!created) {
      setFormError('Complete the title and note content before saving.')
      return
    }

    setNewTitle('')
    setNewContent('')
    setNewTimestamp('00:00')
    setNewTag('Core Concept')
    setFormError(null)
    setIsAdding(false)
  }

  function beginEditing(note: VideoNote): void {
    setEditingId(note.id)
    setEditTitle(note.title)
    setEditContent(note.content)
    setEditTag(note.tag)
    setEditTimestamp(formatNoteTimestamp(note.seconds))
    setFormError(null)
  }

  function saveEdit(event: FormEvent<HTMLFormElement>, note: VideoNote): void {
    event.preventDefault()
    const seconds = parseNoteTimestamp(editTimestamp)

    if (seconds === null || !updateNote(note.id, {
      title: editTitle,
      content: editContent,
      tag: editTag,
      seconds,
    })) {
      setFormError('Complete the edit fields with a valid timestamp.')
      return
    }

    setEditingId(null)
    setFormError(null)
  }

  function exportNotes(): void {
    const date = new Date().toISOString().slice(0, 10)
    downloadText(
      serializeNotesMarkdown(notes),
      `videomind-notes-${date}.md`,
    )
  }

  function downloadRecovery(): void {
    if (recoveryRaw === null) return
    downloadText(
      recoveryRaw,
      `videomind-notes-recovery-${Date.now()}.txt`,
    )
  }

  function confirmReset(): void {
    if (
      window.confirm(
        'Reset this unreadable notes collection? Download the recovery copy first if you need the original data.',
      )
    ) {
      resetRecovery()
    }
  }

  return (
    <div className="max-w-6xl mx-auto w-full pb-16 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#ede7e1]/80">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#9a442d] uppercase tracking-wider">
            <span>Study Archives</span>
            <span className="text-[#88726d]">/</span>
            <span className="text-[#55423e]">Personal Knowledge Base</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1c1b1a] tracking-tight mt-1">
            Saved moments &amp; notes
          </h1>
          <p className="text-xs sm:text-sm text-[#615e5c] mt-0.5">
            Every idea captured with its exact video timestamp.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsAdding((current) => !current)}
            disabled={status !== 'ready' || videos.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#9a442d] text-white hover:bg-[#5b1604] disabled:opacity-45 text-xs font-semibold shadow-xs"
            type="button"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[18px]">add</span>
            <span>New note</span>
          </button>
          <button
            onClick={exportNotes}
            disabled={notes.length === 0 || status !== 'ready'}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#f1edea] disabled:opacity-45 text-[#1c1b1a] border border-[#ede7e1] text-xs font-semibold shadow-xs"
            type="button"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
            <span>Export all</span>
          </button>
        </div>
      </div>

      <aside className="flex items-start gap-3 p-4 rounded-2xl bg-[#fff5f1] border border-[#ffdbd2] text-[#55423e]">
        <span className="material-symbols-outlined text-[#9a442d]">devices</span>
        <div>
          <p className="text-sm font-semibold text-[#1c1b1a]">Stored only in this browser</p>
          <p className="text-xs mt-0.5">These notes are not synchronized to VideoMind, Supabase, or the backend.</p>
        </div>
      </aside>

      {status === 'recovery' && (
        <section role="alert" className="p-5 rounded-2xl bg-[#fff1f0] border border-[#ba1a1a]/30 text-[#6b1717]">
          <h2 className="text-sm font-bold">Local notes need recovery</h2>
          <p className="mt-2 text-xs">{error} The original browser record has not been changed.</p>
          <code className="block mt-3 text-[10px] break-all">{storageKey}</code>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={downloadRecovery} className="px-3 py-2 rounded-xl bg-white border border-[#ba1a1a]/30 text-xs font-semibold">Download recovery data</button>
            <button type="button" onClick={confirmReset} className="px-3 py-2 rounded-xl bg-[#ba1a1a] text-white text-xs font-semibold">Reset local notes</button>
          </div>
        </section>
      )}

      {error && status !== 'recovery' && (
        <p role="alert" className="p-3 rounded-xl bg-[#fff1f0] border border-[#ba1a1a]/20 text-xs text-[#6b1717]">{error}</p>
      )}

      {isAdding && status === 'ready' && (
        <form onSubmit={handleCreate} className="p-6 rounded-2xl bg-white border border-[#9a442d]/30 shadow-md flex flex-col gap-4">
          <h2 className="text-sm font-bold text-[#1c1b1a]">Add a new study note</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="note-video" className="block text-[11px] font-semibold text-[#55423e] mb-1">Video</label>
              <select id="note-video" value={effectiveSelectedVideoId} onChange={(event) => setSelectedVideoId(event.target.value)} className="w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs">
                {videos.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="note-timestamp" className="block text-[11px] font-semibold text-[#55423e] mb-1">Timestamp (mm:ss)</label>
              <input id="note-timestamp" value={newTimestamp} onChange={(event) => setNewTimestamp(event.target.value)} className="w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs font-mono" />
            </div>
            <div>
              <label htmlFor="note-tag" className="block text-[11px] font-semibold text-[#55423e] mb-1">Topic Tag</label>
              <input id="note-tag" value={newTag} onChange={(event) => setNewTag(event.target.value)} className="w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" />
            </div>
          </div>
          <div>
            <label htmlFor="note-title" className="block text-[11px] font-semibold text-[#55423e] mb-1">Note Title</label>
            <input id="note-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="w-full p-2.5 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" />
          </div>
          <div>
            <label htmlFor="note-content" className="block text-[11px] font-semibold text-[#55423e] mb-1">Notes Content</label>
            <textarea id="note-content" value={newContent} onChange={(event) => setNewContent(event.target.value)} rows={3} className="w-full p-2.5 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" />
          </div>
          {formError && <p role="alert" className="text-xs text-[#ba1a1a]">{formError}</p>}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="px-3.5 py-1.5 rounded-xl text-xs text-[#615e5c] hover:bg-[#f1edea]">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-[#9a442d] text-white text-xs font-semibold">Save note</button>
          </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-[#ede7e1] shadow-xs">
        <div className="relative flex-1 w-full sm:w-auto">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#88726d] text-[18px]">search</span>
          <input aria-label="Search saved notes" value={searchFilter} onChange={(event) => setSearchFilter(event.target.value)} placeholder="Search notes, videos, or tags..." className="w-full bg-[#f7f3f0] pl-10 pr-4 py-2 rounded-xl text-xs outline-none" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 self-start sm:self-auto">
          {tags.map((tag) => (
            <button key={tag} onClick={() => setSelectedTag(tag)} className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedTag === tag ? 'bg-[#ffdbd2] text-[#7c2e19]' : 'bg-[#f7f3f0] text-[#615e5c]'}`} type="button">
              {tag === 'all' ? 'All Tags' : tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredNotes.length === 0 ? (
          <div className="col-span-full py-16 text-center text-[#88726d] text-sm bg-white rounded-2xl border border-[#ede7e1]">
            {notes.length === 0 ? 'No saved notes yet. Capture a moment from a video workspace or create your first note.' : 'No notes found matching your criteria.'}
          </div>
        ) : filteredNotes.map((note) => {
          const available = availableVideoIds.has(note.videoId)
          const isEditing = editingId === note.id

          return (
            <article key={note.id} className="bg-white p-5 rounded-2xl border border-[#ede7e1] shadow-xs flex flex-col justify-between gap-3">
              {isEditing ? (
                <form onSubmit={(event) => saveEdit(event, note)} className="space-y-3">
                  <label className="block text-[11px] font-semibold text-[#55423e]">Title<input aria-label="Edit note title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="mt-1 w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" /></label>
                  <label className="block text-[11px] font-semibold text-[#55423e]">Content<textarea aria-label="Edit note content" value={editContent} onChange={(event) => setEditContent(event.target.value)} rows={3} className="mt-1 w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" /></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[11px] font-semibold text-[#55423e]">Tag<input aria-label="Edit note tag" value={editTag} onChange={(event) => setEditTag(event.target.value)} className="mt-1 w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs" /></label>
                    <label className="block text-[11px] font-semibold text-[#55423e]">Timestamp<input aria-label="Edit note timestamp" value={editTimestamp} onChange={(event) => setEditTimestamp(event.target.value)} className="mt-1 w-full p-2 rounded-xl bg-[#f7f3f0] border border-[#ede7e1] text-xs font-mono" /></label>
                  </div>
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-[#615e5c]">Cancel</button><button type="submit" className="px-3 py-1.5 rounded-xl bg-[#9a442d] text-white text-xs font-semibold">Save changes</button></div>
                </form>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div><span className="text-[10px] font-bold uppercase tracking-wider text-[#9a442d]">{note.tag}</span><h2 className="text-sm font-bold text-[#1c1b1a]">{note.title}</h2><p className="text-[11px] text-[#615e5c] mt-0.5">{note.videoTitle}</p></div>
                      <button onClick={() => available && onOpenNote(note)} disabled={!available} className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-[#ffdbd2] text-[#9a442d] disabled:opacity-45" title={available ? 'Jump to video moment' : 'Video unavailable'} type="button">{formatNoteTimestamp(note.seconds)}</button>
                    </div>
                    <p className="text-xs text-[#55423e] leading-relaxed pt-1">{note.content}</p>
                    {!available && <p className="text-[11px] text-[#88726d]">This video is not available in the current library.</p>}
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#ede7e1]/60 text-xs text-[#88726d]">
                    <span>Saved {new Date(note.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => beginEditing(note)} aria-label={`Edit ${note.title}`} className="text-[#55423e] hover:text-[#1c1b1a]">Edit</button>
                      <button type="button" onClick={() => onOpenNote(note)} disabled={!available} aria-label={`Open ${note.title} in video`} className="text-[#9a442d] hover:text-[#5b1604] font-semibold disabled:opacity-45">Open in video</button>
                      <button type="button" onClick={() => deleteNote(note.id)} aria-label={`Delete ${note.title}`} className="text-[#88726d] hover:text-[#ba1a1a]">Delete</button>
                    </div>
                  </div>
                </>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { ReactNode } from 'react'

import {
  getNotesStorageKey,
  loadNotes,
  persistNotes,
} from './notesStorage'
import type {
  NotesLoadResult,
  NotesOwner,
  VideoNote,
} from './notesStorage'
import { NotesContext } from './notesContext'
import type {
  CreateNoteInput,
  NotesContextValue,
  UpdateNoteInput,
} from './notesContext'

function createNoteId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeText(value: string): string {
  return value.trim()
}

export function NotesProvider({
  owner,
  children,
}: {
  owner: NotesOwner
  children: ReactNode
}) {
  const ownerKey = getNotesStorageKey(owner)
  const [loadResult, setLoadResult] = useState<NotesLoadResult>(
    () => loadNotes(owner),
  )
  const [writeError, setWriteError] = useState<string | null>(null)

  function commit(nextNotes: VideoNote[]): boolean {
    if (loadResult.status !== 'ready' || !ownerKey) return false

    try {
      persistNotes(owner, nextNotes)
      setLoadResult({ status: 'ready', key: ownerKey, notes: nextNotes })
      setWriteError(null)
      return true
    } catch (caughtError) {
      setWriteError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to save notes in this browser.',
      )
      return false
    }
  }

  function createNote(input: CreateNoteInput): VideoNote | null {
    if (loadResult.status !== 'ready' || !ownerKey) return null

    const title = normalizeText(input.title)
    const content = normalizeText(input.content)
    const tag = normalizeText(input.tag) || 'General Note'

    if (
      !normalizeText(input.videoId) ||
      !normalizeText(input.videoTitle) ||
      !title ||
      !content ||
      !Number.isFinite(input.seconds) ||
      input.seconds < 0
    ) {
      setWriteError('Complete the note fields with a valid timestamp.')
      return null
    }

    const now = new Date().toISOString()
    const note: VideoNote = {
      id: createNoteId(),
      videoId: input.videoId,
      videoTitle: input.videoTitle,
      title,
      content,
      tag,
      seconds: Math.floor(input.seconds),
      createdAt: now,
      updatedAt: now,
    }

    return commit([note, ...loadResult.notes]) ? note : null
  }

  function updateNote(id: string, input: UpdateNoteInput): boolean {
    if (loadResult.status !== 'ready') return false

    const current = loadResult.notes.find((note) => note.id === id)
    if (!current) return false

    const next: VideoNote = {
      ...current,
      title: input.title === undefined
        ? current.title
        : normalizeText(input.title),
      content: input.content === undefined
        ? current.content
        : normalizeText(input.content),
      tag: input.tag === undefined
        ? current.tag
        : normalizeText(input.tag),
      seconds: input.seconds === undefined
        ? current.seconds
        : Math.floor(input.seconds),
      updatedAt: new Date().toISOString(),
    }

    if (
      !next.title ||
      !next.content ||
      !next.tag ||
      !Number.isFinite(next.seconds) ||
      next.seconds < 0
    ) {
      setWriteError('Complete the note fields with a valid timestamp.')
      return false
    }

    return commit(loadResult.notes.map((note) =>
      note.id === id ? next : note,
    ))
  }

  function deleteNote(id: string): boolean {
    if (loadResult.status !== 'ready') return false

    return commit(loadResult.notes.filter((note) => note.id !== id))
  }

  function resetRecovery(): boolean {
    if (loadResult.status !== 'recovery' || !ownerKey) return false

    try {
      window.localStorage.removeItem(ownerKey)
      setLoadResult({ status: 'ready', key: ownerKey, notes: [] })
      setWriteError(null)
      return true
    } catch {
      setWriteError('Unable to reset notes storage in this browser.')
      return false
    }
  }

  const value: NotesContextValue = {
    owner,
    status: loadResult.status,
    storageKey: ownerKey,
    notes: loadResult.notes,
    error: loadResult.status === 'recovery'
      ? loadResult.error
      : writeError,
    recoveryRaw: loadResult.status === 'recovery'
      ? loadResult.raw
      : null,
    createNote,
    updateNote,
    deleteNote,
    resetRecovery,
  }

  return (
    <NotesContext.Provider value={value}>
      {children}
    </NotesContext.Provider>
  )
}

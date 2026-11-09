import { createContext, useContext } from 'react'

import type { NotesLoadResult, NotesOwner, VideoNote } from './notesStorage'

export interface CreateNoteInput {
  videoId: string
  videoTitle: string
  title: string
  content: string
  tag: string
  seconds: number
}

export type UpdateNoteInput = Partial<
  Pick<VideoNote, 'title' | 'content' | 'tag' | 'seconds'>
>

export interface NotesContextValue {
  owner: NotesOwner
  status: NotesLoadResult['status']
  storageKey: string | null
  notes: VideoNote[]
  error: string | null
  recoveryRaw: string | null
  createNote(input: CreateNoteInput): VideoNote | null
  updateNote(id: string, input: UpdateNoteInput): boolean
  deleteNote(id: string): boolean
  resetRecovery(): boolean
}

export const NotesContext = createContext<NotesContextValue | null>(null)

export function useNotes(): NotesContextValue {
  const context = useContext(NotesContext)

  if (!context) {
    throw new Error('useNotes must be used inside NotesProvider.')
  }

  return context
}

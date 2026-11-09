// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'

import { NotesProvider } from './NotesProvider'
import { useNotes } from './notesContext'
import type { NotesOwner } from './notesStorage'

function wrapper(owner: NotesOwner) {
  return function TestProvider({ children }: { children: ReactNode }) {
    return <NotesProvider owner={owner}>{children}</NotesProvider>
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('NotesProvider', () => {
  it('creates, updates and deletes notes in the active owner scope', () => {
    const { result } = renderHook(() => useNotes(), {
      wrapper: wrapper({ kind: 'user', userId: 'user-a' }),
    })

    act(() => {
      result.current.createNote({
        videoId: 'video-uuid',
        videoTitle: 'Backend lecture',
        title: 'Initial title',
        content: 'Initial content',
        tag: 'RAG',
        seconds: 85,
      })
    })

    expect(result.current.notes).toHaveLength(1)
    expect(result.current.notes[0]).toMatchObject({
      videoId: 'video-uuid',
      seconds: 85,
    })

    const id = result.current.notes[0].id

    act(() => {
      result.current.updateNote(id, {
        title: 'Updated title',
        seconds: 120,
      })
    })
    expect(result.current.notes[0]).toMatchObject({
      title: 'Updated title',
      seconds: 120,
    })

    act(() => {
      result.current.deleteNote(id)
    })
    expect(result.current.notes).toEqual([])
  })

  it('does not expose authenticated notes without a resolved owner', () => {
    localStorage.setItem(
      'videomind.notes.v1.user.user-a',
      JSON.stringify({ version: 1, notes: [] }),
    )

    const { result } = renderHook(() => useNotes(), {
      wrapper: wrapper(null),
    })

    expect(result.current.status).toBe('disabled')
    expect(result.current.notes).toEqual([])
    expect(result.current.createNote({
      videoId: 'video-uuid',
      videoTitle: 'Backend lecture',
      title: 'Hidden note',
      content: 'Must not save',
      tag: 'Private',
      seconds: 0,
    })).toBeNull()
  })

  it('keeps unreadable data unchanged until an explicit reset', () => {
    const key = 'videomind.notes.v1.user.user-a'
    localStorage.setItem(key, '{broken-json')

    const { result } = renderHook(() => useNotes(), {
      wrapper: wrapper({ kind: 'user', userId: 'user-a' }),
    })

    expect(result.current.status).toBe('recovery')
    expect(result.current.recoveryRaw).toBe('{broken-json')
    expect(result.current.createNote({
      videoId: 'video-uuid',
      videoTitle: 'Backend lecture',
      title: 'Blocked note',
      content: 'Must not overwrite recovery data',
      tag: 'Recovery',
      seconds: 0,
    })).toBeNull()
    expect(localStorage.getItem(key)).toBe('{broken-json')

    act(() => {
      result.current.resetRecovery()
    })

    expect(result.current.status).toBe('ready')
    expect(localStorage.getItem(key)).toBeNull()
  })
})

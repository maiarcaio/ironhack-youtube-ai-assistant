// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  formatNoteTimestamp,
  getNotesStorageKey,
  loadNotes,
  parseNoteTimestamp,
  persistNotes,
  serializeNotesMarkdown,
} from './notesStorage'
import type { VideoNote } from './notesStorage'

const note: VideoNote = {
  id: 'note-1',
  videoId: '11111111-1111-4111-8111-111111111111',
  videoTitle: 'Backend lecture',
  title: 'Retrieval insight',
  content: 'Similarity search finds relevant transcript chunks.',
  tag: 'RAG',
  seconds: 85,
  createdAt: '2026-11-07T10:00:00.000Z',
  updatedAt: '2026-11-07T10:00:00.000Z',
}

beforeEach(() => {
  localStorage.clear()
})

describe('notes storage ownership', () => {
  it('uses separate keys for mock mode and resolved authenticated users', () => {
    expect(getNotesStorageKey({ kind: 'mock' })).toBe(
      'videomind.notes.v1.mock',
    )
    expect(
      getNotesStorageKey({ kind: 'user', userId: 'user-123' }),
    ).toBe('videomind.notes.v1.user.user-123')
    expect(getNotesStorageKey(null)).toBeNull()
  })

  it('loads a valid versioned collection without changing it', () => {
    const owner = { kind: 'user', userId: 'user-123' } as const
    const raw = JSON.stringify({ version: 1, notes: [note] })
    localStorage.setItem(getNotesStorageKey(owner)!, raw)

    expect(loadNotes(owner, localStorage)).toEqual({
      status: 'ready',
      key: 'videomind.notes.v1.user.user-123',
      notes: [note],
    })
    expect(localStorage.getItem(getNotesStorageKey(owner)!)).toBe(raw)
  })

  it('preserves corrupted data and exposes it for recovery', () => {
    const owner = { kind: 'user', userId: 'user-123' } as const
    const key = getNotesStorageKey(owner)!
    const raw = '{not-json'
    localStorage.setItem(key, raw)

    const result = loadNotes(owner, localStorage)

    expect(result.status).toBe('recovery')
    expect(result).toMatchObject({ key, raw, notes: [] })
    expect(localStorage.getItem(key)).toBe(raw)
  })

  it('does not expose storage when there is no resolved owner', () => {
    localStorage.setItem('videomind.notes.v1.mock', 'private')

    expect(loadNotes(null, localStorage)).toEqual({
      status: 'disabled',
      key: null,
      notes: [],
    })
  })

  it('leaves the previous value intact when a write fails', () => {
    const owner = { kind: 'mock' } as const
    const previous = JSON.stringify({ version: 1, notes: [] })
    const storage = {
      getItem: vi.fn(() => previous),
      setItem: vi.fn(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError')
      }),
      removeItem: vi.fn(),
    }

    expect(() => persistNotes(owner, [note], storage)).toThrow(
      /unable to save notes/i,
    )
    expect(storage.getItem()).toBe(previous)
  })
})

describe('note timestamps and export', () => {
  it('formats and parses minute timestamps', () => {
    expect(formatNoteTimestamp(85)).toBe('01:25')
    expect(parseNoteTimestamp('01:25')).toBe(85)
    expect(parseNoteTimestamp('12:60')).toBeNull()
    expect(parseNoteTimestamp('not-a-time')).toBeNull()
  })

  it('serializes a browser-local Markdown export', () => {
    const markdown = serializeNotesMarkdown(
      [note],
      new Date('2026-11-07T12:00:00.000Z'),
    )

    expect(markdown).toContain('# VideoMind Saved Notes')
    expect(markdown).toContain('stored only in this browser')
    expect(markdown).toContain('### [01:25] Retrieval insight')
    expect(markdown).toContain('**Source:** Backend lecture')
    expect(markdown).toContain('*Tag: RAG*')
    expect(markdown).toContain(
      'Similarity search finds relevant transcript chunks.',
    )
  })
})

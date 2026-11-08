// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotesProvider } from '../../features/notes/NotesProvider'
import type { Video } from '../../types/video'
import { SavedNotesView } from './SavedNotesView'

const video: Video = {
  id: '11111111-1111-4111-8111-111111111111',
  source_url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  title: 'Backend lecture',
  thumbnail_url: null,
  status: 'ready',
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function renderView(onOpenNote = vi.fn()) {
  render(
    <NotesProvider owner={{ kind: 'user', userId: 'user-a' }}>
      <SavedNotesView videos={[video]} onOpenNote={onOpenNote} />
    </NotesProvider>,
  )
  return onOpenNote
}

async function createNote() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'New note' }))
  await user.clear(screen.getByLabelText('Timestamp (mm:ss)'))
  await user.type(screen.getByLabelText('Timestamp (mm:ss)'), '01:25')
  await user.clear(screen.getByLabelText('Topic Tag'))
  await user.type(screen.getByLabelText('Topic Tag'), 'RAG')
  await user.type(screen.getByLabelText('Note Title'), 'Retrieval insight')
  await user.type(
    screen.getByLabelText('Notes Content'),
    'Similarity search finds transcript evidence.',
  )
  await user.click(screen.getByRole('button', { name: 'Save note' }))
  return user
}

describe('SavedNotesView', () => {
  it('creates a UUID-associated note with the saved-notes form', async () => {
    renderView()
    await createNote()

    expect(screen.getByText('Retrieval insight')).toBeTruthy()
    expect(screen.getByText('Backend lecture')).toBeTruthy()
    expect(screen.getByText('01:25')).toBeTruthy()
    expect(screen.getByText(/stored only in this browser/i)).toBeTruthy()

    const stored = localStorage.getItem(
      'videomind.notes.v1.user.user-a',
    )
    expect(stored).toContain(video.id)
  })

  it('edits, filters, opens and deletes an existing note', async () => {
    const onOpenNote = renderView()
    const user = await createNote()

    await user.click(screen.getByRole('button', { name: 'Edit Retrieval insight' }))
    await user.clear(screen.getByLabelText('Edit note title'))
    await user.type(screen.getByLabelText('Edit note title'), 'Updated insight')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(screen.getByText('Updated insight')).toBeTruthy()

    await user.type(screen.getByLabelText('Search saved notes'), 'missing')
    expect(screen.getByText(/No notes found/i)).toBeTruthy()
    await user.clear(screen.getByLabelText('Search saved notes'))

    await user.click(screen.getByRole('button', { name: 'Open Updated insight in video' }))
    expect(onOpenNote).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: video.id, seconds: 85 }),
    )

    await user.click(screen.getByRole('button', { name: 'Delete Updated insight' }))
    expect(screen.queryByText('Updated insight')).toBeNull()
  })

  it('keeps corrupted storage unchanged until recovery is downloaded and reset', async () => {
    const key = 'videomind.notes.v1.user.user-a'
    localStorage.setItem(key, '{broken-json')
    const createObjectURL = vi.fn(() => 'blob:recovery')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()

    renderView()

    expect(screen.getByRole('alert').textContent).toMatch(/need recovery/i)
    expect(localStorage.getItem(key)).toBe('{broken-json')
    expect(screen.getByRole('button', { name: 'New note' }).hasAttribute('disabled')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Download recovery data' }))
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(localStorage.getItem(key)).toBe('{broken-json')

    await user.click(screen.getByRole('button', { name: 'Reset local notes' }))
    expect(localStorage.getItem(key)).toBeNull()
    expect(screen.queryByText(/need recovery/i)).toBeNull()
  })
})

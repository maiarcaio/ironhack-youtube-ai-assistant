// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotesProvider } from '../../features/notes/NotesProvider'
import type { Video } from '../../types/video'
import { WorkspaceNotesPanel } from './WorkspaceNotesPanel'

const video: Video = {
  id: '11111111-1111-4111-8111-111111111111',
  source_url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  title: 'Backend lecture',
  thumbnail_url: null,
  status: 'ready',
}

beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('WorkspaceNotesPanel', () => {
  it('captures playback time when the quick note is saved', async () => {
    const getPlaybackTime = vi.fn(() => 85.9)
    const user = userEvent.setup()

    render(
      <NotesProvider owner={{ kind: 'user', userId: 'user-a' }}>
        <WorkspaceNotesPanel
          video={video}
          getPlaybackTime={getPlaybackTime}
          onOpenAllNotes={vi.fn()}
          onSeek={vi.fn()}
        />
      </NotesProvider>,
    )

    await user.type(
      screen.getByLabelText('Quick note'),
      'Similarity search explanation',
    )
    await user.click(screen.getByRole('button', { name: 'Save quick note' }))

    expect(getPlaybackTime).toHaveBeenCalledOnce()
    expect(screen.getByText('Note at 01:25')).toBeTruthy()
    expect(screen.getByText('Similarity search explanation')).toBeTruthy()
    expect(localStorage.getItem('videomind.notes.v1.user.user-a')).toContain(
      video.id,
    )
  })

  it('does not save before the player can report a timestamp', async () => {
    const user = userEvent.setup()

    render(
      <NotesProvider owner={{ kind: 'mock' }}>
        <WorkspaceNotesPanel
          video={video}
          getPlaybackTime={() => null}
          onOpenAllNotes={vi.fn()}
          onSeek={vi.fn()}
        />
      </NotesProvider>,
    )

    await user.type(screen.getByLabelText('Quick note'), 'Too early')
    await user.click(screen.getByRole('button', { name: 'Save quick note' }))

    expect(screen.getByRole('alert').textContent).toMatch(/player is ready/i)
    expect(localStorage.getItem('videomind.notes.v1.mock')).toBeNull()
  })
})

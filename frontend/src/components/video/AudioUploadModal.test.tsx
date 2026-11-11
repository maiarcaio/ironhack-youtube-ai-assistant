// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AudioUploadModal } from './AudioUploadModal'

describe('AudioUploadModal', () => {
  it('clears a successful selection before the next session', async () => {
    const onUpload = vi.fn().mockResolvedValue(true)
    const view = render(<AudioUploadModal isOpen isSubmitting={false} isMockMode={false} error={null} onClose={vi.fn()} onUpload={onUpload} />)
    const file = new File(['audio'], 'lecture.m4a', { type: 'audio/mp4' })
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(screen.getByRole('button', { name: 'lecture.m4a' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Upload audio' }))
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file))
    view.rerender(<AudioUploadModal isOpen={false} isSubmitting={false} isMockMode={false} error={null} onClose={vi.fn()} onUpload={onUpload} />)
    view.rerender(<AudioUploadModal isOpen isSubmitting={false} isMockMode={false} error={null} onClose={vi.fn()} onUpload={onUpload} />)
    expect(screen.getByRole('button', { name: 'Choose audio file' })).toBeTruthy()
  })
})

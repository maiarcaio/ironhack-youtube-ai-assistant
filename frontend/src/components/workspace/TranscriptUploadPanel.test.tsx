// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { uploadTranscript } from '../../services/api/videomindBackend'
import { TranscriptUploadPanel } from './TranscriptUploadPanel'

vi.mock('../../services/api/videomindBackend', () => ({
  uploadTranscript: vi.fn(),
}))

const uploadTranscriptMock = vi.mocked(uploadTranscript)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPanel(serverError = 'Automatic caption acquisition failed.') {
  return render(
    <TranscriptUploadPanel
      videoId="failed-video-uuid"
      serverError={serverError}
      getAccessToken={async () => 'offline-token'}
      onUploaded={vi.fn()}
    />,
  )
}

describe('TranscriptUploadPanel', () => {
  it('presents the backend failure reason and selected recovery file', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getByText('Automatic caption acquisition failed.')).toBeTruthy()
    expect(screen.getByText(/last-resort alternative/i)).toBeTruthy()

    await user.upload(
      screen.getByLabelText('Transcript file'),
      new File(['Transcript'], 'recovery.srt', { type: 'text/plain' }),
    )

    expect(screen.getByText(/Selected: recovery[.]srt/)).toBeTruthy()
  })

  it.each([
    [new File(['not a transcript'], 'notes.pdf'), /TXT, SRT, or VTT/i],
    [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.vtt'), /maximum file size is 2 MB/i],
  ])('rejects an invalid file before upload', async (file, expectedError) => {
    const user = userEvent.setup({ applyAccept: false })
    renderPanel()

    await user.upload(screen.getByLabelText('Transcript file'), file)

    expect(screen.getByText(expectedError)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload transcript' }).hasAttribute('disabled')).toBe(true)
    expect(uploadTranscriptMock).not.toHaveBeenCalled()
  })

  it('disables duplicate submission and announces backend upload errors', async () => {
    const user = userEvent.setup()
    let rejectUpload: (error: Error) => void = () => undefined
    uploadTranscriptMock.mockImplementation(() => new Promise((_, reject) => {
      rejectUpload = reject
    }))
    renderPanel()

    await user.upload(
      screen.getByLabelText('Transcript file'),
      new File(['Transcript'], 'recovery.txt', { type: 'text/plain' }),
    )
    const submit = screen.getByRole('button', { name: 'Upload transcript' })
    await user.click(submit)

    expect(screen.getByRole('button', { name: 'Uploading and indexing...' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('status').textContent).toMatch(/processing transcript/i)

    rejectUpload(new Error('Transcript indexing is temporarily unavailable.'))

    await waitFor(() => {
      expect(screen.getByText('Transcript indexing is temporarily unavailable.')).toBeTruthy()
    })
    expect(uploadTranscriptMock).toHaveBeenCalledTimes(1)
  })
})

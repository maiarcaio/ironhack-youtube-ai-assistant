
import { useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

import {
  uploadTranscript,
} from '../../services/api/videomindBackend'
import type { AccessTokenProvider } from '../../services/api/videomindBackend'

import './TranscriptUploadPanel.css'

const MAX_FILE_SIZE = 2 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.txt', '.srt', '.vtt']

function validateSelectedFile(file: File): string | null {
  const filename = file.name.toLowerCase()

  if (!ALLOWED_EXTENSIONS.some((extension) => filename.endsWith(extension))) {
    return 'Choose a TXT, SRT, or VTT transcript.'
  }

  if (file.size === 0) return 'The transcript file is empty.'
  if (file.size > MAX_FILE_SIZE) return 'The maximum file size is 2 MB.'

  return null
}

// Information returned when the backend finishes indexing.
interface TranscriptUploadSuccess {
  videoId: string
  chunksCount: number
}

// Props provided by the parent video workspace.
interface TranscriptUploadPanelProps {
  videoId: string
  serverError?: string | null
  getAccessToken: AccessTokenProvider
  onUploaded: (result: TranscriptUploadSuccess) => void
}

export function TranscriptUploadPanel({
  videoId,
  serverError,
  getAccessToken,
  onUploaded,
}: TranscriptUploadPanelProps) {
  // Store the user's selected transcript file.
  const [file, setFile] = useState<File | null>(null)

  // Track the upload operation and any errors.
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const uploadingRef = useRef(false)

  // Prevent duplicate uploads before React updates the button.
  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!file || uploadingRef.current) return

    uploadingRef.current = true
    setIsUploading(true)
    setError(null)

    try {
      // Send the file and current video ID to FastAPI.
      // Successful completion means Pinecone accepted the chunks.
      const result = await uploadTranscript(
        videoId,
        file,
        undefined,
        getAccessToken,
      )

      // Notify the parent only after real backend success.
      onUploaded({
        videoId: result.video_id,
        chunksCount: result.chunks_count,
      })

      // Clear the selected file after a successful upload.
      setFile(null)
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to upload the transcript.',
      )
    } finally {
      uploadingRef.current = false
      setIsUploading(false)
    }
  }

  return (
    <section
      className="vm-transcript-upload"
      aria-label="Transcript upload"
    >
      <div className="vm-transcript-upload__heading">
        <span className="vm-transcript-upload__icon" aria-hidden="true">!</span>
        <div>
          <span className="section-kicker">RECOVERY AVAILABLE</span>
          <h2>Upload transcript</h2>
        </div>
      </div>

      <p className="vm-transcript-upload__summary">
        Automatic processing failed. Manual upload is a last-resort alternative
        after caption and transcription processing could not complete.
      </p>

      <p className="vm-transcript-upload__server-error" role="alert">
        {serverError ?? 'Video processing failed. The backend did not provide a specific reason.'}
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="vm-transcript-file">
          Transcript file
        </label>

        <input
          key={videoId}
          id="vm-transcript-file"
          type="file"
          accept=".txt,.srt,.vtt"
          disabled={isUploading}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0] ?? null
            const validationError = selectedFile
              ? validateSelectedFile(selectedFile)
              : null

            setFile(validationError ? null : selectedFile)
            setError(validationError)
          }}
        />

        <p className="vm-transcript-upload__filename" aria-live="polite">
          {file ? `Selected: ${file.name}` : 'No transcript selected'}
        </p>

        <p className="vm-workspace-information">
          Supported formats: TXT, SRT and VTT.
          Maximum file size: 2 MB.
        </p>

        <button
          type="submit"
          className="primary-button"
          disabled={!file || isUploading}
        >
          {isUploading
            ? 'Uploading and indexing...'
            : 'Upload transcript'}
        </button>
      </form>

      {isUploading && (
        <p role="status" className="vm-transcript-upload__progress">
          Processing transcript and generating embeddings...
        </p>
      )}

      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  )
}

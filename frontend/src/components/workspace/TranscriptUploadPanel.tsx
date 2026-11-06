
import { useState } from 'react'
import type { SubmitEvent } from 'react'

import {
  uploadTranscript,
} from '../../services/api/videomindBackend'
import type { AccessTokenProvider } from '../../services/api/videomindBackend'

// Information returned when the backend finishes indexing.
interface TranscriptUploadSuccess {
  videoId: string
  chunksCount: number
}

// Props provided by the parent video workspace.
interface TranscriptUploadPanelProps {
  videoId: string
  getAccessToken: AccessTokenProvider
  onUploaded: (result: TranscriptUploadSuccess) => void
}

export function TranscriptUploadPanel({
  videoId,
  getAccessToken,
  onUploaded,
}: TranscriptUploadPanelProps) {
  // Store the user's selected transcript file.
  const [file, setFile] = useState<File | null>(null)

  // Track the upload operation and any errors.
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prevent duplicate uploads before React updates the button.
  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!file || isUploading) return

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
      setIsUploading(false)
    }
  }

  return (
    <section
      className="vm-transcript-upload"
      aria-label="Transcript upload"
    >
      <span className="section-kicker">
        VIDEO KNOWLEDGE
      </span>

      <h2>Upload transcript</h2>

      <p>
        Automatic processing did not complete. Upload a transcript
        to recover this video and make it searchable.
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
            setFile(event.target.files?.[0] ?? null)
            setError(null)
          }}
        />

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
        <p role="status">
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

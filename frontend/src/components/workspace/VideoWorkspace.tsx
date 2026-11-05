
import type { ReactNode } from 'react'
import type { Video } from '../../types/video'

import './VideoWorkspace.css'

// This component owns presentation, not API requests.
// App.tsx remains responsible for video selection and polling.
interface VideoWorkspaceProps {
  video: Video | null
  pollingError?: string
  isMockMode: boolean
  onBack: () => void
  children: ReactNode
}

export function VideoWorkspace({
  video,
  pollingError,
  isMockMode,
  onBack,
  children,
}: VideoWorkspaceProps) {
  return (
    <section
      className="workspace-page vm-video-workspace"
      aria-label="Video workspace"
    >
      <button
        type="button"
        className="back-button"
        onClick={onBack}
      >
        ← Back to library
      </button>

      <span className="section-kicker">
        VIDEO WORKSPACE
      </span>

      {!video ? (
        <div className="empty-library">
          <h1>No video selected</h1>
          <p>
            Choose a video from your library to open its
            workspace.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={onBack}
          >
            Browse library
          </button>
        </div>
      ) : (
        <>
          <header className="vm-video-workspace-heading">
            <h1>{video.title}</h1>
            <p>
              Watch, explore, and ask questions about your
              selected video.
            </p>
          </header>

          <div className="vm-video-workspace-grid">
            <section
              className="vm-video-workspace-media"
              aria-label="Video details"
            >
              <div className="workspace-panel">
                {/*
                  This is still a placeholder, not a real player.
                  The YouTube IFrame API is a separate milestone.
                */}
                <div className="workspace-preview">
                  <span aria-hidden="true">▶</span>
                  <p>Video player coming soon</p>
                </div>

                <div className="workspace-details">
                  <div className="workspace-status">
                    <strong>Processing status</strong>
                    <span
                      className={`status-pill status-${video.status}`}
                      role="status"
                    >
                      {video.status}
                    </span>
                  </div>

                  <p>
                    Video ID: <code>{video.id}</code>
                  </p>

                  <a
                    href={video.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-link"
                  >
                    Open original YouTube video ↗
                  </a>

                  {video.status === 'ready' && isMockMode && (
                    <p className="vm-workspace-information">
                      This video is ready in demonstration mode.
                      It has not been verified as indexed by
                      the real RAG backend.
                    </p>
                  )}

                  {video.status === 'ready' && !isMockMode && (
                    <p className="vm-workspace-information">
                      The backend reports processing complete.
                      You can try asking questions about
                      this video.
                    </p>
                  )}

                  {(video.status === 'queued' ||
                    video.status === 'processing') && (
                    <p className="vm-workspace-information">
                      Video processing is underway.
                      Chat will become available when
                      processing completes in backend mode.
                    </p>
                  )}

                  {video.status === 'failed' && (
                    <p role="alert" className="error-message">
                      {video.error ??
                        'Video processing failed.'}
                    </p>
                  )}

                  {pollingError && (
                    <p role="alert" className="error-message">
                      Status check unavailable: {pollingError}
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section
              className="vm-video-workspace-assistant"
              aria-label="AI assistant"
            >
              {/*
                ChatPanel is supplied by App.tsx.
                We don't duplicate chat state in this component.
              */}
              {children}
            </section>
          </div>
        </>
      )}
    </section>
  )
}

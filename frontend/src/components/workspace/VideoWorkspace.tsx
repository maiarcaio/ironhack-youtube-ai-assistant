
import { forwardRef } from 'react'
import type { ReactNode } from 'react'

import { YouTubePlayer } from '../player/YouTubePlayer'
import type { YouTubePlayerHandle } from '../player/YouTubePlayer'
import type { Video } from '../../types/video'

import './VideoWorkspace.css'

// The workspace owns layout and video presentation.
// App.tsx remains responsible for selection, API calls,
// conversation wiring, and timestamp navigation.
interface VideoWorkspaceProps {
  video: Video | null
  pollingError?: string
  isMockMode: boolean
  onBack: () => void
  children: ReactNode
}

/*
 * forwardRef allows App.tsx to hold a reference to the
 * YouTube player without exposing the player's internals.
 *
 * The workspace passes that reference directly to YouTubePlayer.
 * No ref is read during React rendering.
 */
export const VideoWorkspace = forwardRef<
  YouTubePlayerHandle,
  VideoWorkspaceProps
>(function VideoWorkspace(
  {
    video,
    pollingError,
    isMockMode,
    onBack,
    children,
  },
  ref,
) {
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
                  The source URL identifies the actual
                  YouTube video.

                  The internal video.id is used only as a
                  React key to reset the player when switching.

                  The ref is forwarded to YouTubePlayer,
                  whose public handle exposes seekTo().
                */}
                <YouTubePlayer
                  key={video.id}
                  ref={ref}
                  sourceUrl={video.source_url}
                  title={video.title}
                />

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

                  {/*
                    Preserve the original URL because
                    embedding may be restricted by YouTube.
                  */}
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

                The workspace doesn't need to know about
                chat sessions or backend response formats.
              */}
              {children}
            </section>
          </div>
        </>
      )}
    </section>
  )
})

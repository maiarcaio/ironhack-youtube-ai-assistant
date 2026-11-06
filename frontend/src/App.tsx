
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import type { Session } from '@supabase/supabase-js'

import { AppShell } from './components/layout/AppShell'
import { VideoWorkspace } from './components/workspace/VideoWorkspace'
import { TranscriptUploadPanel } from './components/workspace/TranscriptUploadPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { VideoCard } from './components/video/VideoCard'

import type { YouTubePlayerHandle } from './components/player/YouTubePlayer'
import { createHttpChatApi } from './services/api/httpChatApi'
import { streamVideoQuestion } from './services/api/videomindBackend'
import { videoApi } from './services/api'
import { createAuthenticatedVideoApi } from './services/api/authenticatedVideoApi'
import { getAccessToken, supabase } from './services/api/supabaseClient'
import type { Video, VideoStatus } from './types/video'
import { extractYouTubeVideoId } from './utils/youtube'

import './App.css'

// Keep mock mode available for demonstrations and existing tests.
const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'

// Both the regular chat client and streaming client use this backend URL.
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Application screens.
type Page = 'library' | 'workspace'

// Library filtering options.
type LibraryFilter = 'all' | VideoStatus

interface AppProps {
  // AuthGate remounts this component when the user changes, clearing user state.
  session?: Session | null
}

function App({ session = null }: AppProps) {
  const activeVideoApi = useMemo(
    () => useMockApi
      ? videoApi
      : createAuthenticatedVideoApi(apiBaseUrl, getAccessToken),
    [],
  )
  const chatApi = useMemo(
    () => createHttpChatApi(
      apiBaseUrl,
      useMockApi ? undefined : getAccessToken,
    ),
    [],
  )
  // Store videos added during the current browser session.
  const [videos, setVideos] = useState<Video[]>([])

  // Track the selected video and active application page.
  const [selectedVideoId, setSelectedVideoId] =
    useState<string | null>(null)

  const [activePage, setActivePage] =
    useState<Page>('library')

  // Video submission and library search.
  const [videoUrl, setVideoUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] =
    useState<LibraryFilter>('all')

  // Request and error states.
  const [isSubmitting, setIsSubmitting] =
    useState(false)

  const [submissionError, setSubmissionError] =
    useState<string | null>(null)

  const [pollingErrors, setPollingErrors] =
    useState<Record<string, string>>({})
  const [libraryError, setLibraryError] = useState<string | null>(null)

  /**
   * Keep the YouTube player's public reference.
   *
   * ChatPanel requests seeking through a callback rather
   * than interacting directly with the player.
   */
  const playerRef = useRef<YouTubePlayerHandle>(null)

  // Find the selected video in the current library.
  const selectedVideo =
    videos.find(
      (video) => video.id === selectedVideoId,
    ) ?? null

  /**
   * Seek to a source citation timestamp.
   *
   * Ignore requests for invalid timestamps or when
   * the video workspace isn't active.
   */
  function handleSeekToSource(seconds: number): void {
    if (
      activePage !== 'workspace' ||
      !selectedVideo
    ) {
      return
    }

    if (
      !Number.isFinite(seconds) ||
      seconds < 0
    ) {
      return
    }

    playerRef.current?.seekTo(seconds)
  }

  // Calculate current library statistics.
  const readyCount = videos.filter(
    (video) => video.status === 'ready',
  ).length

  const processingCount = videos.filter(
    (video) =>
      video.status === 'queued' ||
      video.status === 'processing',
  ).length

  // Filter the library by search text and status.
  const filteredVideos = videos.filter(
    (video) => {
      const searchText =
        searchQuery.trim().toLowerCase()

      const matchesSearch =
        video.title
          .toLowerCase()
          .includes(searchText) ||
        video.source_url
          .toLowerCase()
          .includes(searchText)

      const matchesStatus =
        filter === 'all' ||
        video.status === filter

      return matchesSearch && matchesStatus
    },
  )

  // Build a stable list of videos awaiting status updates.
  const pendingVideoIds = videos
    .filter(
      (video) =>
        video.status === 'queued' ||
        video.status === 'processing',
    )
    .map((video) => video.id)
    .join('|')

  function toVideo(item: {
    video_id: string
    title: string
    status: VideoStatus
    source_url: string | null
  }): Video | null {
    // A playable library entry needs the backend's original source URL.
    // Do not fabricate one when persistence returns incomplete data.
    if (!item.source_url) return null

    return {
      id: item.video_id,
      title: item.title,
      source_url: item.source_url,
      status: item.status,
      thumbnail_url: null,
      error: null,
    }
  }

  const loadLibrary = useCallback(async (): Promise<void> => {
    try {
      const response = await activeVideoApi.listVideos()
      setVideos(response.videos.map(toVideo).filter((video): video is Video => video !== null))
      setLibraryError(null)
    } catch (caughtError) {
      setLibraryError(caughtError instanceof Error ? caughtError.message : 'Unable to load your video library.')
    }
  }, [activeVideoApi])

  // Persistent videos belong to the authenticated user, not this browser session.
  useEffect(() => {
    if (!useMockApi && session) void loadLibrary()
  }, [loadLibrary, session])

  /**
   * Add a YouTube video.
   *
   * MOCK MODE:
   * Use the existing mock video ingestion API.
   *
   * REAL BACKEND MODE: the server creates and owns the video UUID.
   */
  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (isSubmitting) return

    const sourceUrl = videoUrl.trim()

    setIsSubmitting(true)
    setSubmissionError(null)

    try {
      if (!extractYouTubeVideoId(sourceUrl)) {
        throw new Error('Enter a valid YouTube video URL.')
      }

      const response = await activeVideoApi.ingestVideo({
        url: sourceUrl,
      })

      if (!useMockApi) {
        // Reload server-owned metadata rather than fabricating a title or date.
        await loadLibrary()
        setSelectedVideoId(response.video_id)
        setVideoUrl('')
        setFilter('all')
        setSearchQuery('')
        return
      }

      const newVideo: Video = {
        id: response.video_id,
        source_url: sourceUrl,
        title: 'Processing video',
        thumbnail_url: null,
        status: response.status,
        created_at: new Date().toISOString(),
        error: null,
      }

      setVideos((current) => [
        newVideo,
        ...current,
      ])

      setSelectedVideoId(newVideo.id)
      setVideoUrl('')

      setFilter('all')
      setSearchQuery('')
      setActivePage('library')
    } catch (caughtError) {
      setSubmissionError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Unable to add this video.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Open a video from the library.
  function handleSelectVideo(
    videoId: string,
  ): void {
    setSelectedVideoId(videoId)
    setActivePage('workspace')
  }

  /**
   * Handle successful transcript ingestion.
   *
   * Re-read server status after a successful fallback upload.
   */
  function handleTranscriptUploaded(
    result: {
      videoId: string
      chunksCount: number
    },
  ): void {
    if (result.chunksCount < 1) return
    void activeVideoApi.getVideoStatus(result.videoId).then((response) => {
      setVideos((current) => current.map((video) => video.id === result.videoId ? { ...video, status: response.status, error: response.error } : video))
    }).catch((caughtError) => {
      setPollingErrors((current) => ({ ...current, [result.videoId]: caughtError instanceof Error ? caughtError.message : 'Unable to refresh video status.' }))
    })
  }

  /**
   * Poll only unfinished videos. Completed and failed statuses leave this list.
   */
  useEffect(() => {
    if (
      !pendingVideoIds
    ) {
      return
    }

    const videoIds =
      pendingVideoIds.split('|')

    let cancelled = false

    let timeoutId:
      | ReturnType<typeof setTimeout>
      | undefined

    async function checkPendingVideos() {
      await Promise.all(
        videoIds.map(async (videoId) => {
          try {
            const response =
              await activeVideoApi.getVideoStatus(
                videoId,
              )

            if (cancelled) return

            // Update only the matching video.
            setVideos((current) =>
              current.map((video) =>
                video.id === videoId
                  ? {
                      ...video,
                      status: response.status,
                      title:
                        response.title ??
                        video.title,
                      thumbnail_url:
                        response.thumbnail_url ??
                        video.thumbnail_url,
                      error:
                        response.status === 'failed'
                          ? response.error ??
                            'Video processing failed.'
                          : null,
                    }
                  : video,
              ),
            )

            // Clear previous polling errors after recovery.
            setPollingErrors((current) => {
              if (!(videoId in current)) {
                return current
              }

              const updated = { ...current }
              delete updated[videoId]

              return updated
            })
          } catch (caughtError) {
            if (cancelled) return

            // A failed status request doesn't prove
            // that ingestion itself has failed.
            setPollingErrors((current) => ({
              ...current,
              [videoId]:
                caughtError instanceof Error
                  ? caughtError.message
                  : 'Unable to check video status.',
            }))
          }
        }),
      )

      if (!cancelled) {
        timeoutId = setTimeout(() => {
          void checkPendingVideos()
        }, 1000)
      }
    }

    void checkPendingVideos()

    // Cancel future polling when dependencies change.
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [activeVideoApi, pendingVideoIds])

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
      onSignOut={
        !useMockApi && session
          ? () => { void supabase?.auth.signOut() }
          : undefined
      }
    >
      {activePage === 'library' && (
        <div className="library-page">
          <section className="library-hero">
            <div className="hero-content">
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR AI LEARNING STUDIO
              </span>

              <h1>
                Don&apos;t just watch.
                <span>
                  {' '}
                  Understand everything.
                </span>
              </h1>

              <p>
                Turn YouTube videos into searchable
                knowledge. Organize your library and
                explore what you learn.
              </p>

              <a
                className="hero-action"
                href="#add-video"
              >
                <span aria-hidden="true">
                  ＋
                </span>
                Add a YouTube video
              </a>
            </div>

            <div className="hero-insight">
              <span className="insight-label">
                YOUR WORKSPACE
              </span>

              <strong>
                {videos.length} videos collected
              </strong>

              <p>
                Your knowledge library starts with
                the videos you choose to explore.
              </p>

              <div className="insight-metrics">
                <div>
                  <strong>
                    {readyCount}
                  </strong>
                  <span>Ready</span>
                </div>

                <div>
                  <strong>
                    {processingCount}
                  </strong>
                  <span>In progress</span>
                </div>
              </div>
            </div>
          </section>

          <div className="library-columns">
            <section
              className="library-main"
              aria-labelledby="library-heading"
            >
              <div className="section-heading">
                <div>
                  <span className="section-kicker">
                    YOUR COLLECTION
                  </span>

                  <h2 id="library-heading">
                    Your video library
                    <span className="library-count">
                      {videos.length}
                    </span>
                  </h2>
                </div>
              </div>

              <label className="search-field">
                <span
                  className="search-symbol"
                  aria-hidden="true"
                >
                  ⌕
                </span>

                <span className="sr-only">
                  Search videos
                </span>

                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) =>
                    setSearchQuery(
                      event.target.value,
                    )
                  }
                  placeholder="Search titles or YouTube URLs..."
                />
              </label>

              <div
                className="filter-row"
                aria-label="Filter videos"
              >
                {(
                  [
                    ['all', 'All'],
                    ['ready', 'Ready'],
                    ['queued', 'Queued'],
                    ['processing', 'Processing'],
                    ['failed', 'Failed'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      filter === value
                        ? 'filter-chip active'
                        : 'filter-chip'
                    }
                    aria-pressed={
                      filter === value
                    }
                    onClick={() =>
                      setFilter(value)
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>

              {filteredVideos.length > 0 ? (
                <div className="video-library">
                  {filteredVideos.map(
                    (video) => (
                      <VideoCard
                        key={video.id}
                        video={video}
                        isSelected={
                          video.id ===
                          selectedVideoId
                        }
                        onSelect={
                          handleSelectVideo
                        }
                      />
                    ),
                  )}
                </div>
              ) : (
                <div className="empty-library">
                  <div
                    className="empty-icon"
                    aria-hidden="true"
                  >
                    ▣
                  </div>

                  <h3>
                    {videos.length === 0
                      ? 'Your library starts here'
                      : 'No matching videos'}
                  </h3>

                  <p>
                    {videos.length === 0
                      ? 'Add a YouTube video to begin building your learning library.'
                      : 'Try changing your search or status filter.'}
                  </p>

                  {videos.length === 0 && (
                    <a
                      href="#add-video"
                      className="text-link"
                    >
                      Add your first video
                    </a>
                  )}
                </div>
              )}
            </section>

            <aside className="library-side-panel">
              <section
                id="add-video"
                className="panel-card"
                aria-labelledby="add-video-heading"
              >
                <span className="section-kicker">
                  GROW YOUR KNOWLEDGE
                </span>

                <h2 id="add-video-heading">
                  Add a video
                </h2>

                <p>
                  Paste a YouTube link to add it
                  to your library.
                </p>

                <form
                  className="add-video-form"
                  onSubmit={handleSubmit}
                >
                  <label htmlFor="video-url">
                    YouTube URL
                  </label>

                  <input
                    id="video-url"
                    type="url"
                    value={videoUrl}
                    onChange={(event) =>
                      setVideoUrl(
                        event.target.value,
                      )
                    }
                    placeholder="https://www.youtube.com/watch?v=..."
                    disabled={isSubmitting}
                    required
                  />

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSubmitting}
                  >
                    {isSubmitting
                      ? 'Adding video...'
                      : '＋ Add to library'}
                  </button>
                </form>

                {submissionError && (
                  <p
                    role="alert"
                    className="error-message"
                  >
                    {submissionError}
                  </p>
                )}
              </section>

              <section className="panel-card learning-panel">
                <span className="section-kicker">
                  LIBRARY OVERVIEW
                </span>

                <h2>
                  Learning progress
                </h2>

                <div className="overview-item">
                  <span>
                    Total videos
                  </span>
                  <strong>
                    {videos.length}
                  </strong>
                </div>

                <div className="overview-item">
                  <span>
                    Ready to explore
                  </span>
                  <strong>
                    {readyCount}
                  </strong>
                </div>

                <div className="overview-item">
                  <span>
                    Processing
                  </span>
                  <strong>
                    {processingCount}
                  </strong>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/*
        Keep VideoWorkspace mounted when navigating
        to the library.

        This preserves ChatPanel's conversation state,
        including each video's thread ID and messages.
      */}
      <div
        className="vm-workspace-mounted"
        hidden={
          activePage !== 'workspace'
        }
      >
        <VideoWorkspace
          ref={playerRef}
          video={selectedVideo}
          pollingError={
            selectedVideo
              ? pollingErrors[
                  selectedVideo.id
                ]
              : undefined
          }
          isMockMode={useMockApi}
          onBack={() =>
            setActivePage('library')
          }
        >
          {/*
            In backend mode, manually upload the transcript
            until automatic ingestion becomes available.
          */}
          {!useMockApi &&
            selectedVideo &&
            selectedVideo.status === 'failed' && (
              <TranscriptUploadPanel
                key={selectedVideo.id}
                videoId={
                  selectedVideo.id
                }
                getAccessToken={getAccessToken}
                onUploaded={
                  handleTranscriptUploaded
                }
              />
            )}

          {/*
            Streaming uses the real backend's SSE endpoint.

            Mock mode retains the existing non-streaming
            adapter for compatibility with current tests.
          */}
          <ChatPanel
            videoId={selectedVideoId}
            isReadyForChat={
              !useMockApi &&
              selectedVideo?.status === 'ready'
            }
            api={chatApi}
            stream={
              !useMockApi
                ? (request, callbacks) =>
                    streamVideoQuestion(
                      request,
                      callbacks,
                      undefined,
                      getAccessToken,
                    )
                : undefined
            }
            onSeek={
              handleSeekToSource
            }
          />
        </VideoWorkspace>
      </div>
      {libraryError && (
        <p className="error-message" role="alert">
          {libraryError}
        </p>
      )}
    </AppShell>
  )
}

export default App

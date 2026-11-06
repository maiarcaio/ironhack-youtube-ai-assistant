
import { useEffect, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'

import { AppShell } from './components/layout/AppShell'
import { VideoWorkspace } from './components/workspace/VideoWorkspace'
import { ChatPanel } from './components/chat/ChatPanel'
import { VideoCard } from './components/video/VideoCard'

import type { YouTubePlayerHandle } from './components/player/YouTubePlayer'
import { createHttpChatApi } from './services/api/httpChatApi'
import { videoApi } from './services/api'
import type { Video, VideoStatus } from './types/video'

import './App.css'

// Both video and chat use the same backend configuration.
const useMockApi = import.meta.env.VITE_USE_MOCK_API !== 'false'

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

// Keep the API client stable across React renders.
const chatApi = createHttpChatApi(apiBaseUrl)

// Screens supported by the navigation shell.
type Page = 'library' | 'workspace'

// Status filters supported by the library.
type LibraryFilter = 'all' | VideoStatus

function App() {
  // Videos added during the current browser session.
  const [videos, setVideos] = useState<Video[]>([])

  // Currently selected video and active screen.
  const [selectedVideoId, setSelectedVideoId] =
    useState<string | null>(null)

  const [activePage, setActivePage] =
    useState<Page>('library')

  // Input and library filtering.
  const [videoUrl, setVideoUrl] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<LibraryFilter>('all')

  // Submission and status-check errors.
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [submissionError, setSubmissionError] =
    useState<string | null>(null)

  const [pollingErrors, setPollingErrors] =
    useState<Record<string, string>>({})

  /*
   * App owns the player's public reference.
   *
   * VideoWorkspace forwards this ref to YouTubePlayer.
   * ChatPanel can request seeking without accessing the
   * player directly.
   */
  const playerRef = useRef<YouTubePlayerHandle>(null)

  // Find the currently selected video.
  const selectedVideo =
    videos.find((video) => video.id === selectedVideoId) ?? null

  /*
   * This is an event callback, not rendering logic.
   *
   * It runs only when the user activates a timestamped
   * source citation in the AI assistant.
   */
  function handleSeekToSource(seconds: number): void {
    // Never seek when the video workspace is not active.
    if (activePage !== 'workspace' || !selectedVideo) {
      return
    }

    // A timestamp must be finite and non-negative.
    if (!Number.isFinite(seconds) || seconds < 0) {
      return
    }

    // The player rejects seeking if YouTube isn't ready.
    playerRef.current?.seekTo(seconds)
  }

  // Calculate counts for the library dashboard.
  const readyCount = videos.filter(
    (video) => video.status === 'ready',
  ).length

  const processingCount = videos.filter(
    (video) =>
      video.status === 'processing' ||
      video.status === 'queued',
  ).length

  // Filter titles and URLs in the current collection.
  const filteredVideos = videos.filter((video) => {
    const searchText = searchQuery.trim().toLowerCase()

    const matchesSearch =
      video.title.toLowerCase().includes(searchText) ||
      video.source_url.toLowerCase().includes(searchText)

    const matchesStatus =
      filter === 'all' || video.status === filter

    return matchesSearch && matchesStatus
  })

  // Stable list of IDs that still require polling.
  const pendingVideoIds = videos
    .filter(
      (video) =>
        video.status === 'queued' ||
        video.status === 'processing',
    )
    .map((video) => video.id)
    .join('|')

  // Add a new YouTube video using the existing API.
  async function handleSubmit(
    event: SubmitEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (isSubmitting) return

    const sourceUrl = videoUrl.trim()

    setIsSubmitting(true)
    setSubmissionError(null)

    try {
      const response = await videoApi.ingestVideo({
        url: sourceUrl,
      })

      // Construct an initial library entry.
      const newVideo: Video = {
        id: response.video_id,
        source_url: sourceUrl,
        title: 'Processing video',
        thumbnail_url: null,
        status: response.status,
        created_at: new Date().toISOString(),
        error: null,
      }

      // Preserve previously added videos.
      setVideos((current) => [newVideo, ...current])

      setSelectedVideoId(newVideo.id)
      setVideoUrl('')

      // Show the newly added video in the library.
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

  // Open the selected video's workspace.
  function handleSelectVideo(videoId: string) {
    setSelectedVideoId(videoId)
    setActivePage('workspace')
  }

  // Poll unfinished videos until processing completes.
  useEffect(() => {
    if (!pendingVideoIds) return

    const videoIds = pendingVideoIds.split('|')

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    async function checkPendingVideos() {
      await Promise.all(
        videoIds.map(async (videoId) => {
          try {
            const response =
              await videoApi.getVideoStatus(videoId)

            if (cancelled) return

            // Update the matching video, not the whole list.
            setVideos((current) =>
              current.map((video) =>
                video.id === videoId
                  ? {
                      ...video,
                      status: response.status,
                      title: response.title ?? video.title,
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

            // Clear a previous error after recovery.
            setPollingErrors((current) => {
              if (!(videoId in current)) return current

              const updated = { ...current }
              delete updated[videoId]
              return updated
            })
          } catch (caughtError) {
            if (cancelled) return

            // A request error doesn't prove ingestion failed.
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

    // Ignore outdated responses and cancel the timer.
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [pendingVideoIds])

  return (
    <AppShell
      activePage={activePage}
      onNavigate={setActivePage}
    >
      {activePage === 'library' && (
        <div className="library-page">
          {/* Main library introduction. */}
          <section className="library-hero">
            <div className="hero-content">
              <span className="eyebrow">
                <span className="eyebrow-dot" />
                YOUR AI LEARNING STUDIO
              </span>

              <h1>
                Don&apos;t just watch.
                <span> Understand everything.</span>
              </h1>

              <p>
                Turn YouTube videos into searchable knowledge.
                Organize your library and explore what you learn.
              </p>

              <a className="hero-action" href="#add-video">
                <span aria-hidden="true">＋</span>
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
                Your knowledge library starts with the videos
                you choose to explore.
              </p>

              <div className="insight-metrics">
                <div>
                  <strong>{readyCount}</strong>
                  <span>Ready</span>
                </div>

                <div>
                  <strong>{processingCount}</strong>
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

              {/* Search video titles and YouTube URLs. */}
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
                    setSearchQuery(event.target.value)
                  }
                  placeholder="Search titles or YouTube URLs..."
                />
              </label>

              {/* Filter the current video collection. */}
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
                    aria-pressed={filter === value}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {filteredVideos.length > 0 ? (
                <div className="video-library">
                  {filteredVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      isSelected={
                        video.id === selectedVideoId
                      }
                      onSelect={handleSelectVideo}
                    />
                  ))}
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
              {/* Video submission form. */}
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
                  Paste a YouTube link to add it to your library.
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
                      setVideoUrl(event.target.value)
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

              {/* Library statistics. */}
              <section className="panel-card learning-panel">
                <span className="section-kicker">
                  LIBRARY OVERVIEW
                </span>

                <h2>Learning progress</h2>

                <div className="overview-item">
                  <span>Total videos</span>
                  <strong>{videos.length}</strong>
                </div>

                <div className="overview-item">
                  <span>Ready to explore</span>
                  <strong>{readyCount}</strong>
                </div>

                <div className="overview-item">
                  <span>Processing</span>
                  <strong>{processingCount}</strong>
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/*
        Keep the workspace mounted during ordinary navigation.
        This preserves ChatPanel's in-memory conversations.
      */}
      <div
        className="vm-workspace-mounted"
        hidden={activePage !== 'workspace'}
      >
        <VideoWorkspace
          ref={playerRef}
          video={selectedVideo}
          pollingError={
            selectedVideo
              ? pollingErrors[selectedVideo.id]
              : undefined
          }
          isMockMode={useMockApi}
          onBack={() => setActivePage('library')}
        >
          {/*
            The callback is passed as an event handler.
            It is not executed during React rendering.
          */}
          <ChatPanel
            videoId={selectedVideoId}
            isReadyForChat={
              !useMockApi &&
              selectedVideo?.status === 'ready'
            }
            api={chatApi}
            onSeek={handleSeekToSource}
          />
        </VideoWorkspace>
      </div>
    </AppShell>
  )
}

export default App

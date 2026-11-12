
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SubmitEvent } from 'react'
import type { Session } from '@supabase/supabase-js'

import { VideoMindShell } from './components/layout/VideoMindShell'
import type { Page } from './components/layout/VideoMindShell'
import { SettingsView, TranscriptContent } from './components/layout/SupplementalViews'
import { TranscriptsLibraryView } from './components/layout/TranscriptsLibraryView'
import { VideoWorkspaceView } from './components/workspace/VideoWorkspaceView'
import { TranscriptUploadPanel } from './components/workspace/TranscriptUploadPanel'
import { ChatPanel } from './components/chat/ChatPanel'
import { AddVideoModal } from './components/video/AddVideoModal'
import { AudioUploadModal } from './components/video/AudioUploadModal'
import { AudioPlayer } from './components/player/AudioPlayer'
import type { AudioPlayerHandle } from './components/player/AudioPlayer'
import { isUploadedAudioSource } from './services/api/audioUpload'
import { VideoLibraryView } from './components/video/VideoLibraryView'
import { SavedNotesView } from './components/notes/SavedNotesView'
import { WorkspaceNotesPanel } from './components/notes/WorkspaceNotesPanel'
import { useNotes } from './features/notes/notesContext'
import type { VideoNote } from './features/notes/notesStorage'

import type { YouTubePlayerHandle } from './components/player/YouTubePlayer'
import { createHttpChatApi } from './services/api/httpChatApi'
import { streamVideoQuestion } from './services/api/videomindBackend'
import { videoApi } from './services/api'
import { createAuthenticatedVideoApi } from './services/api/authenticatedVideoApi'
import { getAccessToken, supabase } from './services/api/supabaseClient'
import type { Video, VideoStatus } from './types/video'
import { extractYouTubeVideoId } from './utils/youtube'

import './App.css'

// Mock mode is opt-in so missing production configuration cannot simulate success.
const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true'

// Both the regular chat client and streaming client use this backend URL.
const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

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
  const [archivedVideos, setArchivedVideos] = useState<Video[]>([])
  const [libraryCollection, setLibraryCollection] = useState<'active' | 'archived'>('active')

  // Track the selected video and active application page.
  const [selectedVideoId, setSelectedVideoId] =
    useState<string | null>(null)

  const [activePage, setActivePage] =
    useState<Page>('library')

  // Video submission and library search.
  const [videoUrl, setVideoUrl] = useState('')
  const [isAddVideoOpen, setIsAddVideoOpen] = useState(false)
  const [isAudioUploadOpen, setIsAudioUploadOpen] = useState(false)

  // Request and error states.
  const [isSubmitting, setIsSubmitting] =
    useState(false)

  const [submissionError, setSubmissionError] =
    useState<string | null>(null)
  const [audioUploadError, setAudioUploadError] = useState<string | null>(null)

  const [pollingErrors, setPollingErrors] =
    useState<Record<string, string>>({})
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [libraryActionError, setLibraryActionError] = useState<string | null>(null)
  const [, setHiddenVideoIds] = useState<Set<string>>(() => new Set())
  const hiddenVideoIdsRef = useRef<Set<string>>(new Set())
  const libraryRequestRef = useRef(0)
  const archivedRequestRef = useRef(0)
  const sessionUserIdRef = useRef(session?.user.id ?? null)
  sessionUserIdRef.current = session?.user.id ?? null

  /**
   * Keep the YouTube player's public reference.
   *
   * ChatPanel requests seeking through a callback rather
   * than interacting directly with the player.
   */
  const playerRef = useRef<YouTubePlayerHandle & AudioPlayerHandle>(null)
  const pendingTranscriptSeekRef = useRef<{
    videoId: string
    seconds: number
  } | null>(null)
  const pendingNoteSeekRef = useRef<{
    requestId: number
    ownerKey: string
    videoId: string
    seconds: number
  } | null>(null)
  const nextNoteSeekRequest = useRef(0)
  const { storageKey: notesOwnerKey, notes } = useNotes()

  // Find the selected video in the current library.
  const selectedVideo =
    videos.find(
      (video) => video.id === selectedVideoId,
    ) ?? null
  const selectedAudio = selectedVideo && isUploadedAudioSource(selectedVideo.source_url)
  const selectedUnsupported = selectedVideo?.source_url.startsWith('storage://') && !selectedAudio

  async function refreshArchivedVideos(): Promise<boolean> {
    const requestId = ++archivedRequestRef.current
    const ownerId = sessionUserIdRef.current
    try {
      const response = await activeVideoApi.listArchivedVideos()
      if (requestId !== archivedRequestRef.current || ownerId !== sessionUserIdRef.current) return false
      setArchivedVideos(response.videos.map(toVideo).filter((video): video is Video => video !== null))
      return true
    } catch (error) {
      if (requestId !== archivedRequestRef.current || ownerId !== sessionUserIdRef.current) return false
      setLibraryActionError(error instanceof Error ? error.message : 'Unable to load archived videos.')
      return false
    }
  }

  async function manageVideo(action: 'archive' | 'restore' | 'delete', video: Video): Promise<void> {
    try {
      setLibraryActionError(null)
      if (action === 'archive') await activeVideoApi.archiveVideo(video.id)
      if (action === 'restore') await activeVideoApi.restoreVideo(video.id)
      if (action === 'delete') {
        await activeVideoApi.deleteVideo(video.id)
        hiddenVideoIdsRef.current = new Set(hiddenVideoIdsRef.current).add(video.id)
        setHiddenVideoIds(hiddenVideoIdsRef.current)
        setVideos((current) => current.filter((item) => item.id !== video.id))
      }
      if (selectedVideoId === video.id) { setSelectedVideoId(null); setActivePage('library') }
      const activeRefreshed = await loadLibrary()
      const archivedRefreshed = await refreshArchivedVideos()
      if (!activeRefreshed || !archivedRefreshed) setLibraryActionError('The change was accepted, but the library could not refresh. Reload the library to confirm it.')
    } catch (error) {
      setLibraryActionError(error instanceof Error ? error.message : 'Library action failed. No change was confirmed.')
    }
  }

  useEffect(() => {
    archivedRequestRef.current += 1
    hiddenVideoIdsRef.current = new Set()
    setHiddenVideoIds(hiddenVideoIdsRef.current)
    setArchivedVideos([])
    setLibraryActionError(null)
  }, [session?.user.id])

  // The refresh helper is intentionally invoked only when entering this page.
  useEffect(() => {
    if (activePage === 'transcripts' && !useMockApi) void refreshArchivedVideos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, session?.user.id])

  /**
   * Seek to a source citation timestamp.
   *
   * Ignore requests for invalid timestamps or when
   * the video workspace isn't active.
   */
  function handleSeekToSource(seconds: number): void {
    if (
      (activePage !== 'workspace' &&
        activePage !== 'qa' &&
        activePage !== 'transcript') ||
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

    if (!playerRef.current?.seekTo(seconds)) {
      pendingTranscriptSeekRef.current = {
        videoId: selectedVideo.id,
        seconds,
      }
    }
  }

  function handleOpenNote(note: VideoNote): void {
    if (!notesOwnerKey) return

    const targetVideo = videos.find((video) => video.id === note.videoId)
    if (!targetVideo) return

    nextNoteSeekRequest.current += 1
    pendingNoteSeekRef.current = {
      requestId: nextNoteSeekRequest.current,
      ownerKey: notesOwnerKey,
      videoId: note.videoId,
      seconds: note.seconds,
    }

    setSelectedVideoId(note.videoId)
    setActivePage('workspace')

    if (
      selectedVideoId === note.videoId &&
      playerRef.current?.seekTo(note.seconds)
    ) {
      pendingNoteSeekRef.current = null
    }
  }

  const handlePlayerReadyChange = useCallback((ready: boolean): void => {
    if (!ready) return

    const pendingTranscriptSeek = pendingTranscriptSeekRef.current
    if (
      pendingTranscriptSeek?.videoId === selectedVideoId &&
      playerRef.current?.seekTo(pendingTranscriptSeek.seconds)
    ) {
      pendingTranscriptSeekRef.current = null
    }

    const pending = pendingNoteSeekRef.current
    if (
      !pending ||
      pending.ownerKey !== notesOwnerKey ||
      pending.videoId !== selectedVideoId
    ) {
      return
    }

    if (playerRef.current?.seekTo(pending.seconds)) {
      pendingNoteSeekRef.current = null
    }
  }, [notesOwnerKey, selectedVideoId])

  useEffect(() => {
    const pendingTranscriptSeek = pendingTranscriptSeekRef.current

    if (
      activePage !== 'workspace' ||
      pendingTranscriptSeek?.videoId !== selectedVideoId
    ) {
      return
    }

    if (playerRef.current?.seekTo(pendingTranscriptSeek.seconds)) {
      pendingTranscriptSeekRef.current = null
    }
  }, [activePage, selectedVideoId])

  const handlePlayerUnavailable = useCallback((): void => {
    const pendingTranscriptSeek = pendingTranscriptSeekRef.current
    if (pendingTranscriptSeek?.videoId === selectedVideoId) {
      pendingTranscriptSeekRef.current = null
    }

    const pending = pendingNoteSeekRef.current
    if (pending?.videoId === selectedVideoId) {
      pendingNoteSeekRef.current = null
    }
  }, [selectedVideoId])

  function getPlaybackTime(): number | null {
    return playerRef.current?.getCurrentTime() ?? null
  }

  useEffect(() => {
    const pendingTranscriptSeek = pendingTranscriptSeekRef.current
    if (
      pendingTranscriptSeek &&
      pendingTranscriptSeek.videoId !== selectedVideoId
    ) {
      pendingTranscriptSeekRef.current = null
    }
  }, [selectedVideoId])

  useEffect(() => {
    const pending = pendingNoteSeekRef.current
    if (pending && pending.ownerKey !== notesOwnerKey) {
      pendingNoteSeekRef.current = null
    }
  }, [notesOwnerKey])

  useEffect(() => {
    const pending = pendingNoteSeekRef.current
    if (pending && pending.videoId !== selectedVideoId) {
      pendingNoteSeekRef.current = null
    }
  }, [selectedVideoId])

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
    thumbnail_url?: string | null
  }): Video | null {
    // A playable library entry needs the backend's original source URL.
    // Do not fabricate one when persistence returns incomplete data.
    if (!item.source_url) return null

    return {
      id: item.video_id,
      title: item.title,
      source_url: item.source_url,
      status: item.status,
      thumbnail_url: item.thumbnail_url ?? (() => {
        const id = extractYouTubeVideoId(item.source_url)
        return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null
      })(),
      error: null,
    }
  }

  const loadLibrary = useCallback(async (): Promise<boolean> => {
    const requestId = ++libraryRequestRef.current
    const sessionUserId = sessionUserIdRef.current

    function isCurrentRequest(): boolean {
      return (
        libraryRequestRef.current === requestId &&
        sessionUserIdRef.current === sessionUserId
      )
    }

    try {
      const response = await activeVideoApi.listVideos()
      if (!isCurrentRequest()) return false

      const loadedVideos = response.videos
        .map(toVideo)
        .filter((video): video is Video => video !== null && !hiddenVideoIdsRef.current.has(video.id))

      setVideos(loadedVideos)
      setLibraryError(null)

      const failedVideos = loadedVideos.filter(
        (video) => video.status === 'failed',
      )
      if (failedVideos.length === 0) return true

      const statusResults = await Promise.all(
        failedVideos.map(async (video) => {
          try {
            const status = await activeVideoApi.getVideoStatus(video.id)
            return status.video_id === video.id
              ? [video.id, status] as const
              : null
          } catch {
            return null
          }
        }),
      )
      if (!isCurrentRequest()) return false

      const statuses = new Map(
        statusResults.filter(
          (result): result is NonNullable<typeof result> => result !== null,
        ),
      )

      setVideos((current) => current.map((video) => {
        const status = statuses.get(video.id)

        // A transcript upload or a newer poll may already have advanced
        // this record while the failure detail request was in flight.
        if (!status || video.status !== 'failed') return video

        return {
          ...video,
          status: status.status,
          title: status.title ?? video.title,
          thumbnail_url: status.thumbnail_url ?? video.thumbnail_url,
          error: status.status === 'failed' ? status.error : null,
        }
      }))
      return true
    } catch (caughtError) {
      if (!isCurrentRequest()) return false
      setLibraryError(caughtError instanceof Error ? caughtError.message : 'Unable to load your video library.')
      return false
    }
  }, [activeVideoApi])

  // Persistent videos belong to the authenticated user, not this browser session.
  useEffect(() => {
    if (!useMockApi && session) void loadLibrary()

    return () => {
      libraryRequestRef.current += 1
    }
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
        setIsAddVideoOpen(false)
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
      setIsAddVideoOpen(false)

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

  async function handleAudioUpload(file: File): Promise<boolean> {
    if (isSubmitting || useMockApi) return false
    setIsSubmitting(true)
    setAudioUploadError(null)
    try {
      const response = await activeVideoApi.uploadAudio(file)
      const refreshed = await loadLibrary()
      setSelectedVideoId(response.video_id)
      if (refreshed) {
        setIsAudioUploadOpen(false)
      } else {
        setAudioUploadError('Recording accepted by the backend, but the library could not refresh. Use Refresh library or reload the page; do not upload again.')
      }
      return true
    } catch (caughtError) {
      setAudioUploadError(caughtError instanceof Error ? caughtError.message : 'Unable to upload audio.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  function UnsupportedMediaNotice() {
    return <div className="flex min-h-64 items-center justify-center p-8 text-center"><div><h2 className="text-base font-bold text-white">Unsupported private media</h2><p className="mt-2 text-xs text-[#e7e1df]">This recording format cannot be played by the current frontend.</p></div></div>
  }

  // Open a video from the library.
  function handleSelectVideo(
    videoId: string,
  ): void {
    pendingNoteSeekRef.current = null
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

  const assistantPanel = (
    <>
      {!useMockApi && selectedVideo?.status === 'failed' && (
        <TranscriptUploadPanel
          key={selectedVideo.id}
          videoId={selectedVideo.id}
          serverError={selectedVideo.error}
          getAccessToken={getAccessToken}
          onUploaded={handleTranscriptUploaded}
        />
      )}
      <ChatPanel
        videoId={selectedVideoId}
        isReadyForChat={!useMockApi && selectedVideo?.status === 'ready'}
        api={chatApi}
        stream={!useMockApi ? (request, callbacks) => streamVideoQuestion(request, callbacks, undefined, getAccessToken) : undefined}
        onSeek={handleSeekToSource}
      />
    </>
  )

  const notesPanel = selectedVideo ? (
    <WorkspaceNotesPanel
      key={selectedVideo.id}
      video={selectedVideo}
      getPlaybackTime={getPlaybackTime}
      onOpenAllNotes={() => setActivePage('notes')}
      onSeek={handleSeekToSource}
    />
  ) : null

  const transcriptPanel = (
    <TranscriptContent
      key={`workspace-transcript-${selectedVideo?.id ?? 'none'}`}
      videos={videos}
      selectedVideo={selectedVideo}
      onNavigate={setActivePage}
      onSeek={handleSeekToSource}
      compact
    />
  )

  return (
    <VideoMindShell
      activePage={activePage}
      onNavigate={setActivePage}
      onAddVideo={() => setIsAddVideoOpen(true)}
      onSearch={() => {
        setActivePage('library')
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.search-field input')?.focus(), 0)
      }}
      onSignOut={
        !useMockApi && session
          ? () => { void supabase?.auth.signOut() }
          : undefined
      }
    >
      {activePage === 'library' && (
        <VideoLibraryView
          videos={libraryCollection === 'active' ? videos : archivedVideos}
          selectedVideoId={selectedVideoId}
          isMockMode={useMockApi}
          collection={libraryCollection}
          onCollectionChange={(collection) => { setLibraryCollection(collection); if (collection === 'archived') void refreshArchivedVideos() }}
          onManageVideo={manageVideo}
          actionError={libraryActionError}
          onSelectVideo={handleSelectVideo}
          onOpenAddVideo={() => setIsAddVideoOpen(true)}
          onOpenAudioUpload={() => { setAudioUploadError(null); setIsAudioUploadOpen(true) }}
        />
      )}

      {activePage === 'transcripts' && (
        <TranscriptsLibraryView
          videos={[...videos, ...archivedVideos]}
          archivedVideoIds={new Set(archivedVideos.map((video) => video.id))}
          onBackToLibrary={() => setActivePage('library')}
          onOpenVideo={(video, seconds) => {
            if (seconds !== undefined) pendingTranscriptSeekRef.current = { videoId: video.id, seconds }
            setSelectedVideoId(video.id)
            setActivePage('workspace')
          }}
          onSeek={handleSeekToSource}
        />
      )}

      {/*
        Keep VideoWorkspace mounted when navigating
        to the library.

        This preserves ChatPanel's conversation state,
        including each video's thread ID and messages.
      */}
      <div
        className="vm-workspace-mounted"
        hidden={activePage !== 'workspace' && activePage !== 'qa' && activePage !== 'transcript'}
      >
        <VideoWorkspaceView
          ref={playerRef}
          video={selectedVideo}
          notesCount={selectedVideo
            ? notes.filter((note) => note.videoId === selectedVideo.id).length
            : 0}
          notesPanel={notesPanel}
          transcriptPanel={transcriptPanel}
          selectedTool={activePage === 'qa' ? 'ask-ai' : activePage === 'transcript' ? 'transcript' : undefined}
          onToolChange={(tool) => setActivePage(tool === 'ask-ai' ? 'qa' : tool === 'transcript' ? 'transcript' : 'workspace')}
          pollingError={
            selectedVideo
              ? pollingErrors[
                  selectedVideo.id
                ]
              : undefined
          }
          isMockMode={useMockApi}
          onPlayerReadyChange={handlePlayerReadyChange}
          onPlayerUnavailable={handlePlayerUnavailable}
          onOpenAssistant={() => setActivePage('qa')}
            onBack={() => setActivePage('library')}
            player={selectedUnsupported ? <UnsupportedMediaNotice /> : selectedAudio ? <AudioPlayer videoId={selectedVideo.id} title={selectedVideo.title} getPlayback={activeVideoApi.getAudioPlayback} ref={playerRef} onReadyChange={handlePlayerReadyChange} onUnavailable={handlePlayerUnavailable} /> : undefined}
        >
          {assistantPanel}
        </VideoWorkspaceView>
      </div>
      {activePage === 'notes' && (
        <SavedNotesView
          videos={videos}
          onOpenNote={handleOpenNote}
        />
      )}
      {activePage === 'settings' && <SettingsView videos={videos} isMockMode={useMockApi} onOpenTranscripts={() => setActivePage('transcripts')} />}
      {libraryError && (
        <p className="error-message" role="alert">
          {libraryError}
        </p>
      )}
      <AddVideoModal
        isOpen={isAddVideoOpen}
        videoUrl={videoUrl}
        isSubmitting={isSubmitting}
        isMockMode={useMockApi}
        error={submissionError}
        onClose={() => { setIsAddVideoOpen(false); setSubmissionError(null) }}
        onVideoUrlChange={setVideoUrl}
        onSubmit={handleSubmit}
      />
      <AudioUploadModal isOpen={isAudioUploadOpen} isSubmitting={isSubmitting} isMockMode={useMockApi} error={audioUploadError} onClose={() => { setIsAudioUploadOpen(false); setAudioUploadError(null) }} onRefreshLibrary={() => { void loadLibrary() }} onUpload={handleAudioUpload} />
    </VideoMindShell>
  )
}

export default App

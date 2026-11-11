// @vitest-environment jsdom

import { useState } from 'react'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatPanel } from '../chat/ChatPanel'
import type { ChatApi } from '../../services/api/httpChatApi'
import type { ChatResponse } from '../../types/chat'
import type { Video } from '../../types/video'

import { VideoWorkspaceView } from './VideoWorkspaceView'

const videoA: Video = {
  id: 'video-a',
  title: 'Video A',
  source_url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  thumbnail_url: null,
  status: 'ready',
}

const videoB: Video = {
  ...videoA,
  id: 'video-b',
  title: 'Video B',
}

function responseFor(videoId: string): ChatResponse {
  return {
    video_id: videoId,
    thread_id: `thread-${videoId}`,
    answer: `Answer for ${videoId}`,
    sources: [],
    insufficient_evidence: false,
    model_used: null,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function WorkspaceHarness({ api }: { api: ChatApi }) {
  const [video, setVideo] = useState(videoA)
  const [tool, setTool] = useState<'ask-ai' | 'transcript' | 'notes'>('ask-ai')

  return (
    <>
      <button type="button" onClick={() => setVideo(videoA)}>Select video A</button>
      <button type="button" onClick={() => setVideo(videoB)}>Select video B</button>
      <VideoWorkspaceView
        video={video}
        isMockMode={false}
        notesCount={0}
        notesPanel={<div>Notes for {video.id}</div>}
        transcriptPanel={<div>Transcript for {video.id}</div>}
        selectedTool={tool}
        onToolChange={setTool}
        onBack={vi.fn()}
        onOpenAssistant={() => setTool('ask-ai')}
        onPlayerReadyChange={vi.fn()}
        onPlayerUnavailable={vi.fn()}
        player={<div data-testid="persistent-player">Player for {video.id}</div>}
      >
        <ChatPanel videoId={video.id} isReadyForChat api={api} />
      </VideoWorkspaceView>
    </>
  )
}

describe('VideoWorkspaceView with the real ChatPanel', () => {
  it('preserves one video conversation and draft across tools without requesting chat on navigation', async () => {
    const user = userEvent.setup()
    const api: ChatApi = {
      sendMessage: vi.fn(async (request) => responseFor(request.video_id)),
    }

    render(<WorkspaceHarness api={api} />)

    const question = screen.getByRole('textbox', { name: 'Your question' })
    await user.type(question, 'Question for video A')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(await screen.findByText('Answer for video-a')).toBeTruthy()

    await user.type(question, 'Unsent draft for A')
    const player = screen.getByTestId('persistent-player')

    await user.click(screen.getByRole('tab', { name: 'Transcript' }))
    expect(screen.getByTestId('persistent-player')).toBe(player)
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('region', { name: 'Video Q&A', hidden: true })).toHaveLength(1)

    await user.click(screen.getByRole('tab', { name: 'Ask AI' }))
    expect(screen.getByText('Answer for video-a')).toBeTruthy()
    expect((question as HTMLTextAreaElement).value).toBe('Unsent draft for A')
    expect(api.sendMessage).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Select video B' }))
    expect(screen.queryByText('Answer for video-a')).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('')

    await user.click(screen.getByRole('button', { name: 'Select video A' }))
    await waitFor(() => {
      expect(screen.getByText('Answer for video-a')).toBeTruthy()
    })
    expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('Unsent draft for A')
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('region', { name: 'Video Q&A', hidden: true })).toHaveLength(1)
  })
})

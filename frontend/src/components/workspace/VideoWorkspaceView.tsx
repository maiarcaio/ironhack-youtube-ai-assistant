import { forwardRef, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { Video } from '../../types/video'
import { YouTubePlayer } from '../player/YouTubePlayer'
import type { YouTubePlayerHandle } from '../player/YouTubePlayer'

interface Props {
  video: Video | null
  pollingError?: string
  isMockMode: boolean
  notesCount: number
  notesPanel: ReactNode
  transcriptPanel: ReactNode
  selectedTool?: 'ask-ai' | 'transcript' | 'notes'
  onToolChange?: (tool: 'ask-ai' | 'transcript' | 'notes') => void
  onBack: () => void
  onOpenAssistant: () => void
  onPlayerReadyChange: (ready: boolean) => void
  onPlayerUnavailable: () => void
  children: ReactNode
  player?: ReactNode
}

export const VideoWorkspaceView = forwardRef<
  YouTubePlayerHandle,
  Props
>(function VideoWorkspaceView({
  video,
  pollingError,
  isMockMode,
  notesCount,
  notesPanel,
  transcriptPanel,
  selectedTool,
  onToolChange,
  onBack,
  onOpenAssistant,
  onPlayerReadyChange,
  onPlayerUnavailable,
  children,
  player,
}, ref) {
  const [rightTab, setRightTab] = useState<'ask-ai' | 'transcript' | 'notes'>('ask-ai')

  useEffect(() => {
    if (selectedTool) setRightTab(selectedTool)
  }, [selectedTool])

  function selectTool(tool: 'ask-ai' | 'transcript' | 'notes'): void {
    setRightTab(tool)
    onToolChange?.(tool)
  }

  const workspaceStatus = isMockMode
    ? 'Demo video — not indexed'
    : video?.status === 'ready'
      ? 'Transcript indexed'
      : video?.status === 'failed'
        ? 'Automatic processing failed — recovery available'
        : video?.status === 'processing'
          ? 'Automatic processing in progress'
          : 'Waiting for processing'

  return (
    <div className="vm-workspace max-w-7xl mx-auto w-full pb-8 sm:pb-16 flex flex-col gap-4 sm:gap-6" role="region" aria-label="Video workspace">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#ede7e1]/80">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#9a442d] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9a442d]" />
            <span>Video Workspace</span><span className="text-[#88726d]">·</span>
            <span className="text-[#55423e] font-normal normal-case">{isMockMode ? 'Demonstration session' : 'Authenticated study session'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1c1b1a] tracking-tight">{video?.title ?? 'Choose a video to begin'}</h1>
          {video && <p className="text-xs text-[#615e5c]">{workspaceStatus}</p>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={onBack} className="flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl bg-white text-[#1c1b1a] hover:bg-[#f1edea] shadow-xs border border-[#ede7e1] text-xs font-semibold">← Back to library</button>
          {video && <button type="button" onClick={onOpenAssistant} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-[#9a442d] text-white hover:bg-[#5b1604] text-xs font-semibold">✦ Open Q&amp;A</button>}
        </div>
      </div>

      {!video ? (
        <div className="py-20 text-center bg-white rounded-2xl border border-[#ede7e1]">
          <div className="text-3xl text-[#9a442d]">▷</div><h2 className="mt-4 text-lg font-bold">No video selected</h2>
          <p className="mt-2 text-sm text-[#615e5c]">Choose a video from your library to open its workspace.</p>
          <button type="button" onClick={onBack} className="mt-5 px-4 py-2 rounded-xl bg-[#9a442d] text-white text-xs font-semibold">Browse library</button>
        </div>
      ) : (
        <div className="vm-workspace-grid grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 flex flex-col gap-5">
            <div className="rounded-2xl bg-[#1c1b1a] overflow-hidden shadow-xl border border-[#31302f]">
              {player ?? <YouTubePlayer key={video.id} ref={ref} sourceUrl={video.source_url} title={video.title} onReadyChange={onPlayerReadyChange} onUnavailable={onPlayerUnavailable} />}
              <div className="p-4 bg-[#31302f] text-white flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] uppercase tracking-wider text-[#cac5c4]">Current video</p><h2 className="text-sm font-semibold mt-1">{video.title}</h2></div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${video.status === 'ready' ? 'bg-[#b2efde] text-[#0f5044]' : video.status === 'failed' ? 'bg-[#ffdad6] text-[#93000a]' : 'bg-[#ffdbd2] text-[#7c2e19]'}`}>{video.status}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              <section className="p-5 rounded-2xl bg-white shadow-xs border border-[#ede7e1]">
                <h2 className="text-sm font-bold">Processing &amp; source</h2>
                {!video.source_url.startsWith('storage://') && <a href={video.source_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-xs font-semibold text-[#9a442d] underline">Open original YouTube video ↗</a>}
                {video.status === 'queued' && <p className="mt-3 text-xs text-[#615e5c] leading-relaxed">Waiting for automatic processing to begin. Grounded chat remains locked.</p>}
                {video.status === 'processing' && <p className="mt-3 text-xs text-[#615e5c] leading-relaxed">Automatic processing is in progress. Grounded chat unlocks only after completion.</p>}
                {video.status === 'ready' && <p className="mt-3 text-xs text-[#2d685b]">{isMockMode ? 'This video is ready in demonstration mode. It has not been verified as indexed by the real RAG backend.' : 'Backend indexing is complete.'}</p>}
                {video.status === 'failed' && <p role="alert" className="mt-3 text-xs text-[#93000a]">Automatic processing failed. {video.error ?? 'The backend did not provide a specific reason.'}</p>}
                {pollingError && <p role="alert" className="mt-3 text-xs text-[#93000a]">Status check unavailable: {pollingError}</p>}
              </section>
            </div>

            <div className="p-4 rounded-2xl bg-[#f1edea] border border-[#ede7e1] flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#ffdbd2] flex items-center justify-center text-[#7c2e19]">◎</div>
              <div><p className="text-sm font-semibold">Make your learning verifiable</p><p className="text-xs text-[#55423e]">Ask grounded questions or save a note at the exact playback moment.</p></div>
            </div>
          </section>

          <aside className="vm-workspace-tools lg:col-span-4 flex flex-col rounded-2xl bg-white shadow-md border border-[#ede7e1] overflow-hidden">
            <div className="px-3 sm:px-4 pt-4 pb-2 bg-[#f7f3f0] border-b border-[#ede7e1] flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-3" role="tablist" aria-label="Workspace tools">
                <button type="button" role="tab" aria-selected={rightTab === 'ask-ai'} onClick={() => selectTool('ask-ai')} className={`relative whitespace-nowrap pb-2 text-[11px] sm:text-xs font-semibold flex items-center gap-1 ${rightTab === 'ask-ai' ? 'text-[#1c1b1a]' : 'text-[#88726d]'}`}><span aria-hidden="true" className="text-[#9a442d]">✦</span><span>Ask AI</span>{rightTab === 'ask-ai' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9a442d] rounded-full" />}</button>
                <button type="button" role="tab" aria-selected={rightTab === 'transcript'} onClick={() => selectTool('transcript')} className={`relative whitespace-nowrap pb-2 text-[11px] sm:text-xs font-semibold flex items-center gap-1 ${rightTab === 'transcript' ? 'text-[#1c1b1a]' : 'text-[#88726d]'}`}><span aria-hidden="true">▤</span><span>Transcript</span>{rightTab === 'transcript' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9a442d] rounded-full" />}</button>
                <button type="button" role="tab" aria-selected={rightTab === 'notes'} onClick={() => selectTool('notes')} className={`relative whitespace-nowrap pb-2 text-[11px] sm:text-xs font-semibold flex items-center gap-1 ${rightTab === 'notes' ? 'text-[#1c1b1a]' : 'text-[#88726d]'}`}><span aria-hidden="true">✎</span><span>Notes ({notesCount})</span>{rightTab === 'notes' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#9a442d] rounded-full" />}</button>
              </div>
              <span className="hidden sm:inline px-2.5 py-0.5 rounded-full bg-[#f1edea] text-[#55423e] text-[11px]">Browser local</span>
            </div>
            <div className="flex-1 flex flex-col" hidden={rightTab !== 'ask-ai'}>{children}</div>
            <div className="flex-1 flex flex-col" hidden={rightTab !== 'transcript'}>{transcriptPanel}</div>
            <div className="flex-1 flex flex-col" hidden={rightTab !== 'notes'}>{notesPanel}</div>
          </aside>
        </div>
      )}
    </div>
  )
})

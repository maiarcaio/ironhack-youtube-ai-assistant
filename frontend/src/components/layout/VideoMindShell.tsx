import type { ReactNode } from 'react'

export type Page =
  | 'library'
  | 'workspace'
  | 'qa'
  | 'transcript'
  | 'transcripts'
  | 'notes'
  | 'settings'

interface VideoMindShellProps {
  children: ReactNode
  activePage: Page
  onNavigate: (page: Page) => void
  onAddVideo: () => void
  onSearch: () => void
  onSignOut?: () => void
}

const navigation: Array<{ id: Page; label: string; icon: string }> = [
  { id: 'library', label: 'Library', icon: '▣' },
  { id: 'workspace', label: 'Video Workspace', icon: '▷' },
  { id: 'qa', label: 'Q&A Assistant', icon: '✦' },
  { id: 'transcript', label: 'Searchable Transcript', icon: '▤' },
  { id: 'transcripts', label: 'Transcripts', icon: '▤' },
  { id: 'notes', label: 'Saved Notes', icon: '✎' },
]

const modeLabel = import.meta.env.VITE_USE_MOCK_API === 'true'
  ? 'Demo mode'
  : 'Backend mode'

export function VideoMindShell({ children, activePage, onNavigate, onAddVideo, onSearch, onSignOut }: VideoMindShellProps) {
  return <div className="min-h-screen bg-[#f7f3f0] text-[#1c1b1a] flex">
    <aside className="fixed left-2 top-2 bottom-2 w-12 sm:left-3.5 sm:top-3.5 sm:bottom-3.5 sm:w-16 bg-[#31302f] rounded-xl sm:rounded-2xl z-50 flex flex-col items-center py-2 sm:py-4 shadow-[0_10px_30px_-4px_rgba(40,38,37,0.18)] border border-[#494645]/40" aria-label="Main navigation">
      <button onClick={() => onNavigate('library')} className="flex flex-col items-center gap-1 mb-6 group" title="VideoMind home" aria-label="Video Library">
        <img src="/videomind-logo.png" alt="" className="w-7 h-7 sm:w-9 sm:h-9 object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105" />
      </button>
      <nav className="flex-1 flex flex-col items-center gap-1.5 sm:gap-2.5 w-full px-1" aria-label="Primary">
        {navigation.map((item) => <button key={item.id} type="button" onClick={() => onNavigate(item.id)} className={`relative w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-lg sm:rounded-xl transition-all group ${activePage === item.id ? 'bg-[#9a442d] text-white shadow-md' : 'text-[#e7e1df] hover:bg-[#e5e2df]/15 hover:text-white hover:scale-105'}`} title={item.label} aria-label={item.label} aria-current={activePage === item.id ? 'page' : undefined}><span className="text-base sm:text-[21px] leading-none">{item.icon}</span></button>)}
      </nav>
      <button type="button" onClick={() => onNavigate('settings')} className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg sm:rounded-xl transition-all ${activePage === 'settings' ? 'bg-[#9a442d] text-white shadow-md' : 'text-[#e7e1df] hover:bg-[#e5e2df]/15 hover:text-white'}`} title="Settings" aria-label="Settings">⚙</button>
    </aside>
    <div className="pl-16 sm:pl-20 flex-1 min-w-0">
      <header className="sticky top-0 h-14 sm:h-16 bg-[#fdf9f6]/90 backdrop-blur-xl z-40 border-b border-[#ede7e1] shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
        <div className="h-14 sm:h-16 w-full px-3 sm:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0"><div className="flex items-center gap-1.5 text-sm truncate"><button type="button" onClick={() => onNavigate('library')} className="text-[#55423e] hover:text-[#9a442d]">My workspace</button><span className="text-[#88726d] text-xs">/</span><button type="button" onClick={() => onNavigate('library')} className="text-[#1c1b1a] hover:text-[#9a442d] font-semibold">VideoMind AI</button></div><div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#b2efde] text-[#346e61] text-xs font-semibold"><span className="w-1.5 h-1.5 rounded-full bg-[#2d685b]"/>{modeLabel}</div></div>
          <div className="flex items-center gap-2 flex-shrink-0">{onSignOut && <button type="button" onClick={onSignOut} className="hidden lg:block text-xs text-[#55423e] hover:text-[#9a442d]">Sign out</button>}<button onClick={onSearch} className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#f1edea] hover:bg-[#ebe7e4] text-[#55423e] text-xs font-medium border border-[#dbc1ba]/30" type="button" aria-label="Search videos"><span>⌕</span><span className="hidden md:inline">Search video library...</span><kbd className="hidden lg:inline ml-1.5 px-1.5 py-0.5 text-[10px] rounded bg-[#e5e2df]">⌘K</kbd></button><button onClick={onAddVideo} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#9a442d] text-white hover:bg-[#5b1604] transition-all shadow-[0_4px_16px_-2px_rgba(154,68,45,0.25)] text-xs font-semibold" type="button" aria-label="Add video"><span aria-hidden="true">＋</span><span className="hidden sm:inline">Add video</span></button></div>
        </div>
      </header>
      <main className="w-full pt-4 sm:pt-6 px-3 sm:px-10 flex-1">{children}</main>
    </div>
  </div>
}

import type { Video } from '../../types/video'

import './SupplementalViews.css'

interface SupplementalProps {
  videos: Video[]
  selectedVideo: Video | null
  onNavigate: (page: 'library' | 'workspace' | 'qa') => void
}

function ScreenHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="vm-screen-header"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></header>
}

export function SearchableTranscriptView({ selectedVideo, onNavigate }: SupplementalProps) {
  return <div className="vm-screen">
    <ScreenHeader eyebrow="SEARCHABLE TRANSCRIPT" title="Every moment, searchable." description="Find and revisit exact spoken moments from a video." />
    <div className="vm-transcript-layout">
      <section className="vm-paper">
        <div className="vm-search-surface"><span>⌕</span><input aria-label="Search transcript" disabled placeholder="Search transcript when a transcript read endpoint is available" /></div>
        <div className="vm-disabled-pills"><button type="button" disabled>All chapters</button><button type="button" disabled>Timestamped segments</button></div>
        <div className="vm-unavailable-panel"><div>▤</div><h2>Transcript search is not available yet</h2><p>VideoMind can recover a failed transcript through the existing upload flow, but the backend does not currently provide a readable transcript endpoint for search.</p>{selectedVideo && <button type="button" onClick={() => onNavigate('workspace')}>Back to {selectedVideo.title}</button>}</div>
      </section>
      <aside className="vm-paper vm-context-card"><p>VIDEO CONTEXT</p><h2>{selectedVideo?.title ?? 'Choose a video'}</h2><span>Search will become available when transcript retrieval is exposed by the backend.</span></aside>
    </div>
  </div>
}

export function SettingsView({ videos, isMockMode }: Pick<SupplementalProps, 'videos'> & { isMockMode: boolean }) {
  return <div className="vm-screen vm-settings">
    <ScreenHeader eyebrow="SETTINGS / WORKSPACE PREFERENCES" title="VideoMind settings" description="Controls are shown only where the connected services can support them." />
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">↓</div><div><h2>Transcript export</h2><p>Saved Notes can already be exported as Markdown from the Saved Notes page. Full transcript export requires a backend transcript-read contract.</p></div><button type="button" disabled>Unavailable</button></section>
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">◌</div><div><h2>{isMockMode ? 'Demonstration data' : 'Authentication'}</h2><p>{isMockMode ? 'This explicitly configured demo library is stored only for the current browser session.' : 'Your library is scoped to the signed-in account. Use the existing sign-out control in the header.'}</p></div><span className="vm-status">{videos.length} video{videos.length === 1 ? '' : 's'} in this library</span></section>
    <section className="vm-paper vm-settings-card"><div className="vm-setting-icon">✦</div><div><h2>Grounded answers</h2><p>{isMockMode ? 'Chat remains unavailable for demo videos because they have not been indexed by the real backend.' : 'Chat is enabled only after the backend reports a video ready; citations use returned source timestamps.'}</p></div><span className="vm-status">{isMockMode ? 'Demo workflow' : 'Connected workflow'}</span></section>
  </div>
}

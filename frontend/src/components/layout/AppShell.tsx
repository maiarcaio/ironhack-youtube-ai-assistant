
import type { ReactNode } from 'react'

// Define which information the shell receives from its parent.
interface AppShellProps {
  children: ReactNode
  activePage: 'library' | 'workspace'
  onNavigate: (page: 'library' | 'workspace') => void
}

// AppShell manages the shared application layout.
// It does not contain video processing or API logic.
export function AppShell({
  children,
  activePage,
  onNavigate,
}: AppShellProps) {
  return (
    <div className="app-shell">
      {/* Persistent navigation rail */}
      <aside className="app-sidebar" aria-label="Main navigation">
        <div className="sidebar-brand" aria-label="VideoMind AI">
          <span className="brand-mark">V</span>
          <span className="brand-caption">VM</span>
        </div>

        <nav className="sidebar-nav" aria-label="Primary">
          {/* Library navigation */}
          <button
            type="button"
            className={
              activePage === 'library'
                ? 'nav-item nav-item-active'
                : 'nav-item'
            }
            onClick={() => onNavigate('library')}
            aria-label="Video Library"
            aria-current={
              activePage === 'library' ? 'page' : undefined
            }
            title="Video Library"
          >
            <span aria-hidden="true">▦</span>
          </button>

          {/* Workspace navigation */}
          <button
            type="button"
            className={
              activePage === 'workspace'
                ? 'nav-item nav-item-active'
                : 'nav-item'
            }
            onClick={() => onNavigate('workspace')}
            aria-label="Video Workspace"
            aria-current={
              activePage === 'workspace' ? 'page' : undefined
            }
            title="Video Workspace"
          >
            <span aria-hidden="true">▶</span>
          </button>
        </nav>
      </aside>

      {/* Main content region */}
      <div className="app-main-area">
        <header className="app-topbar">
          <div className="breadcrumb">
            <span>My workspace</span>
            <span aria-hidden="true">/</span>
            <strong>VideoMind AI</strong>
          </div>

          <span className="workspace-label">
            AI Learning Studio
          </span>
        </header>

        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  )
}


import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import './AppShell.reference.css'

// The two routes currently implemented in the application.
type Page = 'library' | 'workspace'

// Search and Add Video use existing inputs in App.tsx.
type FocusTarget = 'search' | 'add'

// AppShell is responsible only for shared navigation and layout.
interface AppShellProps {
  children: ReactNode
  activePage: Page
  onNavigate: (page: Page) => void
  onSignOut?: () => void
}

// The backend is not required for styling or navigation.
// Show the correct status instead of claiming mock data is real.
const isMockMode = import.meta.env.VITE_USE_MOCK_API !== 'false'

// Small SVG icons keep the navigation independent of external
// icon libraries and remote image URLs.
type ShellIconName = 'library' | 'play' | 'search' | 'plus'

function ShellIcon({ name }: { name: ShellIconName }) {
  const commonProps = {
    width: 21,
    height: 21,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  }

  if (name === 'library') {
    return (
      <svg {...commonProps}>
        <rect x="5" y="5" width="15" height="15" rx="2" />
        <path d="M3 9V4a1 1 0 0 1 1-1h13" />
        <path d="m11 9 5 3-5 3z" />
      </svg>
    )
  }

  if (name === 'play') {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="12" r="9" />
        <path d="m10 8 6 4-6 4z" />
      </svg>
    )
  }

  if (name === 'search') {
    return (
      <svg {...commonProps}>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </svg>
    )
  }

  return (
    <svg {...commonProps}>
      <path d="M12 4v16M4 12h16" />
    </svg>
  )
}

// Focus the existing library input after navigation.
// There is no second search state or duplicate ingestion form.
function focusLibraryField(target: FocusTarget): void {
  const selector =
    target === 'search' ? '.search-field input' : '#video-url'

  const input = document.querySelector<HTMLInputElement>(
    selector,
  )

  input?.focus()

  // jsdom may not implement scrollIntoView, so only call
  // it when the browser provides the method.
  input?.scrollIntoView?.({
    block: 'center',
    behavior: 'smooth',
  })
}

export function AppShell({
  children,
  activePage,
  onNavigate,
  onSignOut,
}: AppShellProps) {
  // Remember which field should be focused when the user
  // navigates from the workspace back to the library.
  const pendingFocus = useRef<FocusTarget | null>(null)

  const goToLibraryField = useCallback(
    (target: FocusTarget): void => {
      if (activePage === 'library') {
        focusLibraryField(target)
        return
      }

      pendingFocus.current = target
      onNavigate('library')
    },
    [activePage, onNavigate],
  )

  // React has now rendered the library, so its input exists.
  useEffect(() => {
    if (activePage !== 'library') return

    const target = pendingFocus.current
    if (target === null) return

    pendingFocus.current = null
    focusLibraryField(target)
  }, [activePage])

  // The search shortcut is advertised in the header,
  // so it must actually work.
  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'k'
      ) {
        event.preventDefault()
        goToLibraryField('search')
      }
    }

    window.addEventListener('keydown', handleShortcut)

    return () => {
      window.removeEventListener('keydown', handleShortcut)
    }
  }, [goToLibraryField])

  return (
    <div className="app-shell">
      {/* Floating charcoal navigation from the Stitch design. */}
      <aside
        className="app-sidebar"
        aria-label="Main navigation"
      >
        <div
          className="sidebar-brand"
          aria-label="VideoMind AI"
        >
          {/* A local monogram avoids the broken remote
              image found in the Stitch HTML export. */}
          <span className="brand-mark" aria-hidden="true">
            VM
          </span>
          <span className="brand-caption">STUDIO</span>
        </div>

        <nav
          className="sidebar-nav"
          aria-label="Primary"
        >
          <button
            type="button"
            className={
              activePage === 'library'
                ? 'nav-item nav-item-active'
                : 'nav-item'
            }
            aria-label="Video Library"
            aria-current={
              activePage === 'library' ? 'page' : undefined
            }
            title="Video Library"
            onClick={() => onNavigate('library')}
          >
            <ShellIcon name="library" />
          </button>

          <button
            type="button"
            className={
              activePage === 'workspace'
                ? 'nav-item nav-item-active'
                : 'nav-item'
            }
            aria-label="Video Workspace"
            aria-current={
              activePage === 'workspace'
                ? 'page'
                : undefined
            }
            title="Video Workspace"
            onClick={() => onNavigate('workspace')}
          >
            <ShellIcon name="play" />
          </button>

          {/* Transcript and Notes navigation will be
              introduced when those views are implemented.
              We do not display nonfunctional buttons. */}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-footer-label">
            AI
          </span>
        </div>
      </aside>

      <div className="app-main-area">
        {/* Shared top bar for library and video workspace. */}
        <header className="app-topbar">
          <div className="topbar-left">
            <div className="breadcrumb">
              <span>My workspace</span>
              <span
                className="breadcrumb-separator"
                aria-hidden="true"
              >
                /
              </span>
              <strong>VideoMind AI</strong>
            </div>

            <span className="workspace-label">
              <span
                className="workspace-status-dot"
                aria-hidden="true"
              />
              {isMockMode ? 'Demo mode' : 'Backend mode'}
            </span>
          </div>

          <div className="topbar-actions">
            {onSignOut && (
              <button
                type="button"
                className="topbar-search"
                onClick={onSignOut}
              >
                Sign out
              </button>
            )}
            {/* This button focuses the existing library
                search instead of creating duplicate state. */}
            <button
              type="button"
              className="topbar-search"
              aria-label="Search videos"
              title="Search videos"
              onClick={() => goToLibraryField('search')}
            >
              <ShellIcon name="search" />
              <span className="topbar-search-label">
                Search video library...
              </span>
              <kbd className="topbar-keyboard-hint">
                ⌘K
              </kbd>
            </button>

            {/* This button opens the existing ingestion
                form, including from the video workspace. */}
            <button
              type="button"
              className="topbar-add"
              onClick={() => goToLibraryField('add')}
            >
              <ShellIcon name="plus" />
              <span className="topbar-add-label">
                Add video
              </span>
            </button>
          </div>
        </header>

        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  )
}

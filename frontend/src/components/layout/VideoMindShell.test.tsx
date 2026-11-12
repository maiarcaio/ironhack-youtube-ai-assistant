// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { VideoMindShell } from './VideoMindShell'

afterEach(cleanup)

describe('VideoMindShell brand mark', () => {
  it('only exposes the demo badge in mock mode', () => {
    vi.stubEnv('VITE_USE_MOCK_API', 'false')
    const props = { activePage: 'library' as const, onNavigate: vi.fn(), onAddVideo: vi.fn(), onSearch: vi.fn() }
    const { unmount } = render(<VideoMindShell {...props}><p>Content</p></VideoMindShell>)
    expect(screen.queryByText('Backend mode')).toBeNull()
    expect(screen.queryByText('Demo mode')).toBeNull()
    unmount()

    vi.stubEnv('VITE_USE_MOCK_API', 'true')
    render(<VideoMindShell {...props}><p>Content</p></VideoMindShell>)
    expect(screen.getByText('Demo mode')).toBeTruthy()
  })

  it('uses the shared brand image and keeps home navigation working', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()

    render(
      <VideoMindShell
        activePage="workspace"
        onNavigate={onNavigate}
        onAddVideo={vi.fn()}
        onSearch={vi.fn()}
      >
        <p>Workspace content</p>
      </VideoMindShell>,
    )

    const home = screen.getByRole('button', { name: 'Video Library' })
    const mark = home.querySelector<HTMLImageElement>(
      'img[src="/videomind-logo.png"]',
    )

    expect(mark).toBeTruthy()
    expect(home.textContent).not.toContain('VM')

    await user.click(home)
    expect(onNavigate).toHaveBeenCalledWith('library')
  })
})

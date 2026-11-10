
// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App'
import { NotesProvider } from './features/notes/NotesProvider'

// Shared test state. vi.hoisted makes it available inside
// Vitest's mocked modules before imports are evaluated.
const mocks = vi.hoisted(() => ({
  videoCount: 0,
  seekCalls: vi.fn(),
  playerReady: true,
  onPlayerReadyChange: null as ((ready: boolean) => void) | null,
}))

// Simulate the video API without contacting FastAPI.
// Each submitted video gets a distinct internal ID.
vi.mock('./services/api', () => ({
  videoApi: {
    ingestVideo: vi.fn(async () => {
      mocks.videoCount += 1

      return {
        video_id: `test-video-${mocks.videoCount}`,
        status: 'queued',
      }
    }),

    getVideoStatus: vi.fn(async (videoId: string) => ({
      video_id: videoId,
      status: 'ready',
      title:
        videoId === 'test-video-1'
          ? 'Video One'
          : 'Video Two',
      error: null,
    })),

    listVideos: vi.fn(async () => ({
      videos: [],
    })),
  },
}))

// Replace the real YouTube player with a controllable player.
// It records both the source URL and requested timestamp.
vi.mock('./components/player/YouTubePlayer', async () => {
  const React = await import('react')

  interface FakePlayerProps {
    sourceUrl: string
    title: string
    onReadyChange?: (ready: boolean) => void
  }

  interface FakePlayerHandle {
    seekTo(seconds: number): boolean
  }

  return {
    YouTubePlayer: React.forwardRef<
      FakePlayerHandle,
      FakePlayerProps
    >(function FakePlayer({ sourceUrl, title, onReadyChange }, ref) {
      mocks.onPlayerReadyChange = onReadyChange ?? null

      React.useEffect(() => {
        if (mocks.playerReady) {
          onReadyChange?.(true)
        }
      }, [onReadyChange])

      React.useImperativeHandle(
        ref,
        () => ({
          seekTo(seconds: number): boolean {
            if (
              !mocks.playerReady ||
              document.querySelector<HTMLElement>(
                '.vm-workspace-mounted',
              )?.hidden
            ) {
              return false
            }
            mocks.seekCalls({ sourceUrl, seconds })
            return true
          },
        }),
        [sourceUrl],
      )

      return (
        <div data-testid="test-youtube-player">
          {title}
          <button
            type="button"
            onClick={() => {
              mocks.playerReady = true
              mocks.onPlayerReadyChange?.(true)
            }}
          >
            Mark player ready
          </button>
        </div>
      )
    }),
  }
})

// Simulate source-citation clicks through ChatPanel's public
// onSeek prop. No artificial RAG answer is generated.
vi.mock('./components/chat/ChatPanel', () => ({
  ChatPanel: ({
    onSeek,
  }: {
    onSeek?: (seconds: number) => void
  }) => (
    <section aria-label="Video Q&A">
      <button type="button" onClick={() => onSeek?.(155)}>
        Jump to 02:35
      </button>

      <button type="button" onClick={() => onSeek?.(-10)}>
        Invalid negative timestamp
      </button>

      <button type="button" onClick={() => onSeek?.(Number.NaN)}>
        Invalid NaN timestamp
      </button>

      <button type="button" onClick={() => onSeek?.(Infinity)}>
        Invalid infinite timestamp
      </button>
    </section>
  ),
}))

vi.mock('./components/layout/SupplementalViews', () => ({
  SearchableTranscriptView: ({
    onSeek,
  }: {
    onSeek?: (seconds: number) => void
  }) => (
    <section aria-label="Searchable transcript">
      <button type="button" onClick={() => onSeek?.(85)}>
        Jump to transcript timestamp
      </button>
    </section>
  ),
  SettingsView: () => <section aria-label="Settings" />,
}))

beforeEach(() => {
  mocks.videoCount = 0
  mocks.seekCalls.mockClear()
  mocks.playerReady = true
  mocks.onPlayerReadyChange = null
})

afterEach(() => {
  cleanup()
})

function renderApp() {
  return render(
    <NotesProvider owner={{ kind: 'mock' }}>
      <App />
    </NotesProvider>,
  )
}

// Use the real application's video submission form.
async function addVideo(url: string) {
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Add video' }))

  const urlInput = screen.getByRole('textbox', {
    name: 'YouTube URL',
  })

  await user.clear(urlInput)
  await user.type(urlInput, url)

  await user.click(
    screen.getByRole('button', {
      name: /Add to library/i,
    }),
  )

  return user
}

describe('App citation-to-player navigation', () => {
  it('seeks to the timestamp selected in chat', async () => {
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Jump to 02:35',
      }),
    )

    expect(mocks.seekCalls).toHaveBeenCalledExactlyOnceWith({
      sourceUrl: 'https://youtu.be/jfKfPfyJRdk',
      seconds: 155,
    })
  })

  it('rejects invalid source timestamps', async () => {
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Invalid negative timestamp',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Invalid NaN timestamp',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Invalid infinite timestamp',
      }),
    )

    expect(mocks.seekCalls).not.toHaveBeenCalled()
  })

  it('seeks only in the currently selected video', async () => {
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )

    // First citation seeks inside the first video.
    await user.click(
      screen.getByRole('button', {
        name: 'Jump to 02:35',
      }),
    )

    await user.click(
      screen.getByRole('button', {
        name: /Back to library/i,
      }),
    )

    // Add a different YouTube video to the library.
    await addVideo(
      'https://youtu.be/dQw4w9WgXcQ',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video Two/i,
      }),
    )

    // The next citation must target the second video,
    // not the previous player's instance.
    await user.click(
      screen.getByRole('button', {
        name: 'Jump to 02:35',
      }),
    )

    expect(mocks.seekCalls).toHaveBeenCalledTimes(2)

    expect(mocks.seekCalls).toHaveBeenNthCalledWith(1, {
      sourceUrl: 'https://youtu.be/jfKfPfyJRdk',
      seconds: 155,
    })

    expect(mocks.seekCalls).toHaveBeenNthCalledWith(2, {
      sourceUrl: 'https://youtu.be/dQw4w9WgXcQ',
      seconds: 155,
    })
  })

  it('opens the current video and seeks from a transcript timestamp', async () => {
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )

    await user.click(screen.getByRole('button', {
      name: 'Searchable Transcript',
    }))

    await user.click(screen.getByRole('button', {
      name: 'Jump to transcript timestamp',
    }))

    expect(screen.getByRole('region', {
      name: 'Video workspace',
    })).toBeTruthy()
    await waitFor(() => {
      expect(mocks.seekCalls).toHaveBeenCalledExactlyOnceWith({
        sourceUrl: 'https://youtu.be/jfKfPfyJRdk',
        seconds: 85,
      })
    })
  })

  it('queues a transcript seek until the workspace becomes visible', async () => {
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )

    await user.click(screen.getByRole('button', {
      name: 'Searchable Transcript',
    }))
    await user.click(screen.getByRole('button', {
      name: 'Jump to transcript timestamp',
    }))

    await waitFor(() => {
      expect(mocks.seekCalls).toHaveBeenCalledExactlyOnceWith({
        sourceUrl: 'https://youtu.be/jfKfPfyJRdk',
        seconds: 85,
      })
    })
  })

  it('waits for the current player before seeking a transcript timestamp', async () => {
    mocks.playerReady = false
    renderApp()

    const user = await addVideo(
      'https://youtu.be/jfKfPfyJRdk',
    )

    await user.click(
      await screen.findByRole('button', {
        name: /Video One/i,
      }),
    )
    await user.click(screen.getByRole('button', {
      name: 'Searchable Transcript',
    }))
    await user.click(screen.getByRole('button', {
      name: 'Jump to transcript timestamp',
    }))

    expect(mocks.seekCalls).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', {
      name: 'Mark player ready',
    }))

    expect(mocks.seekCalls).toHaveBeenCalledExactlyOnceWith({
      sourceUrl: 'https://youtu.be/jfKfPfyJRdk',
      seconds: 85,
    })
  })
})

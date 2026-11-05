
// @vitest-environment jsdom

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  cleanup,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

import userEvent from '@testing-library/user-event'

import App from './App'

// Replace API calls with controlled responses.
// These tests do not contact the real FastAPI backend.
vi.mock('./services/api', () => ({
  videoApi: {
    ingestVideo: vi.fn(async () => ({
      video_id: 'test-video-1',
      status: 'queued',
    })),

    getVideoStatus: vi.fn(async () => ({
      video_id: 'test-video-1',
      status: 'ready',
      title: 'Integration Test Video',
      error: null,
    })),

    listVideos: vi.fn(async () => ({
      videos: [],
    })),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Add a video using the same form as a real user.
async function addTestVideo() {
  const user = userEvent.setup()

  await user.type(
    screen.getByRole('textbox', {
      name: 'YouTube URL',
    }),
    'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  )

  await user.click(
    screen.getByRole('button', {
      name: /Add to library/i,
    }),
  )

  // Wait for the simulated ingestion and status response.
  await screen.findByRole('button', {
    name: /Integration Test Video/i,
  })

  return user
}

describe('VideoMind workspace integration', () => {
  it('preserves navigation between library and workspace', async () => {
    render(<App />)

    const user = await addTestVideo()

    await user.click(
      screen.getByRole('button', {
        name: /Integration Test Video/i,
      }),
    )

    expect(
      screen.getByRole('region', {
        name: 'Video workspace',
      }),
    ).toBeTruthy()

    expect(
      screen.getByRole('region', {
        name: 'Video Q&A',
      }),
    ).toBeTruthy()

    await user.click(
      screen.getByRole('button', {
        name: /Back to library/i,
      }),
    )

    expect(
      screen.getByRole('heading', {
        name: /Your video library/i,
      }),
    ).toBeTruthy()

    // The hidden workspace should not be exposed as active UI.
    expect(
      screen.queryByRole('region', {
        name: 'Video Q&A',
      }),
    ).toBeNull()

    await user.click(
      screen.getByRole('button', {
        name: /Integration Test Video/i,
      }),
    )

    expect(
      screen.getByRole('region', {
        name: 'Video Q&A',
      }),
    ).toBeTruthy()
  })

  it('does not enable real chat for a mock video', async () => {
    render(<App />)

    const user = await addTestVideo()

    await user.click(
      screen.getByRole('button', {
        name: /Integration Test Video/i,
      }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(
          /not been verified as indexed by the real RAG backend/i,
        ),
      ).toBeTruthy()
    })

    expect(
      screen.getByRole('button', {
        name: 'Send question',
      }).hasAttribute('disabled'),
    ).toBe(true)

    expect(
      screen.getByText(
        /Chat is unavailable until this video has been indexed/i,
      ),
    ).toBeTruthy()
  })
})

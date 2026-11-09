
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

import type { ChatApi } from '../../services/api/httpChatApi'
import type {
  ChatRequest,
  ChatResponse,
} from '../../types/chat'

import { ChatPanel } from './ChatPanel'

// Prevent DOM elements from leaking between tests.
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Return a contract-valid response for the given video.
function makeResponse(
  videoId: string,
  answer = 'A grounded answer from the backend.',
): ChatResponse {
  return {
    video_id: videoId,
    thread_id: `thread-${videoId}`,
    answer,
    sources: [
      {
        chunk_id: `chunk-${videoId}`,
        excerpt: 'Evidence provided by the backend.',
        start_seconds: null,
        end_seconds: null,
        source_type: 'transcript',
      },
    ],
    insufficient_evidence: false,
    model_used: null,
  }
}

// Create an API substitute for interaction tests.
// No real network requests or AI calls are made.
function makeApi(
  handler: (request: ChatRequest) => Promise<ChatResponse>,
): ChatApi {
  return {
    sendMessage: vi.fn(handler),
  }
}

describe('ChatPanel', () => {
  it('requires a selected video', () => {
    const api = makeApi(async () => makeResponse('unused'))

    render(
      <ChatPanel
        videoId={null}
        isReadyForChat={false}
        api={api}
      />,
    )

    expect(
      screen.getByText(
        'Select a video to start a conversation.',
      ),
    ).toBeTruthy()

    expect(
      screen.getByRole('button', {
        name: 'Send question',
      }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('blocks questions for an unavailable video', () => {
    const api = makeApi(async () => makeResponse('video-a'))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat={false}
        api={api}
      />,
    )

    expect(
      screen.getByText(/not yet|has been indexed/i),
    ).toBeTruthy()

    expect(
      screen.getByRole('textbox', {
        name: 'Your question',
      }).hasAttribute('disabled'),
    ).toBe(true)

    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  it('sends a question and displays its actual answer', async () => {
    const user = userEvent.setup()
    const api = makeApi(
      async () => makeResponse('video-a'),
    )

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Your question',
      }),
      'What does the speaker explain?',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Send question',
      }),
    )

    expect(
      await screen.findByText(
        'A grounded answer from the backend.',
      ),
    ).toBeTruthy()

    expect(
      screen.getByText(
        'Evidence provided by the backend.',
      ),
    ).toBeTruthy()

    expect(api.sendMessage).toHaveBeenCalledWith({
      video_id: 'video-a',
      message: 'What does the speaker explain?',
      thread_id: null,
      analysis_mode: 'auto',
    })
  })

  it('reuses the thread ID for follow-up questions', async () => {
    const user = userEvent.setup()
    const api = makeApi(
      async () => makeResponse('video-a'),
    )

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    const input = screen.getByRole('textbox', {
      name: 'Your question',
    })

    const send = screen.getByRole('button', {
      name: 'Send question',
    })

    await user.type(input, 'First question')
    await user.click(send)

    await screen.findByText('A grounded answer from the backend.')

    await user.type(input, 'Follow-up question')
    await user.click(send)

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledTimes(2)
    })

    expect(api.sendMessage).toHaveBeenLastCalledWith({
      video_id: 'video-a',
      message: 'Follow-up question',
      thread_id: 'thread-video-a',
      analysis_mode: 'auto',
    })
  })

  it('shows API errors without inventing an answer', async () => {
    const user = userEvent.setup()

    const api = makeApi(async () => {
      throw new Error('Chat request failed (503)')
    })

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Your question',
      }),
      'Explain this video.',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Send question',
      }),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveProperty(
      'textContent',
      'Chat request failed (503)',
    )

    expect(
      screen.queryByLabelText('VideoMind AI message'),
    ).toBeNull()
  })

  it('keeps a late answer with its original video', async () => {
    const user = userEvent.setup()

    // The first request stays pending while the user switches videos.
    let resolveVideoA!: (value: ChatResponse) => void

    const videoARequest = new Promise<ChatResponse>((resolve) => {
      resolveVideoA = resolve
    })

    const api = makeApi(async (request) => {
      if (request.video_id === 'video-a') {
        return videoARequest
      }

      return makeResponse(
        'video-b',
        'Answer belonging to video B.',
      )
    })

    const { rerender } = render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Your question',
      }),
      'Question for A',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Send question',
      }),
    )

    // Switch videos before the first request finishes.
    rerender(
      <ChatPanel
        videoId="video-b"
        isReadyForChat
        api={api}
      />,
    )

    expect(
      screen.queryByText('Question for A'),
    ).toBeNull()

    await user.type(
      screen.getByRole('textbox', {
        name: 'Your question',
      }),
      'Question for B',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Send question',
      }),
    )

    expect(
      await screen.findByText(
        'Answer belonging to video B.',
      ),
    ).toBeTruthy()

    // Finish video A's delayed request.
    resolveVideoA(
      makeResponse('video-a', 'Answer belonging to video A.'),
    )

    await waitFor(() => {
      expect(
        screen.queryByText('Answer belonging to video A.'),
      ).toBeNull()
    })

    // Returning to video A reveals its own answer.
    rerender(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    expect(
      await screen.findByText(
        'Answer belonging to video A.',
      ),
    ).toBeTruthy()

    expect(
      screen.queryByText('Answer belonging to video B.'),
    ).toBeNull()
  })

  it('displays an insufficient-evidence warning', async () => {
    const user = userEvent.setup()

    const api = makeApi(async () => ({
      ...makeResponse('video-a'),
      answer: 'The video does not provide enough information.',
      sources: [],
      insufficient_evidence: true,
    }))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    await user.type(
      screen.getByRole('textbox', {
        name: 'Your question',
      }),
      'Does this video discuss quantum computing?',
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Send question',
      }),
    )

    expect(
      await screen.findByText('Insufficient evidence'),
    ).toBeTruthy()
  })
})

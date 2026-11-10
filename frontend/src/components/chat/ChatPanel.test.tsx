
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
  within,
} from '@testing-library/react'

import userEvent from '@testing-library/user-event'

import type { ChatApi } from '../../services/api/httpChatApi'
import type {
  ChatRequest,
  ChatResponse,
} from '../../types/chat'
import type { StreamCallbacks } from '../../services/api/videomindBackend'

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
  it('keeps an in-flight stream empty until its first token arrives', async () => {
    const user = userEvent.setup()
    let callbacks!: StreamCallbacks
    const stream = vi.fn(async (
      _request: ChatRequest,
      next: StreamCallbacks,
    ) => {
      callbacks = next
      await new Promise<void>(() => undefined)
    })
    const api = makeApi(async () => makeResponse('video-a'))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
        stream={stream}
      />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'What is the answer?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(screen.queryByText('No answer was returned by the API.')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Streaming answer')

    callbacks.onToken?.('First ')
    callbacks.onToken?.('answer.')
    expect(await screen.findByText('First answer.')).toBeTruthy()
    expect(screen.queryByText('No answer was returned by the API.')).toBeNull()

    callbacks.onSources?.([{
      chunk_id: 'stream-citation',
      excerpt: 'Streamed evidence',
      start_seconds: 12,
      end_seconds: 18,
      source_type: 'transcript',
    }])
    expect(await screen.findByText('Streamed evidence')).toBeTruthy()

    callbacks.onDone?.({
      thread_id: 'thread-video-a',
      answer: 'Authoritative final answer.',
      model_used: null,
      insufficient_evidence: false,
    })
    expect(await screen.findByText('Authoritative final answer.')).toBeTruthy()
  })

  it('shows an empty fallback only after successful empty completion', async () => {
    const user = userEvent.setup()
    let callbacks!: StreamCallbacks
    const stream = vi.fn(async (
      _request: ChatRequest,
      next: StreamCallbacks,
    ) => {
      callbacks = next
      await new Promise<void>(() => undefined)
    })
    const api = makeApi(async () => makeResponse('video-a'))

    render(<ChatPanel videoId="video-a" isReadyForChat api={api} stream={stream} />)
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Empty?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    expect(screen.queryByText('No answer was returned by the API.')).toBeNull()

    callbacks.onDone?.({
      thread_id: 'thread-video-a',
      answer: '',
      model_used: null,
      insufficient_evidence: false,
    })
    expect(await screen.findByText('No answer was returned by the API.')).toBeTruthy()
  })

  it('preserves partial text and reports terminal stream errors', async () => {
    const user = userEvent.setup()
    let callbacks!: StreamCallbacks
    let rejectStream!: (error: Error) => void
    const stream = vi.fn((_request: ChatRequest, next: StreamCallbacks) => {
      callbacks = next
      return new Promise<void>((_resolve, reject) => {
        rejectStream = reject
      })
    })
    const api = makeApi(async () => makeResponse('video-a'))

    render(<ChatPanel videoId="video-a" isReadyForChat api={api} stream={stream} />)
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Fail?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))
    callbacks.onToken?.('Partial answer')
    rejectStream(new Error('Stream interrupted'))

    expect(await screen.findByText('Partial answer')).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toContain('Stream interrupted')
    expect(screen.queryByText('No answer was returned by the API.')).toBeNull()
  })

  it('keeps streaming answers isolated when switching videos', async () => {
    const user = userEvent.setup()
    const callbacksByVideo = new Map<string, StreamCallbacks>()
    const stream = vi.fn(async (
      request: ChatRequest,
      next: StreamCallbacks,
    ) => {
      callbacksByVideo.set(request.video_id, next)
      await new Promise<void>(() => undefined)
    })
    const api = makeApi(async () => makeResponse('unused'))
    const view = render(
      <ChatPanel videoId="video-a" isReadyForChat api={api} stream={stream} />,
    )

    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Question A')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    view.rerender(<ChatPanel videoId="video-b" isReadyForChat api={api} stream={stream} />)
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), 'Question B')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    callbacksByVideo.get('video-b')?.onToken?.('Answer B')
    expect(await screen.findByText('Answer B')).toBeTruthy()
    callbacksByVideo.get('video-a')?.onToken?.('Answer A')
    expect(screen.queryByText('Answer A')).toBeNull()

    view.rerender(<ChatPanel videoId="video-a" isReadyForChat api={api} stream={stream} />)
    expect(await screen.findByText('Answer A')).toBeTruthy()
    expect(screen.queryByText('Answer B')).toBeNull()
  })

  it('presents Terra and Sol as structured analysis choices', () => {
    const api = makeApi(async () => makeResponse('video-a'))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    const terra = screen.getByRole('button', {
      name: /Terra Quick answers/i,
    })
    const sol = screen.getByRole('button', {
      name: /Sol Deep Analysis/i,
    })

    expect(terra.getAttribute('aria-pressed')).toBe('true')
    expect(sol.getAttribute('aria-pressed')).toBe('false')
    expect(within(terra).getByText('Terra')).toBeTruthy()
    expect(within(terra).getByText('Quick answers')).toBeTruthy()
    expect(within(sol).getByText('Sol')).toBeTruthy()
    expect(within(sol).getByText('Deep Analysis')).toBeTruthy()
    expect(terra.querySelector('svg')).toBeTruthy()
    expect(sol.querySelector('svg')).toBeTruthy()
  })

  it('sends deep analysis after selecting Sol', async () => {
    const user = userEvent.setup()
    const api = makeApi(async () => makeResponse('video-a'))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat
        api={api}
      />,
    )

    await user.click(screen.getByRole('button', {
      name: /Sol Deep Analysis/i,
    }))
    await user.type(screen.getByRole('textbox', {
      name: 'Your question',
    }), 'Compare the main ideas.')
    await user.click(screen.getByRole('button', {
      name: 'Send question',
    }))

    await waitFor(() => {
      expect(api.sendMessage).toHaveBeenCalledWith({
        video_id: 'video-a',
        message: 'Compare the main ideas.',
        thread_id: null,
        analysis_mode: 'deep',
      })
    })
  })

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

  it('keeps analysis selection interactive while chat is unavailable', async () => {
    const user = userEvent.setup()
    const api = makeApi(async () => makeResponse('video-a'))

    render(
      <ChatPanel
        videoId="video-a"
        isReadyForChat={false}
        api={api}
      />,
    )

    const terra = screen.getByRole('button', {
      name: /Terra Quick answers/i,
    })
    const sol = screen.getByRole('button', {
      name: /Sol Deep Analysis/i,
    })

    expect(terra.hasAttribute('disabled')).toBe(false)
    expect(sol.hasAttribute('disabled')).toBe(false)
    expect(terra.getAttribute('aria-pressed')).toBe('true')

    await user.click(sol)
    expect(sol.getAttribute('aria-pressed')).toBe('true')
    expect(terra.getAttribute('aria-pressed')).toBe('false')

    terra.focus()
    await user.keyboard('{Enter}')
    expect(terra.getAttribute('aria-pressed')).toBe('true')
    expect(sol.getAttribute('aria-pressed')).toBe('false')

    expect(screen.getByRole('button', {
      name: 'Send question',
    }).hasAttribute('disabled')).toBe(true)
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

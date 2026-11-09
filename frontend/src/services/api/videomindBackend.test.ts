
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  askVideoQuestion,
  streamVideoQuestion,
  uploadTranscript,
} from './videomindBackend'


// Restore the original fetch implementation after each test.
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})


// Create a simulated HTTP response containing JSON.
function jsonResponse(
  data: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}


// Create an SSE response split into independent network chunks.
// This simulates how real HTTP streaming delivers partial data.
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }

      controller.close()
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  })
}


describe('VideoMind backend API client', () => {
  it('uploads a transcript using multipart form data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        video_id: 'video-123',
        status: 'completed',
        chunks_count: 3,
      }, 201),
    )

    vi.stubGlobal('fetch', fetchMock)

    const file = new File(
      ['1\n00:00:01,000 --> 00:00:03,000\nHello world.'],
      'transcript.srt',
      { type: 'text/plain' },
    )

    const result = await uploadTranscript(
      'video-123',
      file,
    )

    expect(result.chunks_count).toBe(3)

    const [url, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ]

    expect(url).toContain('/api/v1/transcripts/upload')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)

    const form = options.body as FormData

    expect(form.get('video_id')).toBe('video-123')
    expect((form.get('file') as File).name)
      .toBe('transcript.srt')

    // The browser must generate the multipart Content-Type.
    expect(options.headers).toBeUndefined()
  })


  it('rejects an unsupported file before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const file = new File(
      ['not a transcript'],
      'document.pdf',
    )

    await expect(
      uploadTranscript('video-123', file),
    ).rejects.toThrow(/TXT, SRT, or VTT/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('adds a bearer token to transcript fallback uploads', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        video_id: 'backend-uuid',
        status: 'completed',
        chunks_count: 1,
      }, 201),
    )
    vi.stubGlobal('fetch', fetchMock)

    await uploadTranscript(
      'backend-uuid',
      new File(['Transcript'], 'transcript.txt'),
      undefined,
      async () => 'fresh-jwt',
    )

    expect(fetchMock.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer fresh-jwt',
    })
  })


  it('reports backend upload errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          detail: 'Missing PINECONE_API_KEY.',
        }, 500),
      ),
    )

    const file = new File(
      ['Transcript content'],
      'transcript.txt',
    )

    await expect(
      uploadTranscript('video-123', file),
    ).rejects.toThrow('Missing PINECONE_API_KEY.')
  })


  it('receives a complete grounded chat response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          video_id: 'video-123',
          thread_id: 'thread-abc',
          answer: 'The video explains embeddings.',
          sources: [
            {
              chunk_id: 'chunk-001',
              excerpt: 'Embeddings represent text.',
              start_seconds: 85,
              end_seconds: 92,
              source_type: 'transcript',
            },
          ],
          insufficient_evidence: false,
          model_used: 'test-model',
        }),
      ),
    )

    const result = await askVideoQuestion({
      video_id: 'video-123',
      message: 'What are embeddings?',
    })

    expect(result.answer).toContain('embeddings')
    expect(result.sources[0].start_seconds).toBe(85)
    expect(result.thread_id).toBe('thread-abc')
  })


  it('parses streaming events across network chunks', async () => {
    const events = [
      'event: meta\ndata: {"video_id":"video-123","thread_id":"thread-abc"}\n\n',
      'event: token\ndata: {"text":"Hello "}\n\n',
      'event: token\ndata: {"text":"world."}\n\n',
      'event: sources\ndata: {"sources":[{"chunk_id":"chunk-001","excerpt":"Evidence","start_seconds":85,"end_seconds":92,"source_type":"transcript"}]}\n\n',
      'event: done\ndata: {"thread_id":"thread-abc","answer":"Hello world.","model_used":"test-model","insufficient_evidence":false}\n\n',
    ].join('')

    // Divide the event stream at arbitrary character offsets.
    const chunks = [
      events.slice(0, 11),
      events.slice(11, 67),
      events.slice(67, 142),
      events.slice(142, 260),
      events.slice(260),
    ]

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(chunks),
      ),
    )

    const tokens: string[] = []
    const sourceTimes: number[] = []
    let completedAnswer = ''
    let receivedThread = ''

    await streamVideoQuestion(
      {
        video_id: 'video-123',
        message: 'Summarize the video.',
      },
      {
        onMeta(meta) {
          receivedThread = meta.thread_id
        },
        onToken(text) {
          tokens.push(text)
        },
        onSources(sources) {
          for (const source of sources) {
            if (source.start_seconds !== null) {
              sourceTimes.push(source.start_seconds)
            }
          }
        },
        onDone(result) {
          completedAnswer = result.answer
        },
      },
    )

    expect(receivedThread).toBe('thread-abc')
    expect(tokens).toEqual(['Hello ', 'world.'])
    expect(sourceTimes).toEqual([85])
    expect(completedAnswer).toBe('Hello world.')
  })


  it('rejects a stream that ends without completion', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: token\ndata: {"text":"Partial"}\n\n',
        ]),
      ),
    )

    await expect(
      streamVideoQuestion(
        {
          video_id: 'video-123',
          message: 'Explain this.',
        },
        {},
      ),
    ).rejects.toThrow(/ended before completion/)
  })

  it('adds a bearer token to streaming chat requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'event: done\ndata: {"thread_id":"thread-abc","answer":"Done","insufficient_evidence":false}\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    await streamVideoQuestion(
      { video_id: 'backend-uuid', message: 'Summarize this.' },
      {},
      undefined,
      async () => 'fresh-jwt',
    )

    expect(fetchMock.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({
        Authorization: 'Bearer fresh-jwt',
      }),
    )
  })


  it('surfaces a backend SSE error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'event: error\ndata: {"message":"Unable to complete the streamed response."}\n\n',
        ]),
      ),
    )

    await expect(
      streamVideoQuestion(
        {
          video_id: 'video-123',
          message: 'Explain this.',
        },
        {},
      ),
    ).rejects.toThrow(
      'Unable to complete the streamed response.',
    )
  })
})

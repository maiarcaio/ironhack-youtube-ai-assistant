import { describe, expect, it } from 'vitest'

import { parseTranscript } from './transcriptParser'

describe('parseTranscript', () => {
  it('parses every valid SRT cue with its timestamps', () => {
    const segments = parseTranscript(`1
00:00:01,000 --> 00:00:03,500
First cue.

2
00:01:04,250 --> 00:01:07,000
Second cue.`, 'srt')

    expect(segments).toEqual([
      {
        id: 'segment-0',
        text: 'First cue.',
        startSeconds: 1,
        endSeconds: 3.5,
      },
      {
        id: 'segment-1',
        text: 'Second cue.',
        startSeconds: 64.25,
        endSeconds: 67,
      },
    ])
  })

  it('parses WebVTT cues and removes presentation tags', () => {
    const segments = parseTranscript(`WEBVTT

chapter-one
00:02.000 --> 00:05.000 align:start
<i>Visible transcript text</i>`, 'vtt')

    expect(segments).toEqual([{
      id: 'segment-0',
      text: 'Visible transcript text',
      startSeconds: 2,
      endSeconds: 5,
    }])
  })

  it('preserves complete TXT content without inventing timestamps', () => {
    const segments = parseTranscript(
      'First paragraph.\n\nSecond paragraph.',
      'txt',
    )

    expect(segments).toEqual([{
      id: 'segment-0',
      text: 'First paragraph.\n\nSecond paragraph.',
      startSeconds: null,
      endSeconds: null,
    }])
  })

  it('ignores invalid cues and empty content', () => {
    expect(parseTranscript(`1
not-a-time --> 00:00:05,000
Invalid cue.`, 'srt')).toEqual([])
    expect(parseTranscript('   ', 'txt')).toEqual([])
  })
})

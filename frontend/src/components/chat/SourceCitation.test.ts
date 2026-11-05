
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { ChatSource } from '../../types/chat'
import { SourceCitation } from './SourceCitation'

// Reusable evidence fixture with no timestamp.
const exampleSource: ChatSource = {
  chunk_id: 'chunk-123',
  excerpt: 'The model retrieves relevant transcript passages.',
  start_seconds: null,
  end_seconds: null,
  source_type: 'transcript',
}

describe('SourceCitation', () => {
  it('renders the actual evidence excerpt', () => {
    const html = renderToStaticMarkup(
      createElement(SourceCitation, {
        source: exampleSource,
      }),
    )

    expect(html).toContain(
      'The model retrieves relevant transcript passages.',
    )
    expect(html).toContain('chunk-123')
  })

  it('does not invent timestamps or seek controls', () => {
    const html = renderToStaticMarkup(
      createElement(SourceCitation, {
        source: exampleSource,
      }),
    )

    expect(html).toContain('Timestamp unavailable')
    expect(html).not.toContain('<button')
  })

  it('shows a verified timestamp without a player callback', () => {
    const html = renderToStaticMarkup(
      createElement(SourceCitation, {
        source: {
          ...exampleSource,
          start_seconds: 522,
        },
      }),
    )

    expect(html).toContain('08:42')
    expect(html).not.toContain('<button')
  })

  it('enables seeking when the player callback exists', () => {
    const html = renderToStaticMarkup(
      createElement(SourceCitation, {
        source: {
          ...exampleSource,
          start_seconds: 0,
        },
        onSeek: () => {},
      }),
    )

    expect(html).toContain('<button')
    expect(html).toContain('00:00')
  })

  it('escapes HTML contained in an evidence excerpt', () => {
    const html = renderToStaticMarkup(
      createElement(SourceCitation, {
        source: {
          ...exampleSource,
          excerpt: '<script>alert("test")</script>',
        },
      }),
    )

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

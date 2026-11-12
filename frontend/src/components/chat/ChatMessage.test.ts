
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  ChatMessage,
  type ConversationMessage,
} from './ChatMessage'

// Create a real shape matching our assistant message type.
const assistantMessage: ConversationMessage = {
  id: 'assistant-1',
  role: 'assistant',
  text: 'Retrieval finds relevant evidence before answering.',
  insufficient_evidence: false,
  sources: [
    {
      chunk_id: 'chunk-101',
      excerpt: 'The relevant context is retrieved first.',
      start_seconds: 522,
      end_seconds: 540,
      source_type: 'transcript',
    },
  ],
}

describe('ChatMessage', () => {
  it('renders a user question', () => {
    const message: ConversationMessage = {
      id: 'user-1',
      role: 'user',
      text: 'What is RAG?',
    }

    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message }),
    )

    expect(html).toContain('What is RAG?')
    expect(html).toContain('You')
    expect(html).not.toContain('Evidence from this video')
  })

  it('renders an assistant answer', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMessage, {
        message: assistantMessage,
      }),
    )

    expect(html).toContain('VideoMind AI')
    expect(html).toContain(
      'Retrieval finds relevant evidence before answering.',
    )
  })

  it('renders basic assistant Markdown as semantic text formatting', () => {
    const message: ConversationMessage = {
      ...assistantMessage,
      text: '**Main insight:**\n\nFirst paragraph.\nSecond line with *emphasis*.',
      sources: [],
    }

    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message }),
    )

    expect(html).toContain('<strong>Main insight:</strong>')
    expect(html).toContain('<p>First paragraph.<br/>Second line with <em>emphasis</em>.</p>')
    expect(html).not.toContain('**Main insight:**')
  })

  it('keeps incomplete streamed emphasis readable', () => {
    const message: ConversationMessage = {
      ...assistantMessage,
      text: '**Main insight',
      sources: [],
    }

    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message }),
    )

    expect(html).toContain('**Main insight')
    expect(html).not.toContain('<strong>')
  })

  it('renders source evidence using SourceCitation', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMessage, {
        message: assistantMessage,
      }),
    )

    expect(html).toContain('Evidence from this video')
    expect(html).toContain(
      'The relevant context is retrieved first.',
    )
    expect(html).toContain('08:42')
  })

  it('removes verified chunk markers from answer prose while preserving unresolved markers', () => {
    const html = renderToStaticMarkup(createElement(ChatMessage, { message: {
      ...assistantMessage,
      text: 'Verified point [Chunks 0101–0101]. Unresolved [Chunks 0999–1000].',
    } }))
    expect(html).not.toContain('[Chunks 0101–0101]')
    expect(html).toContain('[Chunks 0999–1000]')
  })

  it('clearly identifies insufficient evidence', () => {
    const message: ConversationMessage = {
      ...assistantMessage,
      text: 'The available transcript does not answer this.',
      sources: [],
      insufficient_evidence: true,
    }

    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message }),
    )

    expect(html).toContain('Insufficient evidence')
    expect(html).not.toContain('Evidence from this video')
  })

  it('escapes HTML in an assistant answer', () => {
    const message: ConversationMessage = {
      ...assistantMessage,
      text: '<script>alert("test")</script>',
      sources: [],
    }

    const html = renderToStaticMarkup(
      createElement(ChatMessage, { message }),
    )

    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})

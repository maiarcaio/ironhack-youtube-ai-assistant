// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Video } from '../../types/video'
import { VideoLibraryView } from './VideoLibraryView'

const video: Video = {
  id: 'video-1',
  source_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
  title: 'Indexed lecture',
  thumbnail_url: null,
  status: 'ready',
}

function renderLibrary() {
  return render(
    <VideoLibraryView
      videos={[video]}
      selectedVideoId={video.id}
      isMockMode={false}
      onSelectVideo={vi.fn()}
      onOpenAddVideo={vi.fn()}
      onOpenAudioUpload={vi.fn()}
      collection="active"
      onCollectionChange={vi.fn()}
      onManageVideo={vi.fn(async () => undefined)}
    />,
  )
}

describe('VideoLibraryView production presentation', () => {
  it('removes the internal processing explanation while retaining status and actions', () => {
    renderLibrary()

    expect(screen.queryByText('Processing model')).toBeNull()
    expect(screen.queryByText('Backend-grounded study')).toBeNull()
    expect(screen.getByText('Ready to explore')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })
})

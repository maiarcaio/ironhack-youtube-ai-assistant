
import type { Video } from '../../types/video'

// The information that the parent component passes to VideoCard.
interface VideoCardProps {
  video: Video
  isSelected: boolean
  onSelect: (videoId: string) => void
}

// A reusable component representing one video in the library.
export function VideoCard({
  video,
  isSelected,
  onSelect,
}: VideoCardProps) {
  return (
    <article className="video-card">
      <button
        type="button"
        className="video-card-button"
        onClick={() => onSelect(video.id)}
        aria-pressed={isSelected}
      >
        {video.thumbnail_url && (
          <img
            src={video.thumbnail_url}
            alt=""
            className="video-thumbnail"
          />
        )}

        <div className="video-card-content">
          <h3>{video.title}</h3>

          <p>
            Status: <strong>{video.status}</strong>
          </p>

          {video.status === 'failed' && video.error && (
            <p role="alert">{video.error}</p>
          )}
        </div>
      </button>
    </article>
  )
}

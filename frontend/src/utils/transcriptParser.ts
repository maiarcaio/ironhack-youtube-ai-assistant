export interface TranscriptSegment {
  id: string
  text: string
  startSeconds: number | null
  endSeconds: number | null
}

function parseTimestamp(value: string): number | null {
  const parts = value.trim().replace(',', '.').split(':').map(Number)

  if (parts.length !== 2 && parts.length !== 3) return null
  if (parts.some((part) => !Number.isFinite(part))) return null

  const [hours, minutes, seconds] = parts.length === 3
    ? parts
    : [0, parts[0], parts[1]]

  if (
    hours < 0 ||
    minutes < 0 ||
    minutes >= 60 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds
}

export function parseTranscript(
  content: string,
  format: 'txt' | 'srt' | 'vtt',
): TranscriptSegment[] {
  const normalized = content
    .replace(/\r\n?/g, '\n')
    .replace(/^\uFEFF/, '')
    .trim()

  if (!normalized) return []

  if (format === 'txt') {
    return [{
      id: 'segment-0',
      text: normalized,
      startSeconds: null,
      endSeconds: null,
    }]
  }

  const segments: TranscriptSegment[] = []

  for (const block of normalized.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex === -1) continue

    const [startValue, endWithSettings, ...extraTiming] =
      lines[timingIndex].split('-->')
    if (!startValue || !endWithSettings || extraTiming.length > 0) continue

    const startSeconds = parseTimestamp(startValue)
    const endSeconds = parseTimestamp(
      endWithSettings.trim().split(/\s+/)[0],
    )
    if (
      startSeconds === null ||
      endSeconds === null ||
      endSeconds <= startSeconds
    ) {
      continue
    }

    const text = lines
      .slice(timingIndex + 1)
      .join(' ')
      .replace(/<[^>]*>/g, '')
      .trim()
    if (!text) continue

    segments.push({
      id: `segment-${segments.length}`,
      text,
      startSeconds,
      endSeconds,
    })
  }

  return segments
}

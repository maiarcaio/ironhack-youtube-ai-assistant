export const MAX_AUDIO_UPLOAD_BYTES = 24_000_000

const audioExtensions = new Set([
  'mp3',
  'wav',
  'm4a',
])

function extensionOf(filename: string): string {
  const separator = filename.lastIndexOf('.')

  return separator >= 0
    ? filename.slice(separator + 1).toLowerCase()
    : ''
}

export function validateAudioUploadFile(file: File): void {
  if (!audioExtensions.has(extensionOf(file.name))) {
    throw new Error('Choose an MP3, WAV, or M4A audio file.')
  }

  if (file.size === 0) {
    throw new Error('The selected audio file is empty.')
  }

  if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
    throw new Error('Audio files must be 24 MB or smaller.')
  }
}

export function isUploadedAudioSource(sourceUrl: string): boolean {
  return sourceUrl.startsWith('storage://') &&
    audioExtensions.has(extensionOf(sourceUrl))
}

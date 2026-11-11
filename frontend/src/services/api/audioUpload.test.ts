import { describe, expect, it } from 'vitest'

import { validateAudioUploadFile } from './audioUpload'

function audioFile(name: string, size = 4): File {
  return new File([new Uint8Array(size)], name, {
    type: 'audio/mpeg',
  })
}

describe('audio upload validation', () => {
  it.each(['lecture.mp3', 'lecture.wav', 'lecture.m4a'])(
    'accepts %s',
    (name) => {
      expect(validateAudioUploadFile(audioFile(name))).toBeUndefined()
    },
  )

  it('rejects empty audio files', () => {
    expect(() => validateAudioUploadFile(audioFile('empty.mp3', 0))).toThrow(
      'The selected audio file is empty.',
    )
  })

  it('rejects unsupported file extensions', () => {
    expect(() => validateAudioUploadFile(audioFile('lecture.ogg'))).toThrow(
      'Choose an MP3, WAV, or M4A audio file.',
    )
  })

  it('rejects files larger than 24 MB', () => {
    const oversized = {
      name: 'lecture.mp3',
      size: 24_000_001,
    } as File

    expect(() => validateAudioUploadFile(oversized)).toThrow(
      'Audio files must be 24 MB or smaller.',
    )
  })
})

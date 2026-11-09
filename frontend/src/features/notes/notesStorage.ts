export type NotesOwner =
  | { kind: 'mock' }
  | { kind: 'user'; userId: string }
  | null

export interface VideoNote {
  id: string
  videoId: string
  videoTitle: string
  title: string
  content: string
  tag: string
  seconds: number
  createdAt: string
  updatedAt: string
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type NotesLoadResult =
  | {
      status: 'disabled'
      key: null
      notes: []
    }
  | {
      status: 'ready'
      key: string
      notes: VideoNote[]
    }
  | {
      status: 'recovery'
      key: string
      notes: []
      raw: string
      error: string
    }

export function getNotesStorageKey(
  owner: NotesOwner,
): string | null {
  if (!owner) return null

  return owner.kind === 'mock'
    ? 'videomind.notes.v1.mock'
    : `videomind.notes.v1.user.${owner.userId}`
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isVideoNote(value: unknown): value is VideoNote {
  if (!value || typeof value !== 'object') return false

  const note = value as Record<string, unknown>

  return isNonEmptyString(note.id) &&
    isNonEmptyString(note.videoId) &&
    isNonEmptyString(note.videoTitle) &&
    isNonEmptyString(note.title) &&
    isNonEmptyString(note.content) &&
    isNonEmptyString(note.tag) &&
    typeof note.seconds === 'number' &&
    Number.isFinite(note.seconds) &&
    note.seconds >= 0 &&
    isNonEmptyString(note.createdAt) &&
    isNonEmptyString(note.updatedAt)
}

export function loadNotes(
  owner: NotesOwner,
  storage: StorageLike = window.localStorage,
): NotesLoadResult {
  const key = getNotesStorageKey(owner)

  if (!key) {
    return { status: 'disabled', key: null, notes: [] }
  }

  let raw: string | null = null

  try {
    raw = storage.getItem(key)

    if (raw === null) {
      return { status: 'ready', key, notes: [] }
    }

    const parsed: unknown = JSON.parse(raw)

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Notes storage is not an object.')
    }

    const envelope = parsed as Record<string, unknown>

    if (envelope.version !== 1) {
      throw new Error('Notes storage uses an unsupported version.')
    }

    if (
      !Array.isArray(envelope.notes) ||
      !envelope.notes.every(isVideoNote)
    ) {
      throw new Error('Notes storage contains invalid records.')
    }

    return {
      status: 'ready',
      key,
      notes: envelope.notes,
    }
  } catch (caughtError) {
    return {
      status: 'recovery',
      key,
      notes: [],
      raw: raw ?? '',
      error: caughtError instanceof Error
        ? caughtError.message
        : 'Notes storage could not be read.',
    }
  }
}

export function persistNotes(
  owner: NotesOwner,
  notes: VideoNote[],
  storage: StorageLike = window.localStorage,
): void {
  const key = getNotesStorageKey(owner)

  if (!key) {
    throw new Error('Unable to save notes without a resolved owner.')
  }

  if (!notes.every(isVideoNote)) {
    throw new Error('Unable to save notes because a record is invalid.')
  }

  try {
    storage.setItem(key, JSON.stringify({ version: 1, notes }))
  } catch {
    throw new Error(
      'Unable to save notes in this browser. Existing notes were preserved.',
    )
  }
}

export function formatNoteTimestamp(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) && seconds >= 0
    ? Math.floor(seconds)
    : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return `${minutes.toString().padStart(2, '0')}:${remainder
    .toString()
    .padStart(2, '0')}`
}

export function parseNoteTimestamp(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2})$/)

  if (!match) return null

  const minutes = Number(match[1])
  const seconds = Number(match[2])

  if (!Number.isSafeInteger(minutes) || seconds < 0 || seconds > 59) {
    return null
  }

  return minutes * 60 + seconds
}

export function serializeNotesMarkdown(
  notes: VideoNote[],
  exportedAt = new Date(),
): string {
  const sections = notes.map((note) => [
    `### [${formatNoteTimestamp(note.seconds)}] ${note.title}`,
    `**Source:** ${note.videoTitle}`,
    `*Tag: ${note.tag}*`,
    '',
    note.content,
  ].join('\n'))

  return [
    '# VideoMind Saved Notes',
    '',
    '> These notes are stored only in this browser and are not synchronized.',
    '',
    `Exported: ${exportedAt.toISOString().slice(0, 10)}`,
    '',
    ...sections,
  ].join('\n\n')
}

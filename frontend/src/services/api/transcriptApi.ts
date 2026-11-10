import { supabase } from './supabaseClient'

export interface VideoTranscript {
  video_id: string
  content: string
  format: 'txt' | 'srt' | 'vtt'
  source: 'youtube' | 'upload'
}

export async function getVideoTranscript(
  videoId: string,
): Promise<VideoTranscript | null> {
  if (!videoId.trim()) {
    throw new Error('A video ID is required.')
  }

  if (!supabase) {
    throw new Error('Transcript access is unavailable.')
  }

  const { data, error } = await supabase
    .from('transcripts')
    .select('video_id, content, format, source')
    .eq('video_id', videoId)
    .maybeSingle()

  if (error) {
    throw new Error(`Could not load transcript: ${error.message}`)
  }

  return data as VideoTranscript | null
}


"""Transcribe authorized audio files into SRT subtitles."""

from pathlib import Path

from openai import OpenAI


MAX_AUDIO_BYTES = 25 * 1024 * 1024

SUPPORTED_FORMATS = {
    ".mp3",
    ".mp4",
    ".mpeg",
    ".mpga",
    ".m4a",
    ".wav",
    ".webm",
}


def transcribe_audio_to_srt(
    audio_path: str | Path,
) -> str:
    """Transcribe an authorized audio file using Whisper."""

    path = Path(audio_path)

    if not path.is_file():
        raise ValueError("Audio file not found.")

    if path.suffix.lower() not in SUPPORTED_FORMATS:
        raise ValueError("Unsupported audio format.")

    size = path.stat().st_size

    if size == 0 or size > MAX_AUDIO_BYTES:
        raise ValueError(
            "Audio file must be between 1 byte and 25 MB."
        )

    client = OpenAI()

    with path.open("rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="srt",
        )

    if not isinstance(transcript, str) or not transcript.strip():
        raise RuntimeError("Audio transcription returned no text.")

    return transcript

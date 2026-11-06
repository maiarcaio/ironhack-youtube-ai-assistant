
import re
from dataclasses import dataclass
from pathlib import Path


TIMESTAMP_PATTERN = re.compile(
    r"^(?:(\d+):)?([0-5]\d):([0-5]\d)[,.](\d{3})$"
)


@dataclass(frozen=True)
class TranscriptSegment:
    """A transcript segment with its original timestamps."""

    text: str
    start_seconds: float
    end_seconds: float


def timestamp_to_seconds(timestamp: str) -> float:
    """Convert SRT or VTT timestamps into seconds."""

    match = TIMESTAMP_PATTERN.fullmatch(timestamp.strip())

    if not match:
        raise ValueError(
            f"Invalid subtitle timestamp: {timestamp}"
        )

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    milliseconds = int(match.group(4))

    return (
        hours * 3600
        + minutes * 60
        + seconds
        + milliseconds / 1000
    )


def load_timed_transcript(
    file_path: str,
) -> list[TranscriptSegment]:
    """
    Parse SRT or VTT subtitles while preserving
    the timestamps supplied by the source.
    """

    path = Path(file_path)

    if path.suffix.lower() not in {".srt", ".vtt"}:
        raise ValueError("Only SRT and VTT files are supported.")

    content = path.read_text(encoding="utf-8-sig")

    content = (
        content.replace("\r\n", "\n")
        .replace("\r", "\n")
    )

    blocks = re.split(r"\n\s*\n", content)

    segments = []

    for block in blocks:
        lines = [
            line.strip()
            for line in block.splitlines()
            if line.strip()
        ]

        if not lines:
            continue

        if lines[0].startswith("WEBVTT"):
            lines = lines[1:]

        if not lines or lines[0].startswith(
            ("NOTE", "STYLE", "REGION")
        ):
            continue

        timestamp_index = next(
            (
                index
                for index, line in enumerate(lines)
                if "-->" in line
            ),
            None,
        )

        if timestamp_index is None:
            continue

        timestamp_line = lines[timestamp_index]

        start_raw, end_raw = timestamp_line.split(
            "-->", maxsplit=1
        )

        # VTT may include cue settings after the timestamp.
        end_raw = end_raw.strip().split()[0]

        start_seconds = timestamp_to_seconds(start_raw)
        end_seconds = timestamp_to_seconds(end_raw)

        if end_seconds <= start_seconds:
            raise ValueError(
                "Subtitle end time must be after start time."
            )

        text_lines = lines[timestamp_index + 1:]

        if not text_lines:
            continue

        text = " ".join(text_lines).strip()

        if text:
            segments.append(
                TranscriptSegment(
                    text=text,
                    start_seconds=start_seconds,
                    end_seconds=end_seconds,
                )
            )

    if not segments:
        raise ValueError(
            "No valid subtitle segments were found."
        )

    return segments

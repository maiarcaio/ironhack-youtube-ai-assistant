
from pathlib import Path


def load_transcript(file_path: str) -> str:
    """
    Load a transcript from a text file.
    """

    path = Path(file_path)

    text = path.read_text(encoding="utf-8")

    if not text.strip():
        raise ValueError("Transcript is empty.")

    return text

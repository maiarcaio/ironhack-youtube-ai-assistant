from langchain_text_splitters import RecursiveCharacterTextSplitter


def split_transcript(text: str) -> list[str]:
    """
    Split a video transcript into smaller text chunks.
    """

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=250,
        chunk_overlap=40,
        length_function=len
    )

    chunks = splitter.split_text(text)

    return chunks

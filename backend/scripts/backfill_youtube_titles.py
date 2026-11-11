"""Dry-run by default: replace generic titles for existing YouTube videos.

From backend/:
    python scripts/backfill_youtube_titles.py
    python scripts/backfill_youtube_titles.py --apply
"""

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

from app.services.ingestion.youtube_metadata import fetch_youtube_title
from app.services.persistence.supabase_client import get_supabase_admin_client


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Persist changes (dry-run by default)")
    args = parser.parse_args()

    client = get_supabase_admin_client()
    response = (
        client.table("videos")
        .select("video_id,owner_id,youtube_video_id,title")
        .eq("source_type", "youtube")
        .eq("title", "YouTube video")
        .execute()
    )

    updated = 0
    missing = 0
    cache = {}

    for row in response.data or []:
        youtube_id = row.get("youtube_video_id")
        if not youtube_id:
            missing += 1
            continue

        if youtube_id not in cache:
            cache[youtube_id] = fetch_youtube_title(youtube_id)
        title = cache[youtube_id]

        if not title:
            missing += 1
            continue

        print(f'{row["video_id"]}: {title}')
        if args.apply:
            result = (
                client.table("videos")
                .update({"title": title})
                .eq("video_id", row["video_id"])
                .eq("owner_id", row["owner_id"])
                .eq("source_type", "youtube")
                .eq("title", "YouTube video")
                .execute()
            )
            if not result.data:
                raise RuntimeError(f'Could not update {row["video_id"]}')
        updated += 1

    print(f'{"UPDATED" if args.apply else "ELIGIBLE"}: {updated}; UNAVAILABLE: {missing}')
    if not args.apply:
        print("DRY RUN ONLY — no database records were modified.")


if __name__ == "__main__":
    main()


"""Run the VideoMind AI background ingestion worker."""

import argparse
import logging
import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.services.ingestion.worker import process_next_job


logger = logging.getLogger("videomind.worker")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Process pending VideoMind ingestion jobs."
    )

    parser.add_argument(
        "--once",
        action="store_true",
        help="Check the queue once and exit.",
    )

    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds (default: 5).",
    )

    args = parser.parse_args()

    if args.interval < 1:
        parser.error("--interval must be at least 1 second.")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    logger.info("VideoMind ingestion worker started.")

    try:
        while True:
            try:
                result = process_next_job()

                if result is not None:
                    logger.info(
                        "Video %s: %s",
                        result["video_id"],
                        result["status"],
                    )

            except Exception:
                logger.exception("Worker cycle failed.")

                if args.once:
                    return 1

            if args.once:
                return 0

            time.sleep(args.interval)

    except KeyboardInterrupt:
        logger.info("Worker stopped by user.")
        return 0


if __name__ == "__main__":
    sys.exit(main())

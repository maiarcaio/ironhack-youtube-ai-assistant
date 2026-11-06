
import os

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from supabase import Client, create_client


ENV_PATH = Path(__file__).resolve().parents[3] / ".env"

load_dotenv(ENV_PATH)


@lru_cache(maxsize=1)
def get_supabase_admin_client() -> Client:
    """
    Create a privileged Supabase client for backend use.

    This client bypasses Row Level Security.
    Never expose it to the frontend or use it
    before validating user authorization.
    """

    url = os.getenv("SUPABASE_URL", "").strip()
    secret_key = os.getenv(
        "SUPABASE_SECRET_KEY", ""
    ).strip()

    if not url or not secret_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SECRET_KEY "
            "must be configured."
        )

    if not url.startswith("https://"):
        raise RuntimeError(
            "SUPABASE_URL must use HTTPS."
        )

    return create_client(
        supabase_url=url,
        supabase_key=secret_key,
    )

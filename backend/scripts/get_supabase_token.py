
"""Get a Supabase user access token for local testing."""

import os
import getpass
import subprocess
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client


load_dotenv(Path(__file__).resolve().parents[1] / ".env")

supabase_url = os.environ["SUPABASE_URL"]
supabase_key = os.environ["SUPABASE_PUBLISHABLE_KEY"]

email = input("User email: ").strip()
password = getpass.getpass("Password: ")

client = create_client(supabase_url, supabase_key)

response = client.auth.sign_in_with_password({
    "email": email,
    "password": password,
})

if not response.session:
    raise RuntimeError("Authentication failed.")

token = response.session.access_token

subprocess.run(
    ["clip.exe"],
    input=token,
    text=True,
    check=True,
)

print("Access token copied to clipboard successfully!")

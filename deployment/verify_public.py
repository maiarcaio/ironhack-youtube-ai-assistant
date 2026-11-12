"""Read-only deployment smoke checks for the public VideoMind endpoints.

Runs without credentials and never sends POST, DELETE, uploads or AI requests.
"""

from __future__ import annotations

import argparse
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def check(url: str, method: str, headers: dict[str, str], timeout: float):
    request = Request(url, method=method, headers=headers)
    with urlopen(request, timeout=timeout) as response:
        return response.status, response.headers


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only VideoMind deployment checks")
    parser.add_argument("--frontend", default="https://videomind-ai-ironhack.vercel.app")
    parser.add_argument("--backend", default="https://videomind-ai-backend.onrender.com")
    parser.add_argument("--timeout", type=float, default=30.0)
    args = parser.parse_args()

    if args.timeout <= 0:
        parser.error("--timeout must be positive")

    frontend = args.frontend.rstrip("/")
    backend = args.backend.rstrip("/")

    try:
        health, _ = check(backend + "/health", "GET", {}, args.timeout)
        print(f"Backend /health: HTTP {health}")
        if health != 200:
            return 1

        index, _ = check(frontend + "/", "GET", {}, args.timeout)
        print(f"Frontend root: HTTP {index}")
        if index != 200:
            return 1

        headers = {
            "Origin": frontend,
            "Access-Control-Request-Method": "DELETE",
            "Access-Control-Request-Headers": "authorization,content-type",
        }
        status, reply = check(
            backend + "/api/v1/videos/preflight-check-only",
            "OPTIONS", headers, args.timeout,
        )
        origin = reply.get("Access-Control-Allow-Origin", "")
        methods = {part.strip().upper() for part in
                   reply.get("Access-Control-Allow-Methods", "").split(",")}
        permitted_headers = {
            part.strip().lower()
            for part in reply.get("Access-Control-Allow-Headers", "").split(",")
        }
        print(f"DELETE preflight: HTTP {status}")
        ok = (status == 200 and origin == frontend and "DELETE" in methods
              and {"authorization", "content-type"} <= permitted_headers)
        print("Production-origin CORS: " + ("PASS" if ok else "FAIL"))
        return 0 if ok else 1
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        print(f"Smoke check failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

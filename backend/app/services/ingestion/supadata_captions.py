"""Optional YouTube caption provider when hosting IPs are blocked.

Only source captions by default (mode=native). No generated transcription
costs are triggered. SUPADATA_API_KEY is never sent to the browser.
"""

import os
import time
from types import SimpleNamespace

import httpx

BASE_URL = "https://api.supadata.ai/v1/transcript"


def get_supadata_captions(youtube_video_id: str) -> list[SimpleNamespace]:
    key = os.getenv("SUPADATA_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Automatic captions blocked; configure SUPADATA_API_KEY or upload SRT.")

    headers = {"x-api-key": key}
    mode = os.getenv("SUPADATA_TRANSCRIPT_MODE", "native").strip().lower()
    if mode not in {"native", "auto"}:
        raise RuntimeError("Invalid SUPADATA_TRANSCRIPT_MODE (native/auto).")
    params = {
        "url": f"https://www.youtube.com/watch?v={youtube_video_id}",
        "mode": mode, "text": "false",
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.get(BASE_URL, headers=headers, params=params)
        response.raise_for_status()
        payload = response.json()
        if response.status_code == 202:
            job_id = payload.get("jobId")
            if not isinstance(job_id, str) or not job_id:
                raise RuntimeError("Caption provider did not return a valid job ID.")
            for _ in range(12):
                time.sleep(3)
                response = client.get(f"{BASE_URL}/{job_id}", headers=headers)
                response.raise_for_status()
                payload = response.json()
                if payload.get("status") == "failed":
                    raise RuntimeError("Caption provider failed to retrieve this transcript.")
                if payload.get("status") == "completed":
                    break
            else:
                raise RuntimeError("Caption provider is still processing this video.")

    items = payload.get("content")
    if not isinstance(items, list):
        raise RuntimeError("Caption provider returned no timed transcript.")
    captions = []
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            text = str(item["text"])
            offset = float(item["offset"])
            duration = float(item["duration"])
        except (KeyError, ValueError, TypeError):
            continue
        if offset < 0 or duration <= 0 or not text.strip():
            continue
        captions.append(SimpleNamespace(
            text=text, start=offset / 1000, duration=duration / 1000,
        ))
    if not captions:
        raise RuntimeError("Caption provider returned no usable timed captions.")
    return captions

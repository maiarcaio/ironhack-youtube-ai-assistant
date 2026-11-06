
"""Authentication dependencies for protected API endpoints."""

from uuid import UUID

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPAuthorizationCredentials,
    HTTPBearer,
)
from supabase_auth.errors import AuthError

from app.services.persistence.supabase_client import (
    get_supabase_admin_client,
)


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        bearer_scheme
    ),
) -> str:
    """Verify a Supabase access token and return the user ID."""

    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid authentication is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None or not credentials.credentials.strip():
        raise unauthorized

    try:
        client = get_supabase_admin_client()

        response = client.auth.get_user(
            credentials.credentials
        )

    except AuthError as exc:
        raise unauthorized from exc

    except (httpx.RequestError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        ) from exc

    if response is None or response.user is None:
        raise unauthorized

    try:
        return str(UUID(str(response.user.id)))
    except (ValueError, TypeError) as exc:
        raise unauthorized from exc

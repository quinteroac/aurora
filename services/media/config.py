from __future__ import annotations

import os


def resolve_port(value: str | None = None) -> int:
    raw_port = value if value is not None else os.getenv("PORT")
    if raw_port is None:
        return 8000

    try:
        port = int(raw_port)
    except ValueError as error:
        raise ValueError("PORT must be an integer") from error

    if port < 1 or port > 65_535:
        raise ValueError("PORT must be between 1 and 65535")

    return port

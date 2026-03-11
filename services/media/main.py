from __future__ import annotations

import os

from fastapi import FastAPI

app = FastAPI(title="Aurora Media Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "media"}


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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=resolve_port(), reload=True)

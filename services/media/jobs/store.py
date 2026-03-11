from __future__ import annotations

import threading
from typing import Any


class JobStore:
    """Thread-safe in-memory job store.

    Uses threading.Lock because FastAPI BackgroundTasks executes in a threadpool,
    not the async event loop — asyncio.Lock is not safe across OS threads.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict[str, Any]] = {}

    def create(self, job_id: str, initial: dict[str, Any]) -> None:
        with self._lock:
            self._jobs[job_id] = dict(initial)

    def update(self, job_id: str, **fields: Any) -> None:
        with self._lock:
            self._jobs[job_id].update(fields)

    def fetch(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            entry = self._jobs.get(job_id)
            return dict(entry) if entry is not None else None

    def __contains__(self, job_id: object) -> bool:
        with self._lock:
            return job_id in self._jobs

    def clear(self) -> None:
        with self._lock:
            self._jobs.clear()


store: JobStore = JobStore()

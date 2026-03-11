#!/usr/bin/env bash
set -euo pipefail

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done

  wait >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

start_service() {
  local name="$1"
  shift

  echo "[$name] starting"

  (
    "$@" 2>&1 | sed -u "s/^/[$name] /"
  ) &

  pids+=("$!")
}

start_service backend bun run --cwd apps/backend dev
start_service frontend bun run --cwd apps/frontend dev
start_service media bun run --cwd services/media dev

wait

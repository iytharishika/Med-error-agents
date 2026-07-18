#!/usr/bin/env bash
# Convenience launcher for the Kapsule backend.
set -e
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env — add your ANTHROPIC_API_KEY, then re-run."
fi
python -m pip install -r requirements.txt -q
exec uvicorn app.main:app --reload --port "${PORT:-8000}"

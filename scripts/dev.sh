#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d /workspace ]; then
  NAILFORM_VENV="${NAILFORM_VENV:-/workspace/.venvs/nailform}"
  export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
else
  NAILFORM_VENV="${NAILFORM_VENV:-$PROJECT_ROOT/.venv}"
fi
umask 077
if [ ! -x "$NAILFORM_VENV/bin/python" ]; then
  printf 'Run bash scripts/install.sh first.\n' >&2
  exit 1
fi

cd "$PROJECT_ROOT"
"$NAILFORM_VENV/bin/python" -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 &
NAILFORM_API_PID=$!
NAILFORM_WEB_PID=''
cleanup() {
  if [ -n "$NAILFORM_WEB_PID" ]; then kill "$NAILFORM_WEB_PID" 2>/dev/null || true; fi
  kill "$NAILFORM_API_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$NAILFORM_VENV/bin/python" - <<'PY'
import json, time, urllib.request
for attempt in range(45):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=1) as response:
            data = json.load(response)
            if data.get('status') == 'ok' and data.get('cad_available'):
                break
    except (OSError, ValueError):
        pass
    time.sleep(1)
else:
    raise SystemExit('API readiness failed; inspect startup output above.')
print('API and CAD ready. Starting frontend on port 5173.')
PY

cd "$PROJECT_ROOT/frontend"
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort &
NAILFORM_WEB_PID=$!
wait -n "$NAILFORM_API_PID" "$NAILFORM_WEB_PID"

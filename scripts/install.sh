#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -d /workspace ]; then
  NAILFORM_VENV="${NAILFORM_VENV:-/workspace/.venvs/nailform}"
  export UV_CACHE_DIR="${UV_CACHE_DIR:-/workspace/.cache/uv}"
  export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/workspace/.cache}"
  export npm_config_cache="${npm_config_cache:-/workspace/.cache/npm}"
else
  NAILFORM_VENV="${NAILFORM_VENV:-$PROJECT_ROOT/.venv}"
fi

command -v uv >/dev/null
command -v node >/dev/null
command -v npm >/dev/null
node -e 'if(Number(process.versions.node.split(".")[0]) < 22) throw Error("Node.js 22 or later is required")'
if [ ! -x "$NAILFORM_VENV/bin/python" ]; then
  uv venv --python python3.12 "$NAILFORM_VENV"
fi
if [ -f "$PROJECT_ROOT/backend/requirements.lock" ]; then
  uv pip sync --python "$NAILFORM_VENV/bin/python" --require-hashes "$PROJECT_ROOT/backend/requirements.lock"
else
  uv pip install --python "$NAILFORM_VENV/bin/python" -r "$PROJECT_ROOT/backend/requirements.txt"
fi
npm ci --prefix "$PROJECT_ROOT/frontend" --no-audit --no-fund
"$NAILFORM_VENV/bin/python" -c 'import cadquery, cv2, fastapi; print("Python dependencies available")'
printf 'Installed. Start with: bash %s/scripts/dev.sh\n' "$PROJECT_ROOT"

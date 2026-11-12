#!/usr/bin/env bash
# Our Free Model gateway autostart launcher (POSIX: Linux + macOS).
# Idempotent: exits silently when the gateway is already answering on the port.
# Created/installed by bin/setup.mjs of the free-model-bridge repo.
#
# Usage:   ./start/gateway-start.sh
#   env overrides:
#     OFM_REPO_DIR   gateway checkout   (default: $HOME/our-free-model)
#     OFM_PORT       listen port        (default: 18900)
#     OFM_DATA_DIR   data/log dir       (default: ${OFM_HOME:-$HOME/.our-free-model})
#
# Windows users: use start/gateway-start.ps1 instead.
set -uo pipefail

REPO_DIR="${OFM_REPO_DIR:-$HOME/our-free-model}"
PORT="${OFM_PORT:-18900}"
if [ -n "${OFM_DATA_DIR:-}" ]; then
  DATA_DIR="$OFM_DATA_DIR"
elif [ -n "${OFM_HOME:-}" ]; then
  DATA_DIR="$OFM_HOME"
else
  DATA_DIR="$HOME/.our-free-model"
fi

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "node not found on PATH (need >= 22.19)" >&2
  exit 1
fi

mkdir -p "$DATA_DIR"

# Health probe using node itself, so we do not depend on curl/wget being present.
if "$NODE" -e 'fetch("http://127.0.0.1:"+process.argv[1]+"/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' "$PORT"; then
  exit 0
fi

CLI="$REPO_DIR/packages/standalone/cli.mjs"
if [ ! -f "$CLI" ]; then
  echo "gateway entry not found: $CLI" >&2
  echo "set OFM_REPO_DIR to the gateway checkout, or run: node bin/setup.mjs" >&2
  exit 1
fi

cd "$DATA_DIR" || exit 1
nohup "$NODE" "$CLI" --port "$PORT" --no-lan \
  >>"$DATA_DIR/service.out.log" 2>>"$DATA_DIR/service.err.log" &
echo "gateway starting (pid $!) on 127.0.0.1:$PORT"

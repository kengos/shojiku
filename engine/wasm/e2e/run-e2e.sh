#!/bin/sh
# Browser golden path for the WASM bindings: build the image (which builds the
# wasm module), serve it, run Playwright (in Docker), clean up.
# Run from the repository root:  sh engine/wasm/e2e/run-e2e.sh
set -eu

IMAGE=shojiku-wasm-e2e
NAME=shojiku-wasm-e2e-run
PORT="${PORT:-8789}"
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.49.0-noble

docker build -f engine/wasm/e2e/Dockerfile -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "$PORT:80" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

# Wait for the server to answer.
i=0
until curl -fso /dev/null "http://localhost:$PORT/"; do
  i=$((i + 1))
  [ "$i" -ge 30 ] && { echo "server never came up" >&2; exit 1; }
  sleep 1
done

docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL="http://host.docker.internal:$PORT" \
  -v "$PWD/engine/wasm/e2e:/work" -w /work \
  "$PLAYWRIGHT_IMAGE" \
  sh -c 'npm install --no-audit --no-fund >/dev/null 2>&1 && npx playwright test'

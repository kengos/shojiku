#!/bin/sh
# Golden path for the standalone Designer app: build the image (wasm + app +
# assembled data), serve it, run Playwright (in Docker), clean up.
# Run from the repository root:  sh gui/designer-app/e2e/run-e2e.sh
set -eu

# WORK_TAG namespaces the image, the container name and the port: all three are
# GLOBAL to the docker daemon, so with fixed values a second session's run
# retags this image and `docker rm -f`s this container out from under a live
# test — which surfaces as "server never came up", not as a collision.
WORK_TAG="${WORK_TAG:-local}"
IMAGE="shojiku-designer-app-e2e:${WORK_TAG}"
NAME="shojiku-designer-app-e2e-run-${WORK_TAG}"
PORT="${PORT:-8790}"
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.49.0-noble

docker build -f gui/designer-app/Dockerfile -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "$PORT:80" "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

i=0
until curl -fso /dev/null "http://localhost:$PORT/"; do
  i=$((i + 1))
  [ "$i" -ge 30 ] && { echo "server never came up" >&2; exit 1; }
  sleep 1
done

docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL="http://host.docker.internal:$PORT" \
  -v "$PWD/gui/designer-app/e2e:/work" -w /work \
  "$PLAYWRIGHT_IMAGE" \
  sh -c 'npm install --no-audit --no-fund >/dev/null 2>&1 && npx playwright test'

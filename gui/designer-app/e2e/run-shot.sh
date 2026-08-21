#!/bin/sh
# Screenshot the running Designer dev server into `.shots/` (gitignored).
# Run from the repository root, with `make gui:dev` already up in another
# terminal:  sh gui/designer-app/e2e/run-shot.sh
#
# Two traps this wrapper exists to absorb:
#
#   1. Vite refuses a request whose Host header it does not allow, so a
#      container asking for `host.docker.internal:5173` gets 403. An IP literal
#      is always allowed — hence the gateway lookup below.
#   2. The Playwright image has no `ip`/`hostname -I`; `getent ahostsv4` is what
#      resolves the gateway there.
set -eu

PORT="${GUI_DEV_PORT:-5173}"
OUT="${SHOT_OUT:-.shots}"
PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.49.0-noble

mkdir -p "$OUT"
docker run --rm \
  --add-host=host.docker.internal:host-gateway \
  -e PORT="$PORT" \
  -e SHOT_PRESET="${SHOT_PRESET:-}" \
  -e SHOT_ITEM="${SHOT_ITEM:-}" \
  -e SHOT_LOCALE="${SHOT_LOCALE:-}" \
  -e SHOT_SCHEME="${SHOT_SCHEME:-}" \
  -v "$PWD/gui/designer-app/e2e:/work" -v "$PWD/$OUT:/out" -w /work \
  "$PLAYWRIGHT_IMAGE" \
  sh -euc 'HOST=$(getent ahostsv4 host.docker.internal | awk "{print \$1; exit}"); \
    curl -fso /dev/null "http://$HOST:$PORT/" \
      || { echo "no dev server on $PORT — run \`make gui:dev\` first" >&2; exit 1; }; \
    npm install --no-audit --no-fund >/dev/null 2>&1; \
    BASE_URL="http://$HOST:$PORT" node shot.js'

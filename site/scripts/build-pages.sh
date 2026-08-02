#!/usr/bin/env bash
# The Cloudflare Pages build (also `make site-build` locally, inside the
# pinned Node image): pure Node — the wasm engine comes from the COMMITTED
# site/.data/wasm, never a Rust build. Produces site/.vitepress/dist with the
# Designer merged under /designer/.
#
# Pages settings that pair with this script: root directory `site`, build
# command `bash scripts/build-pages.sh`, output directory `.vitepress/dist`,
# NODE_VERSION=24, PNPM_VERSION=11.15.1.
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$SITE/.." && pwd)"

command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@11.15.1

# 1. The designer-app's assemble reads engine/wasm/pkg, which is gitignored —
#    stage the committed copy there (byte-identical by `make site-check`).
mkdir -p "$ROOT/engine/wasm/pkg"
cp "$SITE/.data/wasm/"* "$ROOT/engine/wasm/pkg/"

# 2. Build + assemble the Designer.
cd "$ROOT/gui"
pnpm install --frozen-lockfile
pnpm --filter @shojiku/designer-app build
pnpm --filter @shojiku/designer-app assemble

# 3. Assemble the site's data + build the site.
cd "$SITE"
pnpm install --frozen-lockfile
node scripts/assemble-data.ts
pnpm exec vitepress build

# 3.5 Allow exactly the inline scripts VitePress emitted (site CSP scope).
node scripts/inject-csp-hashes.ts

# 4. The per-page .md endpoints llms.txt links (/why.md, /ja/why.md, …):
#    the source pages ARE the endpoints — stage them beside the HTML.
for f in "$SITE"/*.md; do cp "$f" "$SITE/.vitepress/dist/"; done
mkdir -p "$SITE/.vitepress/dist/ja"
for f in "$SITE"/ja/*.md; do cp "$f" "$SITE/.vitepress/dist/ja/"; done

# 5. Merge the Designer under /designer/. Its own _headers must not ship —
#    the root public/_headers carries BOTH scopes.
rm -rf "$SITE/.vitepress/dist/designer"
cp -R "$ROOT/gui/designer-app/dist" "$SITE/.vitepress/dist/designer"
rm -f "$SITE/.vitepress/dist/designer/_headers"

echo "site-build: dist ready ($(find "$SITE/.vitepress/dist" -type f | wc -l | tr -d ' ') files)"

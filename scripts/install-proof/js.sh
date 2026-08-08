#!/bin/sh
# Install proof, js: the napi addon inside a REAL platform package
# (@shojiku/<platform>-<arch>), npm-installed beside the entry package into a
# clean floor-version container, resolved the way the entry package resolves
# it — createRequire over the platform package's name. See common.sh.
. "$(dirname "$0")/common.sh"

IMG="node:${NODE_VER:-22}-bookworm-slim"
require_artifact "$NAPI_ADDON" napi

case "$(uname -m)" in
  arm64|aarch64) PLATFORM_PKG="@shojiku/linux-arm64-gnu" ;;
  x86_64)        PLATFORM_PKG="@shojiku/linux-x64-gnu" ;;
  *) echo "install-proof: unmapped host architecture $(uname -m)" >&2; exit 1 ;;
esac

PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' "$ROOT/sdk/js/package.json")"

echo "== install proof (js, $IMG, $PLATFORM_PKG) =="

# The entry package's tarball, built the way the release builds it. The
# checkout's node_modules is a forest of symlinks into the gate's pnpm store
# that resolve to nothing outside it — staged, it kills the install with
# ENOTDIR, so it stays behind along with any stale build output.
cp -R "$ROOT/sdk/js" "$WORK/src"
rm -rf "$WORK/src/node_modules" "$WORK/src/dist"
docker run --rm -v "$WORK:/w" -w /w/src "$IMG" sh -euc '
  npm install -g pnpm@'"$PNPM_VERSION"' >/dev/null 2>&1
  pnpm install --ignore-scripts --frozen-lockfile >/dev/null
  pnpm run build >/dev/null
  pnpm pack --pack-destination /w/pkgs >/dev/null'

# The platform package, assembled the way the release assembles it: a
# manifest naming this target plus the addon beside it.
mkdir -p "$WORK/platform"
cp "$NAPI_ADDON" "$WORK/platform/shojiku.node"
cat > "$WORK/platform/package.json" <<JSON
{
  "name": "$PLATFORM_PKG",
  "version": "0.2.0",
  "description": "Shojiku engine addon (install proof build)",
  "files": ["shojiku.node"],
  "license": "MIT"
}
JSON

cat > "$WORK/proof.mjs" <<'MJS'
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Client } from "shojiku";

if (process.env.SHOJIKU_LIBRARY) throw new Error("void: a library was injected");
if (existsSync("/opt/shojiku")) throw new Error("void: an engine exists outside the package");

const client = new Client({
  templates: "/ex",
  fontDirs: ["/packs/fonts"],
  localeDirs: ["/packs/locale"],
});
const params = JSON.parse(readFileSync("/ex/receipt-ja/params.json", "utf8"));
const result = await client.generate("receipt-ja", params);
if (!result.success) {
  console.error(`FAILED: ${result.failure.kind} | ${result.failure.message}`);
  process.exit(1);
}
writeFileSync("/w/out.pdf", result.artifact.bytes);
MJS

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  mkdir /consumer && cd /consumer
  npm init -y >/dev/null
  npm install --no-audit --no-fund /w/pkgs/shojiku-*.tgz /w/platform >/dev/null
  # Run from INSIDE the consumer: ESM resolution walks up from the importing
  # file, so a script left in /w would never see /consumer/node_modules.
  cp /w/proof.mjs proof.mjs
  node proof.mjs'

assert_pdf "$WORK/out.pdf"

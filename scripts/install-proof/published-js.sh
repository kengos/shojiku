#!/bin/sh
# Published-install proof, js: `npm install shojiku` from npmjs.com, which
# must drag in the right `@shojiku/<platform>` through optionalDependencies.
# See published-python.sh for why the registry copy is proved separately.
. "$(dirname "$0")/common.sh"

IMG="node:${NODE_VER:-22}-bookworm-slim"

echo "== published-install proof (js, $IMG) =="

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

docker run --rm -e VER="${SHOJIKU_VERSION:-}" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  mkdir /consumer && cd /consumer
  npm init -y >/dev/null
  npm install --no-audit --no-fund "shojiku${VER:+@$VER}" >/dev/null
  # The optional platform package is the whole point: list what npm actually
  # pulled, because a missing one installs silently and fails at load.
  npm ls --all --depth=1 2>/dev/null | grep -E "shojiku" || true
  cp /w/proof.mjs proof.mjs
  node proof.mjs'

assert_pdf "$WORK/out.pdf"

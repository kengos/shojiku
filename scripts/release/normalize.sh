#!/bin/sh
# Normalize the release-artifacts workflow's download layout into the flat
# per-platform tree assemble.sh reads:
#
#   dist/release/bin/<slug>/{libshojiku_capi.*|shojiku_capi.dll, shojiku[.exe], shojiku.node}
#
#   gh run download <run-id> --dir dist/release/download
#   scripts/release/normalize.sh

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DL="$ROOT/dist/release/download"
BIN="$ROOT/dist/release/bin"

[ -d "$DL" ] || { echo "normalize: $DL is missing — download the run first" >&2; exit 1; }
rm -rf "$BIN"

put() { # slug file
  mkdir -p "$BIN/$1"
  cp "$2" "$BIN/$1/"
}

# linux + windows-mingw capi/cli, from the Docker cross-build job
put linux-x64   "$DL/release-linux-mingw/capi/x86_64-unknown-linux-gnu/libshojiku_capi.so"
put linux-x64   "$DL/release-linux-mingw/cli/x86_64-unknown-linux-gnu/shojiku"
put linux-arm64 "$DL/release-linux-mingw/capi/aarch64-unknown-linux-gnu/libshojiku_capi.so"
put linux-arm64 "$DL/release-linux-mingw/cli/aarch64-unknown-linux-gnu/shojiku"
put win-x64     "$DL/release-linux-mingw/capi/x86_64-pc-windows-gnu/shojiku_capi.dll"
put win-x64     "$DL/release-linux-mingw/cli/x86_64-pc-windows-gnu/shojiku.exe"

# macOS, both targets from the runner job
for pair in "darwin-arm64 aarch64-apple-darwin" "darwin-x64 x86_64-apple-darwin"; do
  slug=${pair% *}; triple=${pair#* }
  put "$slug" "$DL/release-macos/$triple/libshojiku_capi.dylib"
  put "$slug" "$DL/release-macos/$triple/shojiku"
  put "$slug" "$DL/release-macos/$triple/shojiku.node"
done

# napi addons for the non-mac targets
put linux-x64   "$DL/release-napi-linux-x64/shojiku.node"
put linux-arm64 "$DL/release-napi-linux-arm64/shojiku.node"
put win-x64     "$DL/release-napi-windows-x64/shojiku.node"

chmod +x "$BIN"/*/shojiku 2>/dev/null || true

# Also populate the dist/*/local slots from the host-arch platform: the java
# assembly builds the gate image, whose Dockerfile COPYs dist/capi/local/ —
# on a fresh runner nothing has built it, and the release binaries are
# exactly what belongs there.
case "$(uname -m)" in
  arm64|aarch64) HOST=linux-arm64 ;;
  *)             HOST=linux-x64 ;;
esac
mkdir -p "$ROOT/dist/capi/local" "$ROOT/dist/cli/local" "$ROOT/dist/napi/local"
cp "$BIN/$HOST/libshojiku_capi.so" "$ROOT/dist/capi/local/"
cp "$BIN/$HOST/shojiku"            "$ROOT/dist/cli/local/"
cp "$BIN/$HOST/shojiku.node"       "$ROOT/dist/napi/local/"
chmod +x "$ROOT/dist/cli/local/shojiku"

echo "normalized:"
find "$BIN" -type f | sort | sed "s|$ROOT/||"
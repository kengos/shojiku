#!/bin/sh
# Shared plumbing for the per-language install proofs (sourced, not run).
#
# WHAT A PROOF IS. Every SDK gate runs against an INJECTED engine — a library
# or CLI the gate image copied in — so none of them can answer the question a
# release actually poses: can the package reach the engine THROUGH ITS OWN
# PACKAGING? The JVM package shipped unable to load from its own classifier
# jar at 100% line coverage, because its tests exercised an exploded directory
# while the thing that ships is an archive. A proof closes that gap for one
# language: embed the host-arch payload the way the release will, build the
# real package, install it in a CLEAN floor-version container (no injected
# engine, no SHOJIKU_LIBRARY/SHOJIKU_BIN), construct a client, and render a
# bundled example through it. Shape, not platform: the host architecture
# stands in for the whole matrix because HOW a package reaches its payload
# does not vary by target, only the binary does.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CAPI_LIB="$ROOT/dist/capi/local/libshojiku_capi.so"
CLI_BIN="$ROOT/dist/cli/local/shojiku"
NAPI_ADDON="$ROOT/dist/napi/local/shojiku.node"

# A scratch tree per proof, discarded on every exit path. Docker mounts under
# the system temp dir need Docker Desktop's file sharing on macOS; both the
# default /tmp and CI's runner temp are shared out of the box.
#
# Cleanup must not be able to FAIL the proof, and a plain rm can: the
# containers write as root, so on a Linux host the runner user cannot remove
# what they produced (Docker Desktop on macOS maps ownership and hides this).
# Scrub through a container first, fall back to rm, and never let either's
# status become the script's — four green proofs once reported failure over
# nothing but this rm.
WORK="$(mktemp -d)"
scrub() {
  docker run --rm -v "$WORK:/scrub" busybox \
    sh -c 'rm -rf /scrub/* /scrub/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$WORK" >/dev/null 2>&1 || true
}
trap scrub EXIT INT TERM

# THE VERSION A PUBLISHED PROOF ASKS ABOUT. `SHOJIKU_VERSION=x.y.z` pins one;
# otherwise it is the version THIS TREE SHIPS, read from the same
# `[workspace.package]` that `make version:check` treats as the truth.
#
# It used to default to whatever the registry called "latest", and that made a
# bare run a true statement about the WRONG SUBJECT: during the release that
# introduced this, six proofs went green against the previous release and read
# as proof of the new one. Defaulting to the tree's own version instead means a
# bare run fails loudly on a bump — which is the honest answer, because the
# version being shipped genuinely is not published yet. `published-java.sh`
# already behaved this way (with a hardcoded literal, itself a site that went
# stale); this generalizes it and removes the literal.
workspace_version() {
  awk '/^\[workspace\.package\]/{w=1;next} /^\[/{w=0} w && /^version[ \t]*=/{gsub(/[^0-9.]/,"");print;exit}' \
    "$ROOT/engine/Cargo.toml"
}
PROOF_VERSION="${SHOJIKU_VERSION:-$(workspace_version)}"
[ -n "$PROOF_VERSION" ] || {
  echo "install-proof: could not read [workspace.package] version from engine/Cargo.toml" >&2
  exit 1
}

require_artifact() {
  # $1 = path, $2 = the make target that produces it
  [ -e "$1" ] || {
    echo "install-proof: $1 is missing — run \`make $2\` first" >&2
    exit 1
  }
}

# Every proof renders the same bundled example through the same assertion:
# the output begins with the PDF magic and is not trivially small. The
# rendering program itself is per-language; this checks its product.
assert_pdf() {
  # $1 = path to the rendered file
  [ -f "$1" ] || { echo "install-proof: no output was produced" >&2; exit 1; }
  head -c 5 "$1" | grep -q "^%PDF-" || {
    echo "install-proof: output is not a PDF" >&2
    exit 1
  }
  size=$(wc -c < "$1")
  [ "$size" -gt 10000 ] || {
    echo "install-proof: output is implausibly small ($size bytes)" >&2
    exit 1
  }
  echo "install-proof: rendered $size bytes through the packaged engine"
}

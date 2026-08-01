#!/usr/bin/env sh
# Regenerates the committed CycloneDX SBOMs under sbom/ — one per
# dependency-bearing component: engine/ (Cargo.lock), gui/
# (pnpm-lock.yaml), and sdk/js (package lock) once it exists. Runs syft
# through Docker like every other gate (no local toolchain). Regenerate
# whenever a lockfile changes (`make sbom`) and commit the result in the
# same change; output carries timestamps/serial UUIDs, so byte-identity
# across runs is NOT expected and no check gate compares these.
#
# Scope: these are dependency INVENTORIES (purl + version per component,
# for vulnerability tooling and supply-chain transparency). Lockfiles
# carry no license metadata, so per-component license fields are mostly
# absent — license COMPLIANCE is gated separately (`make deny` for the
# engine; bundled font licenses ship in packs/fonts/<pack>/).
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYFT_IMAGE="${SYFT_IMAGE:-anchore/syft:latest}"
OUT_DIR="$REPO_ROOT/sbom"
mkdir -p "$OUT_DIR"

# One component SBOM: $1 = repo-relative source dir, $2 = component name.
generate() {
    src="$1"
    name="$2"
    echo "== sbom: $name ($src) =="
    docker run --rm -v "$REPO_ROOT:/repo:ro" "$SYFT_IMAGE" \
        scan "dir:/repo/$src" \
        --source-name "shojiku-$name" \
        -o cyclonedx-json \
        >"$OUT_DIR/$name.cdx.json"
}

generate engine engine
generate gui gui
# Gate on the LOCKFILE, not on the directory: sdk/js already exists as a
# README-only scaffold, and scanning it would commit an empty inventory.
if [ -f "$REPO_ROOT/sdk/js/pnpm-lock.yaml" ] || [ -f "$REPO_ROOT/sdk/js/package-lock.json" ]; then
    generate sdk/js sdk-js
else
    echo "== sbom: sdk/js has no lockfile yet; skipped =="
fi

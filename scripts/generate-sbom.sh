#!/usr/bin/env sh
# Regenerates the committed CycloneDX SBOMs under sbom/ — one per
# dependency-bearing component that is PUBLISHED. Runs syft through Docker
# like every other gate (no local toolchain). Regenerate whenever a
# lockfile changes (`make sbom`) and commit the result in the same change;
# `make sbom-check` (scripts/check-sbom.sh) then holds the two together.
#
# Scope: these are dependency INVENTORIES (purl + version per component,
# for vulnerability tooling and supply-chain transparency). Lockfiles
# carry no license metadata, so per-component license fields are mostly
# absent — license COMPLIANCE is gated separately (`make deny` for the
# engine; bundled font licenses ship in packs/fonts/<pack>/).
#
# WHY IT SCANS A FILE AND NOT A DIRECTORY. syft's `dir:` scan walks
# everything under the directory, so a tree with a populated
# engine/target/ hands it the lockfile COPIES cargo leaves under
# target/package/, plus the build binaries themselves. Measured on a
# genuinely built checkout (17 lockfile copies under target/): 1757
# components — 1728 library, 24 file, 5 application — and 1054
# `dependencies` entries, where a scan of the lockfile ALONE yields 255
# components (254 crates plus the lockfile's own file component) and 161
# entries. A single planted lockfile copy is enough to double it
# exactly, to 510 and 322; a real tree is far worse. That makes the
# artifact's content depend on what the host last built, which is the one
# property an SBOM may not have. Scanning `file:<lockfile>` is immune by
# construction rather than by an exclusion list that has to keep pace
# with every future build-output directory, and it stamps the lockfile's
# own sha256 into metadata.component, so the SBOM says which input it
# describes.
#
# Output carries a fresh `timestamp` and `serialNumber` on every run, so
# byte-identity across runs is not expected. Those two fields are the
# ONLY ones that move for an unchanged lockfile — everything else,
# bom-refs included, is stable — which is what lets check-sbom.sh compare
# the rest byte-for-byte.
#
# Usage: generate-sbom.sh [OUT_DIR]   write the inventories to OUT_DIR
#        generate-sbom.sh --list      print the lockfile map, one row per line
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYFT_IMAGE="${SYFT_IMAGE:-anchore/syft:v1.46.0}"

# The map: one row per COMMITTED lockfile, "<lockfile> <inventory-name>".
# An inventory name of "-" means deliberately NOT inventoried, and the
# rest of the row is the reason.
#
# check-sbom.sh asserts this set equals the lockfiles git actually tracks,
# so a fifth lockfile cannot arrive and be silently uninventoried — it
# fails the gate until someone writes down which of the two it is.
sbom_map() {
	cat <<'MAP'
engine/Cargo.lock engine
gui/pnpm-lock.yaml gui
sdk/js/pnpm-lock.yaml sdk-js
site/pnpm-lock.yaml - the homepage is not a published package: its dependencies build shojiku.pages.dev and ship in nothing a user installs
MAP
}

if [ "${1:-}" = "--list" ]; then
	sbom_map
	exit 0
fi

OUT_DIR="${1:-$REPO_ROOT/sbom}"
mkdir -p "$OUT_DIR"

# Scans land here first and are moved into place only once they are known
# good. It sits OUTSIDE the repository on purpose: `set -e` aborts the
# moment docker fails, so a cleanup line after the redirect never runs,
# and a scratch file inside sbom/ would survive as an untracked
# 0-byte `.cdx.json.tmp` that `git add -A` would happily commit. (A plain
# `ls sbom/` does not show it, either.)
SCRATCH_DIR=$(mktemp -d)
trap 'rm -rf "$SCRATCH_DIR"' EXIT

# One component SBOM: $1 = repo-relative lockfile, $2 = inventory name.
generate() {
	lock="$1"
	name="$2"
	[ -f "$REPO_ROOT/$lock" ] || {
		echo "generate-sbom: mapped lockfile is missing: $lock" >&2
		exit 1
	}
	echo "== sbom: $name ($lock) =="
	# Write to scratch and move into place. A redirect straight onto the
	# destination truncates it BEFORE docker runs, so an interrupted or
	# failing scan leaves the committed inventory at 0 bytes — and
	# `make sbom` is the command CONTRIBUTING tells people to run after a
	# lockfile moves, so that empty file is one `git add` from shipping.
	scratch="$SCRATCH_DIR/$name.cdx.json"
	docker run --rm -v "$REPO_ROOT:/repo:ro" "$SYFT_IMAGE" \
		scan "file:/repo/$lock" \
		--source-name "shojiku-$name" \
		-o cyclonedx-json \
		>"$scratch"
	[ -s "$scratch" ] || {
		echo "generate-sbom: syft produced nothing for $lock" >&2
		rm -f "$scratch"
		exit 1
	}
	mv "$scratch" "$OUT_DIR/$name.cdx.json"
}

sbom_map | while read -r lock name _rest; do
	if [ "$name" = "-" ]; then
		echo "== sbom: $lock is declared not-inventoried; skipped =="
	else
		generate "$lock" "$name"
	fi
done

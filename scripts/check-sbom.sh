#!/usr/bin/env sh
# Fails if a committed SBOM under sbom/ no longer describes its lockfile,
# or if a lockfile exists that nobody has decided about.
#
# Nothing else in the repo can see either problem. `make engine:deny` reads
# Cargo.toml, the lint and test gates never open sbom/, and the
# inventories are machine-read artifacts a human does not diff — so a
# stale one is invisible until someone downstream trusts it. That makes
# this the class of gate that must not FAIL OPEN: a detector that quietly
# stops detecting prints its success line forever. Hence the self-test
# below, which runs the real comparator over a known-bad fixture and
# asserts an exact hit count before the real tree is touched.
#
# How the comparison works. syft is deterministic for a given lockfile
# and version: two runs over the same input differ in exactly two
# fields, `timestamp` and `serialNumber`, and are byte-identical
# everywhere else, bom-refs included. So this masks those two values and
# compares the rest byte-for-byte — which catches component, version,
# license, cpe and dependency-GRAPH drift alike, none of which a
# name/version comparison would see. The files are MINIFIED (one line
# each), so the mask is a value substitution; a line filter would read
# correct and mask nothing.
#
# SYFT_IMAGE is pinned in the Makefile precisely because this gate exists:
# an unpinned syft would red the gate the day anchore changes a cataloger,
# on a tree nobody touched.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GEN="$REPO_ROOT/scripts/generate-sbom.sh"

# The comparison itself, and the mask it rests on, live in sbom-lib.sh —
# shared with the GENERATOR, which uses the same predicate to decide
# whether to leave a committed inventory alone. The self-test below runs
# the real thing, so a mask that stops masking fails a fixture here rather
# than passing the tree in both scripts at once.
# shellcheck source=scripts/sbom-lib.sh
. "$REPO_ROOT/scripts/sbom-lib.sh"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Prints one `SBOM DRIFT <label>` line and returns 1 when the two files
# differ in anything but the volatile values. Returns 0 in silence
# otherwise.
#
# The emptiness guard is why it EXITS rather than reporting drift when
# something is off about the inputs themselves: a missing or EMPTY input
# would read as "drift", which is the right colour for the wrong reason —
# and it hides two real cases, a typo in a self-test fixture path (the case
# silently stops running while the total still adds up) and a committed
# inventory left at 0 bytes by an interrupted `make sbom:generate`. Two empty files
# even compare EQUAL, so that one could fail open.
#
# The other way this comparison can mean nothing — a mask that has grown
# into a blindfold because a key stopped being unique — is asserted inside
# `sbom_same_ignoring_volatile`, so the generator gets the same protection.
compare_pair() { # <label> <committed> <fresh>
	for f in "$2" "$3"; do
		[ -s "$f" ] || {
			echo "FAIL: $1: $f is missing or empty — the comparison would be meaningless" >&2
			exit 1
		}
	done
	if sbom_same_ignoring_volatile "$1" "$2" "$3"; then
		return 0
	fi
	echo "SBOM DRIFT $1"
	return 1
}

# ---- self-test ---------------------------------------------------------
# Four shapes, one per way this gate can be wrong: a component appearing,
# a version moving, a component RENAMED at the same version, and — the one
# that proves the mask is a mask rather than a blindfold — a pair that
# differs ONLY in the volatile fields.
#
# The rename case earns its place: without it, widening the mask to cover
# `"name"` blinds the gate to same-version renames and the self-test still
# passes. Every fixture differs from base in BOTH volatile fields too, so
# a mask that stops masking makes all four drift rather than only the one.
echo "== sbom self-test =="
st="$tmp/selftest"
mkdir -p "$st"
printf '%s' '{"serialNumber":"urn:uuid:aaa","metadata":{"timestamp":"2020-01-01T00:00:00Z"},"components":[{"name":"a","version":"1.0.0"}]}' >"$st/base.json"
printf '%s' '{"serialNumber":"urn:uuid:bbb","metadata":{"timestamp":"2026-08-09T00:00:00Z"},"components":[{"name":"a","version":"1.0.0"},{"name":"b","version":"2.0.0"}]}' >"$st/added.json"
printf '%s' '{"serialNumber":"urn:uuid:ccc","metadata":{"timestamp":"2026-08-09T00:00:00Z"},"components":[{"name":"a","version":"1.0.1"}]}' >"$st/bumped.json"
printf '%s' '{"serialNumber":"urn:uuid:eee","metadata":{"timestamp":"2026-08-09T00:00:00Z"},"components":[{"name":"a-renamed","version":"1.0.0"}]}' >"$st/renamed.json"
printf '%s' '{"serialNumber":"urn:uuid:ddd","metadata":{"timestamp":"2026-08-09T00:00:00Z"},"components":[{"name":"a","version":"1.0.0"}]}' >"$st/volatile-only.json"

# A fixture path typo would otherwise retire its case in silence: the
# missing file counts as drift, the total still adds up, and the shape
# stops being tested. compare_pair refuses an absent input for this
# reason; this loop names the offender before it gets that far.
for f in base added bumped renamed volatile-only; do
	[ -s "$st/$f.json" ] || {
		echo "FAIL sbom self-test: fixture $f.json was not written" >&2
		exit 1
	}
done

# The drift lines are discarded here on purpose: they are EXPECTED output,
# and scripts/gate-culprits.sh lifts `SBOM DRIFT` lines out of a failed log
# as the culprits. Left visible, a real failure later in this run would be
# reported with two fixture names at the top of the list.
st_hits=0
for case in added bumped renamed volatile-only; do
	if compare_pair "selftest/$case" "$st/base.json" "$st/$case.json" >/dev/null; then
		:
	else
		st_hits=$((st_hits + 1))
	fi
done
if [ "$st_hits" -ne 3 ]; then
	echo "FAIL sbom self-test: the comparator reported $st_hits drifted fixtures in a set with exactly 3" >&2
	echo "  (added, bumped and renamed must drift; volatile-only must not — if that one now drifts the mask" >&2
	echo "   is too narrow, and if any of the other three stopped drifting the mask has grown into a blindfold" >&2
	echo "   or the comparator has stopped comparing)" >&2
	exit 1
fi
echo "self-test ok: 3 of 4 fixtures drift, as expected"

# ---- self-test: the GENERATOR's preservation ---------------------------
# `sbom_place` is what makes `make sbom:generate` idempotent, and it is the one
# place in this pair that WRITES. It therefore has the fail-open shape
# this whole gate exists to prevent: a preserve rule that is too eager
# keeps a stale inventory in the tree, and because the committed file then
# matches nothing that ever changed, the drift check above goes green over
# it forever. So assert the decision AND the bytes, in all three states.
#
# The no-destination case is not padding: check-sbom.sh runs the generator
# into an EMPTY temp dir, so preservation must be inert there. If it ever
# stopped being inert, the comparison above would be fresh-against-fresh —
# a gate comparing a thing to itself, which passes always.
echo "== sbom place self-test =="
pl="$tmp/place"
mkdir -p "$pl"

# volatile-only difference: the committed bytes must SURVIVE.
cp "$st/base.json" "$pl/dest.json"
cp "$st/volatile-only.json" "$pl/fresh.json"
verdict=$(sbom_place "$pl/fresh.json" "$pl/dest.json")
[ "$verdict" = "preserved" ] || {
	echo "FAIL sbom place self-test: volatile-only difference reported '$verdict', not 'preserved'" >&2
	exit 1
}
cmp -s "$pl/dest.json" "$st/base.json" || {
	echo "FAIL sbom place self-test: 'preserved' did not leave the destination bytes intact" >&2
	exit 1
}
if [ -e "$pl/fresh.json" ]; then
	echo "FAIL sbom place self-test: the discarded scan was left behind — an untracked scratch file one 'git add -A' from shipping" >&2
	exit 1
fi

# real difference: the fresh scan must WIN.
cp "$st/base.json" "$pl/dest.json"
cp "$st/added.json" "$pl/fresh.json"
verdict=$(sbom_place "$pl/fresh.json" "$pl/dest.json")
[ "$verdict" = "written" ] || {
	echo "FAIL sbom place self-test: a changed component list reported '$verdict', not 'written' — real drift would be preserved into the tree" >&2
	exit 1
}
cmp -s "$pl/dest.json" "$st/added.json" || {
	echo "FAIL sbom place self-test: 'written' did not install the fresh scan" >&2
	exit 1
}

# no destination: preservation must be inert.
rm -f "$pl/dest.json"
cp "$st/base.json" "$pl/fresh.json"
verdict=$(sbom_place "$pl/fresh.json" "$pl/dest.json")
[ "$verdict" = "written" ] || {
	echo "FAIL sbom place self-test: writing to a fresh path reported '$verdict', not 'written'" >&2
	exit 1
}
cmp -s "$pl/dest.json" "$st/base.json" || {
	echo "FAIL sbom place self-test: writing to a fresh path did not install the scan" >&2
	exit 1
}
echo "place self-test ok: preserved / written / written, bytes as expected"

# ---- every committed lockfile is decided about -------------------------
# The map in generate-sbom.sh is the decision record. Assert the set it
# declares equals the set git actually tracks, so a new ecosystem's
# lockfile fails the gate rather than going quietly uninventoried.
echo "== sbom lockfile map =="
# This pattern is PART OF THE DECISION SURFACE, not an implementation
# detail: a lockfile whose name it does not match is neither inventoried
# nor reported, which is the exact silence the map exists to break.
#
# So it matches by SHAPE — the `.lock` / `.lockfile` / `-lock.json|yaml`
# conventions nearly every ecosystem follows — rather than by an explicit
# roster of known filenames. A roster is the same mistake as the `dir:`
# scan this change removed: it works until something arrives that is not
# on it, and then it is quiet. A shape pattern picks up `deno.lock`,
# `mix.lock`, `renv.lock` and the next one nobody has thought of.
#
# The names that DON'T follow the convention still need naming, so they
# are listed after: go.sum, Package.resolved, Cartfile.resolved,
# cpanfile.snapshot.
#
# Measured on this tree, the shape pattern returns exactly the same four
# lockfiles as a hand-written roster did, with zero false positives —
# `Lockdown.*` (~20 files), `gate-lock.sh` and `blocks.ts` do not match,
# because the pattern is anchored to the suffix rather than searching for
# "lock" anywhere in the name.
LOCK_RE='(^|/)([^/]*\.lock|[^/]*\.lockfile|[^/]*-lock\.(json|ya?ml)|[^/]*\.lock\.json|go\.sum|Package\.resolved|Cartfile\.resolved|cpanfile\.snapshot)$'
git -C "$REPO_ROOT" ls-files | grep -E "$LOCK_RE" | sort >"$tmp/tracked"
"$GEN" --list | awk '{print $1}' | sort >"$tmp/declared"

tracked_n=$(wc -l <"$tmp/tracked" | tr -d ' ')
declared_n=$(wc -l <"$tmp/declared" | tr -d ' ')
echo "tracked lockfiles: $tracked_n   declared in the map: $declared_n"
if [ "$tracked_n" -eq 0 ]; then
	echo "FAIL: found no committed lockfile at all — the discovery pattern has stopped matching" >&2
	exit 1
fi

comm -23 "$tmp/tracked" "$tmp/declared" | sed 's/^/SBOM UNMAPPED /' >"$tmp/unmapped"
comm -13 "$tmp/tracked" "$tmp/declared" | sed 's/^/SBOM MISSING /' >"$tmp/missing"

# And the other direction: an inventory in sbom/ that the map no longer
# names. Walking only the map cannot see it, so retiring an ecosystem
# (drop the lockfile AND its row) would leave the stale inventory behind,
# green, for a scanner to keep reading. That is this gate's own reason for
# existing pointed at its own blind spot.
ls "$REPO_ROOT"/sbom/*.cdx.json 2>/dev/null | sed 's|.*/||; s|\.cdx\.json$||' | sort >"$tmp/present"
"$GEN" --list | awk '$2 != "-" {print $2}' | sort >"$tmp/inventoried"
comm -23 "$tmp/present" "$tmp/inventoried" | sed 's|^|SBOM ORPHAN sbom/|; s|$|.cdx.json|' >"$tmp/orphan"

if [ -s "$tmp/unmapped" ] || [ -s "$tmp/missing" ] || [ -s "$tmp/orphan" ]; then
	cat "$tmp/unmapped" "$tmp/missing" "$tmp/orphan" >&2
	echo "the lockfile map in scripts/generate-sbom.sh no longer matches the tree." >&2
	echo "  UNMAPPED: add a row — an inventory name, or '-' plus the reason it ships in nothing." >&2
	echo "  MISSING:  the lockfile is gone; drop its row (and its sbom/ file)." >&2
	echo "  ORPHAN:   sbom/ carries an inventory the map does not name; delete it, or add its row." >&2
	exit 1
fi

# ---- everything above is the LINT; the drift check is release-time -----
# `--lint` stops here. What it has just run — the two self-tests and the
# lockfile map — is everything that does NOT go stale as lockfiles move:
# whether this detector still detects, and whether every committed lockfile
# has been decided about. Both are seconds and need no Docker, so they stay
# in the per-PR matrix.
#
# What follows is the DRIFT check, and it is deliberately NOT a per-PR gate
# any more. An SBOM is a statement about a RELEASE — "these are the
# dependencies of v0.3.0" — and nobody consumes "the dependencies of main at
# commit abc123". Requiring every commit to carry a matching inventory was
# stricter than the artifact's own contract, and the cost was real: every
# dependabot PR that moved a lockfile arrived red and stayed red, because
# dependabot cannot regenerate them. So drift is checked when it means
# something, at release, where `make sbom:generate` is run and its output committed.
#
# The consequence to keep in mind rather than hide: between releases, the
# committed inventories describe the lockfiles as of the last release. The
# site's tech page says so in as many words instead of claiming CI holds
# them together.
if [ "${1:-}" = "--lint" ]; then
	echo "lint ok: the detector self-tests pass and every lockfile is accounted for"
	echo "(drift against the lockfiles is checked by \`make sbom:check\` at release time)"
	exit 0
fi

# ---- the committed inventories still describe their lockfiles ----------
echo "== sbom regenerate =="
"$GEN" "$tmp/fresh" >/dev/null

echo "== sbom drift =="
drifted=0
checked=0
"$GEN" --list | while read -r _lock name _rest; do
	[ "$name" = "-" ] && continue
	echo "$name"
done >"$tmp/names"

while read -r name; do
	checked=$((checked + 1))
	committed="$REPO_ROOT/sbom/$name.cdx.json"
	if [ ! -f "$committed" ]; then
		echo "SBOM DRIFT sbom/$name.cdx.json (mapped, but not committed)"
		drifted=$((drifted + 1))
		continue
	fi
	if compare_pair "sbom/$name.cdx.json" "$committed" "$tmp/fresh/$name.cdx.json"; then
		:
	else
		drifted=$((drifted + 1))
	fi
done <"$tmp/names"

if [ "$checked" -eq 0 ]; then
	echo "FAIL: compared no inventory at all — the map produced no rows" >&2
	exit 1
fi
if [ "$drifted" -ne 0 ]; then
	echo "$drifted of $checked committed inventories no longer describe their lockfile." >&2
	echo "Run \`make sbom:generate\` and commit the result in the same change as the lockfile." >&2
	exit 1
fi
echo "$checked inventories match their lockfiles"

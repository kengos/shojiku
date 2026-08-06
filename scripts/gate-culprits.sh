#!/usr/bin/env bash
# Pull the file-identifying lines out of a failed gate's log.
#
# A blind `tail -40` shows the END of a run, which is a summary count ("1 failed")
# and a stack of make errors — the lines that NAME the file scroll past above it.
# This extracts the locating lines per tool, so a failure answers "which file?"
# without opening the log.
#
# The log is normalised first: gate output arrives wrapped in ANSI colour and,
# under `pnpm -r`, prefixed with "<package> <script>: ". Matching the raw text
# silently finds nothing (it did, on the first cut of this script) and the caller
# then falls back to the tail — so normalise before matching.
#
# Prints nothing when it recognises nothing; the caller falls back to the tail,
# so an unrecognised tool degrades to the old behaviour rather than hiding output.
set -euo pipefail

LOG="${1:?usage: gate-culprits.sh <logfile>}"
[ -f "$LOG" ] || exit 0

norm=$(sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$LOG" | sed -E 's/^[a-z@/._-]+ [a-z:-]+: //')

pick() { printf '%s\n' "$norm" | grep -E "$1" 2>/dev/null | head -"${2:-25}" || true; }

emit() { # <heading> <lines>
	[ -n "$2" ] || return 0
	printf '%s\n' "$1"
	printf '%s\n' "$2" | sed 's/^/  /'
}

# rustc / clippy: "error[E0308]: msg" + the "--> path.rs:12:5" that locates it
emit "rustc/clippy:" "$(pick '^(error|warning)(\[[A-Z0-9]+\])?: |^ *--> ' 30)"

# cargo test: the failures: roster and panic sites
emit "cargo test:" "$(pick '^ *[a-z0-9_:]+ FAILED|panicked at |^---- .* stdout ----')"

# vitest: the FAIL banner (file > test name) and the ❯ file:line:col frames
emit "vitest:" "$(pick '(^| )FAIL +[^ ]+\.(test|spec)\.[tj]sx?|^ *❯ [^ ]+:[0-9]+:[0-9]+')"

# biome: "path/file.ts:12:3 lint/rule ━━━"
emit "biome:" "$(pick '^[^ ]+\.(ts|tsx|js|jsx|json|css):[0-9]+:[0-9]+ ')"

# tsc: "src/x.ts(12,3): error TS2345: ..."
emit "tsc:" "$(pick '^[^ ]+\([0-9]+,[0-9]+\): error TS[0-9]+')"

# the line-budget gates print their violations inline
emit "line budget:" "$(pick 'line-budget\([a-z]+\): (FAIL|[0-9])|exceeds')"

# coverage: cargo-llvm-cov prints NO message at all when it trips the
# --fail-under-lines threshold — it just exits non-zero — so there is nothing to
# match on. The `coverage` target appends scripts/coverage-why.sh output to the
# log for exactly this reason; lift that block out.
emit "coverage:" "$(pick '^(UNCOVERED|COVERED IN ONE COPY ONLY) |^  [a-z].*\.rs:[0-9]' 30)"

# examples-check: render-examples.sh prints one MISMATCH line per drifted file.
# Without this the failure falls back to the tail, which shows the comparison's
# exit rather than WHICH example drifted.
emit "examples:" "$(pick '^MISMATCH examples/')"

# examples-check, second step: the block-scalar indent check prints one
# `path:line: ...` per offending line. Same reason as above — the tail shows
# only the count, not which template and which line.
emit "text indent:" "$(pick '^(examples|skills)/.*: block scalar ')"

# wasm: the budget assertion prints the measured sizes and then which of the
# two budgets was crossed. Both lines matter — the sizes are the delta you act
# on, "over budget" alone does not say by how much. NOTE the size line is
# matched WITHOUT its "wasm size: " prefix: the pnpm-prefix stripper in the
# normalisation above reads "wasm size: " as "<package> <script>: " and eats
# it (found by running this against the real log, which is why matchers are
# validated that way and never by reading the regex).
emit "wasm budget:" "$(pick '^raw=[0-9]+ bytes gzip=|^(raw|gzip) over budget$')"

# cargo deny: line-level grep cannot work here — warning blocks (duplicate
# crates under multiple-versions="warn") carry the SAME "┌─"/"├ crate vX" line
# shapes as error blocks, and this workspace has dozens of them, so any line
# pattern floods the culprit list with warnings before the one real error.
# Instead, take every line of every error BLOCK: from an "error[" header until
# the next "warning["/"error[" header. That keeps the advisory/ban ID, the
# deny.toml locator, and the dependency tree naming who pulls the crate in.
emit "cargo deny:" "$(printf '%s\n' "$norm" | awk '
	/^(warning|error)\[/ { inerr = ($0 ~ /^error\[/) }
	inerr { print }
' | head -30)"

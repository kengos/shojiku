#!/usr/bin/env bash
# Name the CAUSE of a failed gate, and print the command that fixes it.
#
# Sibling of gate-culprits.sh, which answers "WHICH FILE?". This one answers
# "WHY, and what do I type now?" — the half that used to live in a document the
# reader had to know existed. A Makefile trap must be solvable from the Makefile
# (user rule): a failure that has a canonical remedy prints that remedy here
# rather than sending anyone to a prose catalogue.
#
# Two classes are worth separating, because they call for opposite actions:
#
#   * FLAKE   — the failure is not about the change. The tell is always that the
#               error names infrastructure (a `FROM` line, a docker build id) or
#               a file the diff never goes near. The remedy is to re-run the ONE
#               gate, not to read code. Losing an hour to reading a flake is the
#               single most repeated waste this catalogue was written for.
#   * REMEDY  — the failure is real and mechanical: a lockfile that needs
#               re-resolving, an inventory that needs regenerating, an output
#               that needs re-rendering. There is exactly one command for each,
#               and none of them are guessable from the tool's own message.
#
# Prints nothing when it recognises nothing — the caller keeps its existing
# output, so an unrecognised failure degrades to today's behaviour rather than
# to a wrong diagnosis. Silence here means "no opinion", never "all clear".
set -euo pipefail

LOG="${1:?usage: gate-diagnose.sh <logfile>}"
[ -f "$LOG" ] || exit 0

# Same normalisation as gate-culprits.sh: gate output arrives wrapped in ANSI
# colour and, under `pnpm -r`, prefixed with "<package> <script>: ". Matching
# the raw text silently finds nothing.
norm=$(sed -E $'s/\x1b\\[[0-9;]*[A-Za-z]//g' "$LOG" | sed -E 's/^[a-z@/._-]+ [a-z:-]+: //')

has() { printf '%s\n' "$norm" | grep -qE "$1"; }

n=0
say() { # <headline> <remedy line...>
	n=$((n + 1))
	printf '%s\n' "$1"
	shift
	for line in "$@"; do printf '    %s\n' "$line"; done
}

# --- FLAKES -----------------------------------------------------------------

# A base image fails to pull mid-build. The tell is the error naming a FROM line
# and a docker build id rather than any step of the gate. One `make verify` died
# here having already passed rust, coverage, deny, examples, wasm, napi, gui and
# the ruby SDK; the single job passed immediately on re-run.
if has 'context deadline exceeded|DeadlineExceeded|failed to (fetch oauth token|do request)|TLS handshake timeout'; then
	say "FLAKE — a base-image pull timed out. This is the registry, not your change." \
		"Re-run the ONE gate: make quiet T=<the target that failed>" \
		"If a bare 'docker pull hello-world' also stalls, restart Docker Desktop."
fi

# CI's exit 125 is docker itself refusing to start the container — most often a
# pull. It reads like a gate failure because it arrives at a gate's step.
if has '^make.*Error 125|exit code 125|exit status 125'; then
	say "FLAKE — exit 125 is docker failing to START the container (usually a pull)." \
		"Nothing in the diff can cause it. Re-run the job."
fi

# A missing extern crate in a binary the change never touched, on a tree whose
# previous run passed. Reproduces as PASS on an unchanged re-run.
if has "can't find crate for"; then
	say "POSSIBLE FLAKE — 'can't find crate for' in a crate you did not edit is a stale-cache artifact." \
		"Re-run the single gate ONCE before reading any code." \
		"Only a failure that REPRODUCES is about the change."
fi

# --- MOUNT / TREE -----------------------------------------------------------

# Font packs resolve as CARGO_MANIFEST_DIR/../../packs, so a mount that is not
# the repo root makes a correct change look broken — and poisons the cached test
# binary, which keeps failing after the mount is fixed.
if has 'Pack\(NotFound|font pack `[^`]+` not found'; then
	say "MOUNT — the docker mount is not the repository root, so packs/ is invisible." \
		"Run the gate as: make -C \"\$(git rev-parse --show-toplevel)\" <target>" \
		"The wrong mount BAKES itself into the cached test binary: after fixing the" \
		"mount, force a rebuild (touch engine/layout/tests/e2e/main.rs) or it keeps failing." \
		"See: make investigate:tree"
fi

# --- REMEDIES: one command each ---------------------------------------------

# Every gate is --locked / --frozen-lockfile and refuses until the lockfile is
# re-resolved. The tools' own messages name neither the make target nor the
# scope.
if has 'the lock file .* needs to be updated|ERR_PNPM_OUTDATED_LOCKFILE|frozen-lockfile|--locked'; then
	say "REMEDY — a manifest moved and its lockfile was not re-resolved." \
		"make engine:lock | gui:lock | site:lock | sdk:js:lock   (pick the scope that failed)" \
		"engine additionally needs: git add engine/Cargo.lock"
fi

if has '^MISMATCH examples/'; then
	say "REMEDY — a committed example output no longer matches what the engine renders." \
		"Intended?  make examples:render   then commit the re-rendered files." \
		"Not intended? the diff changed rendering — that is the finding."
fi

if has '^SBOM (DRIFT|UNMAPPED|MISSING|ORPHAN) '; then
	say "REMEDY — an SBOM inventory no longer describes its lockfile." \
		"make sbom:generate   then commit the regenerated inventories."
fi

if has 'reference[:-]check|catalog\.schema\.json|KEY CATALOG (DRIFT|MISSING)'; then
	say "REMEDY — the key catalog drifted from the parser." \
		"make reference:generate   then commit the regenerated catalog."
fi

# Every gate is named <scope>:<job> now. The old verb-first and dash-named
# spellings are DELETED rather than aliased, so muscle memory and any doc that
# escaped the rename land here, on an error that names no remedy at all.
if has "No rule to make target"; then
	say "REMEDY — that target does not exist. Gate names are <scope>:<job>," \
		"scope first: engine:lint, gui:verify, sdk:ruby:verify, site:build." \
		"make help   lists all of them. Add V=1 to any of them for raw output." \
		"If a DOC sent you here, make make:check will name the file."
fi

if has '^VERSION (DRIFT|UNDERCOUNT) '; then
	say "REMEDY — a version literal disagrees with the release it should track." \
		"The DRIFT line names the file and both versions; edit the literal, do not" \
		"widen the rule. An UNDERCOUNT means a rule stopped matching — the literal" \
		"moved or was deleted, so the rule no longer guards anything."
fi

if has 'line-budget\([a-z]+\): FAIL|exceeds .* lines'; then
	say "REMEDY — a file crossed its line budget (engine .rs = 300 hard, gui .ts/.tsx = 150 executable)." \
		"Split it, or add an in-file 'line-budget-exempt: <reason>' waiver if the file" \
		"genuinely cannot be split. Comments and blank lines cost nothing on the gui side."
fi

# cargo-llvm-cov prints NOTHING when it trips --fail-under-lines; it just exits
# non-zero. Without this the reader sees a bare failure and no line to act on.
if has 'error: .*fail-under|--fail-under-lines|^UNCOVERED '; then
	say "REMEDY — the 100% line-coverage gate tripped." \
		"make engine:coverage-why   lists the uncovered lines AND the ones covered" \
		"in only ONE of a crate's two copies (its own test binary vs the copy linked" \
		"into dependents) — the second kind is invisible in a per-crate run."
fi

if has 'Cannot connect to the Docker daemon|Is the docker daemon running'; then
	say "REMEDY — the docker daemon is not answering." \
		"make investigate:docker   checks the daemon, the registry and a real pull."
fi

if has 'gate-lock|another gate is running|Resource temporarily unavailable'; then
	say "REMEDY — another gate holds this tree's lock. Two gates in one tree clobber each other." \
		"make investigate:gates   says what is running. Separate worktrees may run in parallel."
fi

if has 'biome|lint/(a11y|suspicious|correctness|style)/'; then
	say "REMEDY — biome findings. Formatting-only ones fix themselves:" \
		"make gui:format   (rust equivalent: make engine:format)"
fi

exit 0

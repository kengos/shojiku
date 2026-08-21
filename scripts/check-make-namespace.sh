#!/usr/bin/env bash
# The make surface's own invariant. Four rules, one detector, self-tested
# against a known-bad fixture BEFORE it reads the real tree.
#
#   1. every target defined in mk/<x>.mk is named <x>:<job> or _<x>-<job>
#   2. every PUBLIC target (one carrying a `## ` help text) is either
#      colon-named or one of the five scope-less names in BARE_OK
#   3. every $(call gate,<internal>,<public>) names a defined internal and
#      labels itself with the target it sits on
#   4. every make target named in code anywhere in the TRACKED TREE — a
#      backtick span, a shell fence, a yaml run:/target: — is a target that
#      exists, including a name a CI matrix builds by interpolation, which
#      is checked as a pattern
#
# Rule 4 is the reason this gate exists. Nothing else in the repo can see a doc
# teaching a command that was renamed away, and an agent reading such a doc
# will invent the command rather than doubt it. It reads every tracked file,
# not a chosen set of extensions — Dockerfiles, Rust and TypeScript doc
# comments, .toml, .json and .gitignore all carry these commands.
#
# Waiver: put make-namespace-exempt: plus a reason on the line. The self-test
# asserts a waived line is NOT counted, so the hatch is proven wired.
#
# What it does NOT see, so far as anyone has thought about it: a target spelled
# across a line break, a name built by SHELL interpolation (a GitHub `${{ }}`
# one IS checked, as a pattern; a `$VAR` one is not), prose that names a command
# without marking it as code, and anything DERIVED from a target name rather
# than being one — a `.make-logs/<name>.log` path moves when a target is renamed
# and looks nothing like a make invocation, so three of them survived the rename
# sweep that produced this gate. Those are the shapes nobody has
# been bitten by yet, not a complete list of holes.
#
# No Docker, no network, and it only READS: nothing found in the tree is ever
# evaluated or executed.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
FIXTURE="$ROOT/scripts/fixtures/make-namespace"
BARE_OK="help verify quiet clean proof"
# EVERY tracked file, minus an exclusion list — not a list of extensions to
# include. A glob list looks complete and is not: `make <target>` occurrences
# live in Dockerfiles, Rust and TypeScript doc comments, .toml, .json, .php and
# .gitignore as well as in markdown, and an inclusion list silently drops each
# new carrier as it appears. With an exclusion list a new file is checked by
# default, and anything deliberately skipped has to be written down here.
#
#   scripts/fixtures/make-namespace/  known-bad ON PURPOSE (the self-test's own
#                                     input); scanning it in the real run would
#                                     report its seeded violations as real ones
EXCLUDE_RE='^scripts/fixtures/make-namespace/'

# ---- the detector, shared by the self-test and the real run ---------------

# Target definitions in the given makefiles, colons unescaped, one per line.
targets_in() {
	grep -hE '^[A-Za-z0-9_\\:-][A-Za-z0-9_.\\:-]*:([^=]|$)' "$@" \
		| sed -E 's/^([A-Za-z0-9_.\\:-]+):.*/\1/; s/\\//g' | sort -u
}

# The same, restricted to definitions carrying a `## ` help text.
public_in() {
	grep -hE '^[A-Za-z0-9_.\\:-]+:.*## ' "$@" \
		| sed -E 's/^([A-Za-z0-9_.\\:-]+):.*/\1/; s/\\//g' | sort -u
}

rule_misfiled() {
	local dir=$1 f scope name
	for f in "$dir"/mk/*.mk; do
		[ -e "$f" ] || continue
		scope=$(basename "$f" .mk)
		for name in $(targets_in "$f"); do
			case "$name" in
				"$scope"|_"$scope") ;;
				"$scope":*|_"$scope"-*) ;;
				*) printf '%s: target %s does not belong to scope %s\n' \
					"${f#"$dir"/}" "$name" "$scope" ;;
			esac
		done
	done
}

rule_unscoped() {
	local dir=$1 name b ok
	for name in $(public_in "$dir"/Makefile "$dir"/mk/*.mk); do
		case "$name" in *:*) continue ;; esac
		ok=no
		for b in $BARE_OK; do [ "$name" = "$b" ] && ok=yes; done
		[ "$ok" = yes ] || printf 'public target %s has no scope and is not one of: %s\n' \
			"$name" "$BARE_OK"
	done
}

rule_gate_wiring() {
	local dir=$1 all
	all=" $(targets_in "$dir"/Makefile "$dir"/mk/*.mk | tr '\n' ' ') "
	awk -v all="$all" '
		FNR == 1 { file = FILENAME; sub(/.*\//, "", file) }
		# The name ends at the first UNESCAPED colon: an escaped one is part of
		# the name (engine\:lint), and cutting there would report every scoped
		# target as mislabelled.
		/^[A-Za-z0-9_.\\:-]+:/ {
			t = $0
			if (match(t, /^([A-Za-z0-9_.-]|\\:)+/)) { t = substr(t, 1, RLENGTH); gsub(/\\/, "", t) }
		}
		/\$\(call gate,/ {
			line = $0
			sub(/.*\$\(call gate,/, "", line); sub(/\).*/, "", line)
			split(line, a, ",")
			if (index(all, " " a[1] " ") == 0)
				printf "%s: gate call names an undefined target: %s\n", file, a[1]
			if (a[2] != t)
				printf "%s: gate on %s labels itself %s\n", file, t, a[2]
		}' "$dir"/Makefile "$dir"/mk/*.mk
}

# Rule 4. ONE grep over the whole file list, then one awk — a per-file bash
# loop over ~350 files is both slow and, with nested process substitutions,
# deadlock-prone. Only CODE occurrences count (a backtick span, a shell fence,
# a yaml run:/target:), so ordinary prose is out of scope by construction
# rather than by an ever-growing list of English words.
#
# The alternation is deliberately flat: the natural `X( Y)*` spelling for the
# yaml form backtracks catastrophically and hung this gate for minutes on one
# README.
rule_dangling_refs() {
	local dir=$1 listing=$2 all raw status
	all=" $(targets_in "$dir"/Makefile "$dir"/mk/*.mk | tr '\n' ' ') "
	[ -s "$listing" ] || return 0
	raw=$(mktemp)
	# grep exits 1 for "no match" and >1 for a REAL error. A blanket `|| true`
	# swallows the second, which on a gate that exists to catch what nothing
	# else catches means it silently reports clean. Tolerate 1 only.
	(cd "$dir" && xargs -0 grep -IHnE --  '`(make|gmake)[^`]*`|^ *(make|gmake) [^|;&#]*|run: (make|gmake) [^|;&#]*|^ *target: [A-Za-z0-9_.: -]+' < "$listing") > "$raw"
	status=$?
	if [ "$status" -gt 1 ]; then
		rm -f "$raw"
		echo "the reference scan failed (grep exit $status) — treating that as a violation rather than as clean" >&2
		return 2
	fi
	awk -F: -v all="$all" '
		/make-namespace-exempt:/ { next }
		{
			file = $1
			body = $0
			sub(/^[^:]*:[0-9]*:/, "", body)
			# A backtick becomes a WALL, not a space: `make` on its own must not
			# lend its meaning to the next word in the sentence around it.
			gsub(/`/, " ~ ", body)
			# Strip a TRAILING comment only. Stripping a leading `#` would drop the
			# whole line, and a yaml or shell comment is exactly where a command is
			# spelled for the next reader.
			iscomment = (body ~ /^[ \t]*#/)
			if (!iscomment) sub(/[ \t]#.*/, "", body)
			sub(/^ *run: /, " ", body)
			# A CI matrix builds the name by INTERPOLATION, and the interpolation
			# carries spaces — so it has to collapse before the split, or the name
			# is torn into three tokens and never checked at all. That blind spot
			# is what let a rename ship looking complete and red half the matrix.
			gsub(/\$\{\{[^}]*\}\}/, "@@", body)
			# A DOC placeholder is the same shape as a CI interpolation and the
			# same trap. A doc that teaches a RETIRED grammar with a placeholder
			# in it is invisible to every literal lookup, and that is the form
			# docs use most: nine such references survived the rename sweep that
			# produced this gate. Collapse them too and let the pattern decide.
			gsub(/<[A-Za-z0-9_.-]+>/, "@@", body)
			# `target:` names a make target only in the CI composite action that
			# takes one as an input. Elsewhere it is a link attribute, a YAML
			# frontmatter key, or plain prose.
			if (file ~ /^\.github\//) sub(/^ *target: /, " make ", body)
			n = split(body, w, /[ \t]+/)
			for (i = 1; i < n; i++) {
				if (w[i] != "make" && w[i] != "gmake") continue
				# In a COMMENT line, only a backtick span is a command: prose
				# says "the make chain" and "the same make target a contributor
				# runs" without meaning any of it as something to type.
				if (iscomment && w[i - 1] != "~") continue
				# Walk past flags and variable assignments to the first word
				# that could be a target. Skipping only ONE word would leave
				# `make -C <path> <target>` — the form every worktree session
				# is told to use — silently unchecked.
				j = i + 1
				while (j <= n) {
					if (w[j] ~ /^-/) { if (w[j] == "-C" || w[j] == "-f") j++; j++; continue }
					if (w[j] ~ /=/) { j++; continue }
					break
				}
				tok = w[j]
				if (tok == "~" || tok == "") continue
				# An interpolated or placeholder name is checked as a PATTERN:
				# some target must match it, even though no literal lookup can.
				if (tok ~ /@@/) {
					pat = tok
					gsub(/\./, "\\.", pat)
					gsub(/@@/, "[^ ]+", pat)
					if (all !~ (" " pat " ")) {
						shown = tok
						gsub(/@@/, "<…>", shown)
						printf "%s: no target matches the interpolated name: %s\n", file, shown
					}
					continue
				}
				if (tok ~ /[<>$]/) continue
				if (tok !~ /^[A-Za-z0-9_.:-]+$/) continue
				if (index(all, " " tok " ") == 0)
					printf "%s: names a make target that does not exist: %s\n", file, tok
			}
		}' "$raw" | sort -u
	rm -f "$raw"
}

list_into() {                       # $1 dir, $2 mode, $3 output file (NUL-separated)
	if [ "$2" = git ]; then
		(cd "$1" && git ls-files -z | grep -zvE "$EXCLUDE_RE") > "$3"
	else
		# EVERY file, mirroring the real run: the fixture's own Makefile is where
		# the comment-prose exclusion case lives, and a name filter would leave
		# that rule with no self-test at all.
		(cd "$1" && find . -type f -print0) > "$3"
	fi
}

run_all() {                         # $1 dir, $2 listing file
	rule_misfiled "$1"
	rule_unscoped "$1"
	rule_gate_wiring "$1"
	rule_dangling_refs "$1" "$2"
}

# ---- self-test: EXACTLY the seeded violations, no more, no fewer ---------

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

list_into "$FIXTURE" find "$WORK/fixture.list"
run_all "$FIXTURE" "$WORK/fixture.list" > "$WORK/fixture.out" || true
cat > "$WORK/fixture.want" <<'WANT'
./README.md: names a make target that does not exist: engine:nosuchjob
./README.md: no target matches the interpolated name: gui-<…>
Makefile: gate call names an undefined target: _engine-missing
Makefile: gate on engine:mislabel labels itself engine:WRONGLABEL
mk/engine.mk: target gui:strayfile does not belong to scope engine
public target strayname has no scope and is not one of: help verify quiet clean proof
WANT
sort "$WORK/fixture.out" > "$WORK/fixture.got"
sort -o "$WORK/fixture.want" "$WORK/fixture.want"
if ! diff -u "$WORK/fixture.want" "$WORK/fixture.got" > "$WORK/fixture.diff"; then
	echo "self-test FAILED: the fixture did not produce exactly the seeded violations" >&2
	cat "$WORK/fixture.diff" >&2
	echo "  The fixture seeds ONE case per assertion, plus a WAIVED line and one" >&2
	echo "  case per exclusion class that must NOT count. A missing line means this" >&2
	echo "  gate has stopped detecting something it claims to; an extra one means it" >&2
	echo "  started reporting something it should walk past. Fix the detector, or" >&2
	echo "  add the case here deliberately — never edit this list to make it pass." >&2
	exit 2
fi

# ---- the real run --------------------------------------------------------

list_into "$ROOT" git "$WORK/tree.list"
MKFILES=$(ls "$ROOT"/mk/*.mk | wc -l | tr -d ' ')
# Reconciled against a DIFFERENT source than the one it came from: an mk file
# that exists but is never included is invisible to make, and one that is
# included but missing is a hard error nobody sees until a gate is run.
INCLUDED=$(grep -cE '^include mk/[a-z]+\.mk$' "$ROOT"/Makefile | tr -d ' ')
NTARGETS=$(targets_in "$ROOT"/Makefile "$ROOT"/mk/*.mk | wc -l | tr -d ' ')
NDOCS=$(tr -cd '\0' < "$WORK/tree.list" | wc -c | tr -d ' ')
if [ "$MKFILES" -lt 6 ] || [ "$NTARGETS" -lt 100 ] || [ "$NDOCS" -lt 1000 ]; then
	echo "scan sentinel FAILED: mk files=$MKFILES targets=$NTARGETS files=$NDOCS" >&2
	echo "  One of these is implausibly small, so the scan did not reach the tree." >&2
	exit 2
fi
if [ "$MKFILES" != "$INCLUDED" ]; then
	echo "scan sentinel FAILED: mk/ holds $MKFILES scope files but the Makefile includes $INCLUDED" >&2
	echo "  A file that is present but not included contributes no targets and is" >&2
	echo "  invisible to make, so this gate would read it while nothing runs it." >&2
	exit 2
fi
echo "scanned $MKFILES scope makefiles, $NTARGETS targets, $NDOCS tracked files"

# NOT `|| true`. rule_dangling_refs returns 2 when its own scan failed, and a
# blanket tolerate-everything here throws that away and prints the success
# line — the same fail-open the scan-error check exists to prevent, one layer
# out. Exit 1 from a rule means "found violations"; anything above is broken.
run_all "$ROOT" "$WORK/tree.list" > "$WORK/found"
rc=$?
if [ "$rc" -ge 2 ]; then
	echo "the surface scan itself failed (exit $rc) — treating that as a violation" >&2
	exit 2
fi
if [ -s "$WORK/found" ]; then
	echo "make surface violations ($(wc -l < "$WORK/found" | tr -d ' ')):" >&2
	cat "$WORK/found" >&2
	exit 1
fi
echo "make surface ok"

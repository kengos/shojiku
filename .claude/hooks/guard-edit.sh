#!/bin/sh
# PostToolUse guard over Edit/Write — the file-shape rules, one file at a time.
#
# Everything here is a NOTE, never a block: an edit is often one step of a
# split that is legal only once finished, so the gate stays the authority and
# this only shortens the distance to it. The value is timing — the same
# finding costs seconds here and a ~10-minute verify (or a CI round trip)
# when it surfaces at the end of a build.
#
# The executable-line count below reimplements `scripts/check-gui-line-budget.sh`'s
# definition rather than calling it, because that gate scans the whole tree and
# refuses a scan of fewer than 100 files. `make gui:budget` remains the
# authority; this is an early warning that names it.
#
# Never breaks a session: a missing jq, an unparsable event or a vanished file
# exits 0 saying nothing.

command -v jq >/dev/null 2>&1 || exit 0

event=$(cat 2>/dev/null) || exit 0
path=$(printf '%s' "$event" | jq -r '.tool_input.file_path // ""' 2>/dev/null) || exit 0
[ -n "$path" ] && [ -f "$path" ] || exit 0
# Never scan a binary: the work-item-code regex hits byte coincidences in a
# .wasm or a .png, and the note would be pure noise.
grep -Iq . "$path" 2>/dev/null || exit 0

notes=''
add() { notes="$notes$1
"; }
exempt() { grep -q 'line-budget-exempt:' "$path"; }

case "$path" in
*/engine/*.rs)
	# Tests are out of the length budget on both sides (docs/guidelines.md
	# "File length"): a suite is a list of cases, not a unit of design.
	case "$path" in
	*/tests/* | */tests.rs | *_tests.rs) ;;
	*)
		lines=$(wc -l < "$path" | tr -d ' ')
		if [ "$lines" -gt 300 ] && ! exempt; then
			add "$path is $lines lines against the 300-line cap (make engine:budget). Split at a seam that means something — a foo.rs root keeping the shared state and types, plus foo/<concern>.rs, no mod.rs — rather than shaving to fit. Or add an in-file 'line-budget-exempt: <reason>'."
		elif [ "$lines" -gt 250 ] && ! exempt; then
			add "$path is $lines lines, within 50 of the 300 cap. Splitting is cheaper now than under the pressure of a failing gate, and a seam chosen now is a seam chosen for cohesion."
		fi
		;;
	esac
	case $(head -1 "$path") in
	'//!'*) ;;
	*) add "$path does not open with a //! role header. Every .rs under engine/ carries one, tests included, and make engine:budget gates it — head -1 is how a file is identified without opening it." ;;
	esac
	;;
*/gui/*.ts|*/gui/*.tsx)
	case "$path" in
	*.test.ts|*.test.tsx|*/e2e/*|*/dist/*|*/node_modules/*) ;;
	*)
		exec_lines=$(awk '
			BEGIN { n = 0; inblock = 0 }
			{
				line = $0
				sub(/^[ \t]+/, "", line); sub(/[ \t]+$/, "", line)
				if (inblock) {
					if (line ~ /\*\//) { inblock = 0; sub(/^.*\*\//, "", line)
						sub(/^[ \t]+/, "", line)
						if (line != "" && line != "}") n++ }
					next
				}
				if (line == "") next
				if (line ~ /^\/\//) next
				if (line ~ /^\{?\/\*/) {
					if (line ~ /\*\//) { sub(/^.*\*\//, "", line)
						sub(/^[ \t]+/, "", line)
						if (line != "" && line != "}") n++; next }
					inblock = 1; next
				}
				n++
			}
			END { print n }' "$path")
		if [ "$exec_lines" -gt 150 ] && ! exempt; then
			add "$path is about $exec_lines executable lines against the 150 cap (make gui:budget is the authority). Comments and blank lines cost nothing, so documenting it will not help — split it, or add an in-file 'line-budget-exempt: <reason>'."
		fi
		;;
	esac
	;;
esac

# Development-tracking labels belong to the forward-looking set, which lives
# outside this checkout. Five separate skills state this prohibition; one
# track left 17 of them stamped into a code map for a later pass to scrub.
case "$path" in
*/engine/*|*/gui/*|*/sdk/*|*/site/*|*/docs/*|*/scripts/*|*/packs/*|*/examples/*)
	# Two shapes, because the queue uses both: a two-letter stem run straight
	# into its number (GU12, BX1, EQ1), and a NAMED prefix with a hyphen
	# (GUI-44, ENGINE-7, MAKE-1, RELEASE-1). The first pattern alone missed the
	# hyphenated family entirely — which is the majority of the live codes and
	# the family every current GUI cycle is named after, and six `GUI-41`
	# comments had already reached the tracked tree unnoticed.
	#
	# The prefixes are LISTED rather than matched as `[A-Z]{2,}-[0-9]+`,
	# because that general shape is what the standards and the sample data look
	# like: over the 3336 tracked files under the paths scanned above it
	# returns 1330 `OFL-n`, 129 `UTF-n`, 60 `SHA-n`, and BSD/MPL/GPL/RFC/PDF
	# beside every order number under examples/ (`INV-`, `ORD-`, `SO-`, `ST-`,
	# `TK-`, `PO-`). A note that fires on almost every edit is worse than the
	# miss. (The binary files the guard skips carry none of the three, so the
	# counts are the same over the text subset it actually reads. Both this
	# comment and check-hooks.sh's spell the families `OFL-n` rather than
	# `OFL-1`: check-hooks.sh is INSIDE the scanned globs, so writing a census
	# in the earlier spelling deleted one match of each from the thing being
	# counted.)
	#
	# A LIST rots, though, and this one had: measured against the queue, six
	# live two-letter families (GC FV FM MK TL KC) and two live hyphenated ones
	# were invisible here — and those two were `SKILL-` and `DOC-`, both
	# current queue items, so the guard could not see the codes of the work
	# being done to it. Re-derive the population with:
	#
	#   grep -rhoE '\b[A-Z]{2,8}-?[0-9]+[a-z]?\b' ~/shojiku-work/TODO.md \
	#     ~/shojiku-work/BACKLOG.md ~/shojiku-work/backlogs/
	#
	# Admit a family only when it names OPEN WORK — an item somebody could
	# still pick up — AND measures zero over the tracked tree first. "Open
	# work", not "several members": three of the eight admitted here have
	# exactly ONE member each (`FM2`, `SKILL-6`, `DOC-1`), and the last two are
	# the headline case, so a member count would have re-excluded them. What
	# the rejected residue has in common is not scarcity but KIND — `MS1` and
	# `TY1` are the examples in the queue's own conventions sentence, `RA1`,
	# `GB1` and `AN2` are rows in a rename table naming superseded codes, and
	# `RB1` and `LB1` are named in the past tense as shipped. That second clause is not a formality: `LB`
	# looked exactly like the six admitted above and collides with UAX #14's
	# own rule names, `LB19` being cited in engine/layout/src/wrap/kinsoku.rs.
	# No gate can catch the next rot, because the queue that defines the
	# population lives outside this repository; the cost of forgetting stays a
	# missed note, never a false one.
	#
	# A ONE-letter family could never be added, whatever the queue does with it.
	# Measured the same way, `\b[A-Z][0-9]+\b` over the forward-looking set
	# returns no work item at all — it returns the Pain/Cost/Value scores
	# (`P7`, `C1`, `V4`), the paper sizes (`A4`, `B5`), `M3` for Material 3,
	# the function keys (`F8`, `F9`, `F11`) and review round numbers — and the
	# tracked tree is full of the same tokens.
	# So the omission is deliberate: do not "complete" the list with one.
	codes=$(grep -Eo '\b((GU|GD|TB|FP|BX|DF|FR|GL|GS|EQ|GC|FV|FM|MK|TL|KC)[0-9]+[a-z]?|(GUI|ENGINE|MAKE|RELEASE|SDK|SITE|MCP|WASM|SKILL|DOC)-[0-9]+[a-z]?)\b' "$path" 2>/dev/null | sort -u | tr '\n' ' ')
	[ -n "$codes" ] && add "$path names what look like internal work-item codes: $codes. These live only in the forward-looking set, never in tracked code or docs."
	;;
esac

if [ -n "$notes" ]; then
	jq -n --arg c "$notes" '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$c}}'
fi
exit 0

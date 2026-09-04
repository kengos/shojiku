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
	lines=$(wc -l < "$path" | tr -d ' ')
	if [ "$lines" -gt 300 ] && ! exempt; then
		add "$path is $lines lines against the 300-line hard cap (make engine:budget). Split by concern into a directory module (foo.rs root + foo/<concern>.rs, no mod.rs), or add an in-file 'line-budget-exempt: <reason>'."
	elif [ "$lines" -gt 160 ] && ! exempt; then
		add "$path is $lines lines; 160 is the recommended ceiling and 300 the hard cap. Worth splitting before it becomes urgent."
	fi
	case $(head -1 "$path") in
	'//!'*) ;;
	*) add "$path does not open with a //! role header. Every .rs under engine/ carries one, and make engine:budget gates it — head -1 is how a file is identified without opening it." ;;
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
	codes=$(grep -Eo '\b(GU|GD|TB|FP|BX|DF|FR|GL|GS|EQ)[0-9]+[a-z]?\b' "$path" 2>/dev/null | sort -u | tr '\n' ' ')
	[ -n "$codes" ] && add "$path names what look like internal work-item codes: $codes. These live only in the forward-looking set, never in tracked code or docs."
	;;
esac

if [ -n "$notes" ]; then
	jq -n --arg c "$notes" '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$c}}'
fi
exit 0

#!/bin/sh
# Line-budget gate for engine Rust sources. The rule it encodes, in full:
#
#   - every .rs file under engine/ is <= 300 lines (tests included);
#     <= 160 is the recommended target for new files,
#   - every .rs file starts with a `//!` role header so `head -1` / grep
#     can identify or skip it without opening,
#   - a file may exceed 300 lines only with an explicit in-file waiver:
#     a line containing `line-budget-exempt: <reason>`.
#
# Pure read-only POSIX sh + standard tools; no toolchain required.
set -eu

HARD_MAX=300
root=$(dirname "$0")/..

violations=$(
    find "$root/engine" -name '*.rs' -not -path '*/target/*' | LC_ALL=C sort |
    while IFS= read -r f; do
        rel=${f#"$root/"}
        lines=$(wc -l < "$f")
        if [ "$lines" -gt "$HARD_MAX" ] && ! grep -q 'line-budget-exempt:' "$f"; then
            echo "$rel is $lines lines (max $HARD_MAX; split it, or add 'line-budget-exempt: <reason>')"
        fi
        case $(head -1 "$f") in
            ("//!"*) ;;
            (*) echo "$rel is missing a first-line //! role header" ;;
        esac
    done
)

if [ -n "$violations" ]; then
    printf '%s\n' "$violations" | sed 's/^/line-budget: /' >&2
    exit 1
fi
echo "line-budget: OK"

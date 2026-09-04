#!/bin/sh
# Line-budget gate for engine Rust sources. WHY there is a cap at all, and
# why the answer to hitting it is a seam rather than a trim, is
# docs/guidelines.md "File length"; this encodes the rule, in full:
#
#   - every non-test .rs file under engine/ is <= 300 lines; <= 160 is the
#     design target for a NEW file, and is not gated,
#   - every .rs file starts with a `//!` role header so `head -1` / grep
#     can identify or skip it without opening,
#   - a file may exceed 300 lines only with an explicit in-file waiver:
#     a line containing `line-budget-exempt: <reason>`.
#
# TEST FILES ARE OUT OF SCOPE for the length half, the way the gui gate has
# always had them: a test file is a list of independent cases rather than a
# unit of design, so neither reason for the cap reaches it, and splitting a
# suite to fit a number moves cases across a seam chosen by arithmetic. The
# //! header still applies to every file — that one is about finding a file,
# not about its shape.
#
# Pure read-only POSIX sh + standard tools; no toolchain required.
set -eu

HARD_MAX=300
root=$(dirname "$0")/..

# `<mod>/tests.rs`, anything under a `tests/` directory (both the sibling
# `<mod>/tests/` split and a crate's near-e2e `tests/` binary), and the
# `<mod>/<feature>_tests.rs` shape the engine skill prescribes.
is_test() {
    case $1 in
    */tests/* | */tests.rs | *_tests.rs) return 0 ;;
    *) return 1 ;;
    esac
}

files=$(find "$root/engine" -name '*.rs' -not -path '*/target/*' | LC_ALL=C sort)
count=$(printf '%s\n' "$files" | grep -c . || true)
if [ "$count" -lt 100 ]; then
    echo "line-budget: only $count files found — the scan is broken, not clean" >&2
    exit 1
fi

violations=$(
    printf '%s\n' "$files" |
    while IFS= read -r f; do
        rel=${f#"$root/"}
        lines=$(wc -l < "$f")
        if ! is_test "$f" && [ "$lines" -gt "$HARD_MAX" ] &&
            ! grep -q 'line-budget-exempt:' "$f"; then
            echo "$rel is $lines lines (max $HARD_MAX; split it at a seam that means something, or add 'line-budget-exempt: <reason>')"
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

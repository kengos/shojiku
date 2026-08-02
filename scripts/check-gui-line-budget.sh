#!/bin/sh
# Per-file line budget for the gui/ workspace sources.
#
#   - every non-test .ts/.tsx under gui/ holds <= 150 EXECUTABLE lines;
#   - executable = the file's lines minus blank lines, `//` line comments
#     and `/* ... */` block comments (JSX `{/* ... */}` included), so
#     documenting a file never costs budget;
#   - a file may exceed the cap only with an explicit in-file waiver: a
#     line containing `line-budget-exempt: <reason>`.
#
# Test files, the Playwright e2e harness and build output are out of scope
# (the Biome function-length rule excludes the same set).
#
# Pure read-only POSIX sh + awk; no toolchain required.
set -eu

MAX_EXEC=150
root=$(dirname "$0")/..

files=$(
    find "$root/gui" \
        \( -name node_modules -o -name dist -o -name coverage -o -name e2e \) -prune -o \
        \( -name '*.ts' -o -name '*.tsx' \) \
        ! -name '*.test.ts' ! -name '*.test.tsx' \
        -print | LC_ALL=C sort
)
count=$(printf '%s\n' "$files" | grep -c . || true)
if [ "$count" -lt 100 ]; then
    echo "line-budget(gui): only $count files found — the scan is broken, not clean" >&2
    exit 1
fi

violations=$(
    printf '%s\n' "$files" |
    while IFS= read -r f; do
        rel=${f#"$root/"}
        exec_lines=$(awk '
            BEGIN { n = 0; inblock = 0 }
            {
                line = $0
                sub(/^[ \t]+/, "", line)
                sub(/[ \t]+$/, "", line)
                if (inblock) {
                    if (line ~ /\*\//) {
                        inblock = 0
                        sub(/^.*\*\//, "", line)
                        sub(/^[ \t]+/, "", line)
                        if (line != "" && line != "}") n++
                    }
                    next
                }
                if (line == "") next
                if (line ~ /^\/\//) next
                if (line ~ /^\{?\/\*/) {
                    if (line ~ /\*\//) {
                        sub(/^.*\*\//, "", line)
                        sub(/^[ \t]+/, "", line)
                        if (line != "" && line != "}") n++
                        next
                    }
                    inblock = 1
                    next
                }
                n++
            }
            END { print n }
        ' "$f")
        if [ "$exec_lines" -gt "$MAX_EXEC" ] && ! grep -q 'line-budget-exempt:' "$f"; then
            echo "$rel is $exec_lines executable lines (max $MAX_EXEC; split it, or add 'line-budget-exempt: <reason>')"
        fi
    done
)

if [ -n "$violations" ]; then
    printf '%s\n' "$violations" | sed 's/^/line-budget(gui): /' >&2
    exit 1
fi
echo "line-budget(gui): OK ($count files scanned)"

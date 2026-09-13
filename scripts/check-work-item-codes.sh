#!/bin/sh
# Work-item codes must not reach the tracked tree.
#
# `GUnn`, `GUI-nn`, `DFn` and friends name entries in the forward-looking set
# (`~/shojiku-work/`), which is local-only and whose entries are DELETED when
# the work ships. So a code in a tracked file points at nothing the moment it
# lands — six comments naming one GUI item outlived their queue entry exactly
# that way.
#
# The examples above are spelled with `n` where a digit belongs ON PURPOSE.
# This file is in the population it scans, so a real code in its own prose
# would make it report itself — which it did, the first time it was staged,
# and only then: untracked, it was invisible to its own `git ls-files` walk.
# Five skills and the queue's own conventions block say describe by SUBSTANCE;
# until this script existed that rule was enforced only by an EDIT-TIME hook,
# which cannot see what is already in the tree and does not fire for an edit
# made outside Claude Code.
#
# The population is TRACKED TEXT. Both halves are load-bearing: a naive
# `grep -rE` over the worktree returns ~220 hits, of which the overwhelming
# majority are byte runs inside fonts, `.wasm`, PNGs and PDFs, plus untracked
# build output under `engine/target/` and `node_modules/`. A gate reporting
# those is a gate that gets silenced.
set -eu

cd "$(dirname "$0")/.."

# The families, kept in step with `.claude/hooks/guard-edit.sh` — the hook stops
# a code being WRITTEN, this stops one that already got in, and they are only
# the same rule while they match the same thing.
BARE='(GU|GD|TB|FP|BX|DF|FR|GL|GS|EQ|GC|FV|FM|MK|TL|KC)[0-9]+[a-z]?'
NAMED='(GUI|ENGINE|MAKE|RELEASE|SDK|SITE|MCP|WASM|SKILL|DOC)-[0-9]+[a-z]?'
PATTERN="\\b(${BARE}|${NAMED})\\b"

# Excluded by PATH, never by pattern. Both of these must CONTAIN codes to do
# their job — one documents which families it matches, the other is the fixture
# proving the hook sees them — and narrowing the pattern to spare them would
# blind the gate to the real thing.
is_guard() {
  case "$1" in
    .claude/hooks/guard-edit.sh | scripts/check-hooks.sh) return 0 ;;
    *) return 1 ;;
  esac
}

found=''
count=0
# -I skips binaries; `git ls-files` is what restricts this to the tracked tree.
for hit in $(git ls-files -z | xargs -0 grep -InE "$PATTERN" 2>/dev/null | cut -d: -f1-2 | tr ' ' '\037'); do
  file=${hit%%:*}
  is_guard "$file" && continue
  found="$found$(printf '%s' "$hit" | tr '\037' ' ')
"
  count=$((count + 1))
done

if [ "$count" -gt 0 ]; then
  # Say WHAT was found, not just that something was. A step that exits silently
  # names neither the file nor the rule, and the next reader has to re-derive
  # both from the target's name.
  echo "work-item codes in the tracked tree ($count):" >&2
  printf '%s' "$found" >&2
  cat >&2 <<'MSG'

Work-item codes live only in the forward-looking set (~/shojiku-work/), whose
entries are deleted when the work ships — so these point at nothing. Rewrite
each to say what it MEANS: the reason a test exists is worth keeping, the code
that names it is not.
MSG
  exit 1
fi

echo "work-item codes: none in the tracked tree"

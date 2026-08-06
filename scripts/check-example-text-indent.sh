#!/usr/bin/env bash
# Fails when a bundled template indents a block scalar with ordinary
# spaces or tabs.
#
# Wrapped text collapses whitespace at a line head the way CSS does — see
# `leading_spaces_never_start_a_line` in engine/layout — so a `text: |-`
# code sample indented with real spaces renders FLUSH LEFT. Tabs go the
# same way: the wrap tokenizer folds a tab into the same space run. Hard
# indentation has to be written with no-break spaces (U+00A0); the rule
# is stated in docs/engine/text.md.
#
# Nothing else catches it. The template still parses, the render emits no
# diagnostic, and `make examples` stays green on the wrong-looking page —
# only a human reading the preview PNG sees it. Eight of the layout
# showcase's forty-four code panels shipped that way, which is what this
# gate exists to stop.
#
# The rule: inside a block scalar, no content line may carry MORE leading
# spaces-or-tabs than the block's first content line. That is the same
# thing as "the line starts with an ordinary space or a tab", and it
# needs no multibyte handling — a no-break space is neither, so a
# correctly indented line sits exactly at the base. Nothing here spells
# U+00A0, so the check cannot be broken by a literal that fails to
# survive transport into an editor.
#
# WAIVER: not every block scalar is wrapped text. `char_grid` takes the
# same `text:` key but never reaches the wrapper — it fills cells
# verbatim, so a leading space is a real, occupied cell (a 原稿用紙
# 1字下げ). Some block scalars are not rendered by the engine at all
# (gallery blurbs are web prose). For those, put
# `text-indent-exempt: <reason>` in a comment on the opener line and the
# block is counted but not checked.
#
# Fix a real failure by replacing each level of leading whitespace with
# two no-break spaces, keeping every line at the block's base indent.
#
# Usage: check-example-text-indent.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The detector. Reports one `path:line: message` per offending line, then
# a trailing `#blocks <n>` so the caller can tell "clean" from "scanned
# nothing". Held in a variable because the self-test below runs the very
# same program — a detector that silently stopped detecting would
# otherwise report OK forever, which is the one failure this gate cannot
# afford.
#
# NOTE: no apostrophes and no backticks anywhere in this program. It is a
# single-quoted shell string, and one stray quote ends it and turns the
# rest into live shell.
DETECT='
  FNR == 1 { state = 0 }

  # Tabs count as indentation: the wrap tokenizer folds a tab into the
  # same space run as a plain space and drops that run at a line head, so
  # a tab-indented sample collapses flush left exactly like a
  # space-indented one. A no-break space is in neither class, which is
  # what keeps a correct line sitting at the base.
  {
    match($0, /^[ \t]*/)
    indent = RLENGTH
    blank = ($0 ~ /^[ \t]*$/)
  }

  # Inside a block scalar.
  state != 0 {
    if (blank) next
    # The first content line sets the base — unless it is already back at
    # (or left of) the opener, which means the block was empty. Falling
    # through matters there: that line may itself be the next opener, and
    # consuming it would silently shrink the scanned count.
    if (state == 1) {
      if (indent > openind) { base = indent; state = 2; next }
      state = 0
    } else if (indent >= base) {
      if (indent > base && !waived) {
        name = FILENAME
        if (root != "" && substr(name, 1, length(root)) == root)
          name = substr(name, length(root) + 1)
        printf "%s:%d: block scalar indented with ordinary spaces or tabs (use U+00A0, or waive with text-indent-exempt)\n", name, FNR
      }
      next
    } else {
      state = 0   # dedented out; fall through and re-test this line
    }
  }

  # A block scalar opener. The key part is deliberately loose (anything
  # up to the colon that is not whitespace, a colon or a hash) so a
  # quoted key or a hyphenated one such as zh-cn cannot slip past
  # unscanned — a missed opener is a silent per-block fail-open, and the
  # blocks total only reveals a scan that reached nothing at all.
  /^[ \t]*(- )*[^:#[:space:]]+:[ \t]*[|>][-+0-9]*[ \t]*(#.*)?$/ {
    blocks++
    state = 1
    openind = indent
    waived = ($0 ~ /text-indent-exempt/)
    # An explicit indentation indicator (|2, >-3) lets the first content
    # line be DEEPER than the rest, which breaks the base-from-first-line
    # model and would silently truncate the scan. There are none in the
    # tree; refuse rather than mis-scan.
    if ($0 ~ /[|>][-+]*[0-9]/) {
      name = FILENAME
      if (root != "" && substr(name, 1, length(root)) == root)
        name = substr(name, length(root) + 1)
      printf "%s:%d: block scalar with an explicit indentation indicator is not supported by this check\n", name, FNR
    }
  }

  END { printf "#blocks %d\n", blocks }
'

# Self-test: the detector must still fire on the known-bad shapes.
# Without this the gate fails OPEN — break the regex and every run
# reports OK. The fixture carries the space form, the tab form and a
# hyphenated key, so none of those holes can reopen silently; it also
# means an awk that mishandles a tab in a bracket expression fails here
# loudly instead of passing every tab-indented panel. The waived block
# must NOT count, or the escape hatch is not really wired.
selftest=$(mktemp)
trap 'rm -f "$selftest"' EXIT
{
  printf 'good: |-\n  - type: text\n'
  printf 'bad_space: |-\n  - type: text\n    style: { a: b }\n'
  printf 'bad_tab: |-\n  - type: text\n  \tstyle: { a: b }\n'
  printf 'zh-cn: |-\n  - type: text\n    style: { a: b }\n'
  printf 'waived: |-  # text-indent-exempt: self-test\n  - type: text\n    style: { a: b }\n'
} > "$selftest"
selftest_hits=$(awk -v root='' "$DETECT" "$selftest" | grep -c ': block scalar ' || true)
if [ "$selftest_hits" -ne 3 ]; then
  echo "FAIL self-test: the detector found $selftest_hits offending lines in a fixture with exactly 3"
  exit 1
fi

# Bundled templates (examples/) plus the copies skills ship for a
# standalone `npx skills add` install. NUL-separated so a path with a
# space cannot split into two bogus filenames.
list=$(mktemp)
trap 'rm -f "$selftest" "$list"' EXIT
find "$ROOT/examples" "$ROOT/skills" \
  \( -name '*.yml' -o -name '*.yaml' \) -type f -print0 | sort -z > "$list"

file_count=$(tr -dc '\0' < "$list" | wc -c | tr -d ' ')

# An empty list would leave awk reading stdin — it would hang, not fail.
if [ "$file_count" -eq 0 ]; then
  echo "FAIL no YAML found under examples/ or skills/ — the scan globbed nothing"
  exit 1
fi

report=$(xargs -0 awk -v root="$ROOT/" "$DETECT" < "$list")

blocks=$(printf '%s\n' "$report" | sed -n 's/^#blocks //p')
offenders=$(printf '%s\n' "$report" | grep -v '^#blocks ' || true)

echo "scanned $file_count YAML files, $blocks block scalars"

# A scan that matched nothing would report "clean" for the wrong reason.
if [ "${blocks:-0}" -eq 0 ]; then
  echo "FAIL scanned $file_count files but found no block scalars — the scan is broken, not the templates"
  exit 1
fi

if [ -n "$offenders" ]; then
  echo "$offenders"
  count=$(printf '%s\n' "$offenders" | wc -l | tr -d ' ')
  echo "FAIL $count block scalar line(s) rejected — wrapped text drops leading spaces and tabs, so they render flush left"
  exit 1
fi

echo "OK no block scalar is indented with ordinary spaces or tabs"

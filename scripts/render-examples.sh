#!/usr/bin/env bash
# Renders every bundled example (output.pdf + preview-<n>.png).
#
# An example may also ship PARAMS VARIANTS: any `params-<variant>.json`
# beside the default `params.json` renders `output-<variant>.pdf` +
# `preview-<variant>-<n>.png` from the SAME templates/definitions — the
# blank↔filled rirekisho pair is the driving case (one form, two data files).
#
# Default: write the outputs into each examples/<name>/ directory
#          (this is what `make examples` runs).
# --check: render into a temp dir and byte-compare against the committed
#          outputs; any mismatch, missing, or stale file fails. Rendering
#          is deterministic (same input + engine => same bytes), so a
#          diff means rendered output changed without `make examples`
#          being re-run (CI job "examples" runs this).
#
# Usage: render-examples.sh [--check] [path/to/shojiku]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODE=render
if [ "${1:-}" = "--check" ]; then
  MODE=check
  shift
fi
BIN="${1:-$ROOT/engine/target/release/shojiku}"
export SHOJIKU_FONT_DIR="${SHOJIKU_FONT_DIR:-$ROOT/packs/fonts}"
export SHOJIKU_LOCALE_DIR="${SHOJIKU_LOCALE_DIR:-$ROOT/packs/locale}"

# Paths are `<bucket>/<name>` — examples/ is grouped by document kind
# (business / forms / typography / presets / dev), and every path below is
# joined onto $ROOT/examples/, so the slash needs no special handling.
EXAMPLES="business/invoice-ja business/invoice-en business/estimate-ja
          business/delivery-note-ja business/pickup-slip-ja
          business/event-tickets-ja business/catalog-ja
          business/shipping-labels-ja business/restaurant-menu-us
          business/receipt-ja business/receipt-us
          business/receipt-zh-tw business/receipt-zh-cn
          business/receipt-hi-in business/receipt-fil-ph
          forms/application-form-ja forms/rirekisho-ja
          forms/certificate-ja forms/certificate-en
          typography/kokugo-print-ja typography/novel-ja
          typography/genkoyoshi-ja typography/genkoyoshi-yoko-ja
          dev/layout-showcase
          presets/blank-a4 presets/blank-a4-en presets/blank-letter-us
          presets/blank-letter-fil presets/blank-a4-zh-tw
          presets/blank-a4-zh-cn presets/blank-a4-hi"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0

# Renders ONE params file of an example into $out with the given output
# basenames. $1 example name, $2 output dir, $3 params file, $4 pdf name,
# $5 preview pattern (a `{page}` template).
render_params() {
  local d="$ROOT/examples/$1" out="$2" params="$3" pdf="$4" preview="$5"
  # An example name is `<bucket>/<name>`, so flatten the slash: the diagnostics
  # scratch file is a FLAT path in $tmp, which has no bucket subdirectories.
  local err="$tmp/${1//\//-}.err"
  # definitions.yml is optional (the CLI treats it as such) — a blank
  # preset ships without one.
  local defs=()
  if [ -f "$d/definitions.yml" ]; then
    defs=(--definitions "$d/definitions.yml")
  fi
  # `${defs[@]+...}` keeps the empty-array expansion safe under `set -u`
  # on old bash (3.2) too.
  "$BIN" render ${defs[@]+"${defs[@]}"} \
    --templates "$d/templates.yml" --params "$params" \
    --output "$out/$pdf" 2> "$err" || { cat "$err"; return 1; }
  if [ -s "$err" ]; then
    echo "$1: render emitted diagnostics:" && cat "$err" && return 1
  fi
  "$BIN" preview ${defs[@]+"${defs[@]}"} \
    --templates "$d/templates.yml" --params "$params" \
    --output "$out/$preview" 2> "$err" || { cat "$err"; return 1; }
  if [ -s "$err" ]; then
    echo "$1: preview emitted diagnostics:" && cat "$err" && return 1
  fi
}

render_into() { # $1 = example name, $2 = output dir
  local d="$ROOT/examples/$1"
  render_params "$1" "$2" "$d/params.json" "output.pdf" "preview-{page}.png" || return 1
  # Params variants: `params-<variant>.json` → `output-<variant>.pdf` +
  # `preview-<variant>-<n>.png` from the same templates/definitions.
  local pf variant
  for pf in "$d"/params-*.json; do
    [ -e "$pf" ] || continue
    variant="$(basename "$pf" .json)"
    variant="${variant#params-}"
    render_params "$1" "$2" "$pf" \
      "output-$variant.pdf" "preview-$variant-{page}.png" || return 1
  done
}

for ex in $EXAMPLES; do
  d="$ROOT/examples/$ex"
  if [ "$MODE" = render ]; then
    echo "== $ex =="
    rm -f "$d"/output.pdf "$d"/output-*.pdf "$d"/preview-*.png
    render_into "$ex" "$d"
  else
    mkdir -p "$tmp/$ex"
    render_into "$ex" "$tmp/$ex"
    # fresh render vs committed: every fresh file must match a committed
    # one, and no committed output may be left over from an older render.
    # The globs cover the default outputs AND every params-variant's
    # `output-<v>.pdf` / `preview-<v>-<n>.png`.
    for f in "$tmp/$ex"/output.pdf "$tmp/$ex"/output-*.pdf "$tmp/$ex"/preview-*.png; do
      [ -e "$f" ] || continue
      name="$(basename "$f")"
      if ! cmp -s "$f" "$d/$name"; then
        echo "MISMATCH examples/$ex/$name — re-run 'make examples' and commit the refreshed outputs"
        fail=1
      fi
    done
    for f in "$d"/output.pdf "$d"/output-*.pdf "$d"/preview-*.png; do
      [ -e "$f" ] || continue
      name="$(basename "$f")"
      if [ ! -f "$tmp/$ex/$name" ]; then
        echo "STALE examples/$ex/$name — no longer produced; re-run 'make examples'"
        fail=1
      fi
    done
    echo "== $ex ok"
  fi
done

[ "$fail" -eq 0 ] || exit 1
[ "$MODE" = check ] && echo "example outputs match a fresh render"
exit 0

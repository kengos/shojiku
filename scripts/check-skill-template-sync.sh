#!/usr/bin/env bash
# Fails when a skill's bundled template drifts from the example that CI
# actually renders.
#
# A product-facing skill under skills/ may ship a ready-made template so
# it still works when installed standalone (`npx skills add …`), outside
# a Shojiku checkout. That copy is the one a user's agent runs — and it
# is the copy no gate would otherwise look at, because `make examples`
# only renders examples/. Keeping the two byte-identical means the
# rendered-and-hash-checked example IS the proof for the shipped copy.
#
# Same shape as the README gallery: one source of truth, a generated
# consumer, and a gate that refuses drift. Fix a failure by copying the
# example's file over the skill's — the example is the source, since it
# is what `make examples` renders.
#
# Usage: check-skill-template-sync.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# `<skill> <example>` pairs; every *.yml in the skill's template/ dir must
# match the same-named file in the example dir.
PAIRS="shojiku-recipe-booklet:lifestyle/recipe-booklet-en"

fail=0
for pair in $PAIRS; do
  skill="${pair%%:*}"
  example="${pair#*:}"
  skill_dir="$ROOT/skills/$skill/template"
  example_dir="$ROOT/examples/$example"

  if [ ! -d "$skill_dir" ]; then
    echo "MISSING skills/$skill/template — the pair table names it"
    fail=1
    continue
  fi

  for f in "$skill_dir"/*.yml; do
    [ -e "$f" ] || continue
    name="$(basename "$f")"
    if [ ! -e "$example_dir/$name" ]; then
      echo "MISSING examples/$example/$name — skills/$skill/template/$name has no source"
      fail=1
    elif ! cmp -s "$f" "$example_dir/$name"; then
      echo "DRIFT skills/$skill/template/$name != examples/$example/$name"
      echo "  fix: cp examples/$example/$name skills/$skill/template/$name"
      fail=1
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "skill templates in sync"

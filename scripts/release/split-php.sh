#!/bin/sh
# Produce the commits of the derived php repository (kengos/shojiku-php).
#
#   scripts/release/split-php.sh
#
# Writes dist/release/php-split.txt — one `main <sha>` line plus one
# `tag <name> <sha>` line per release tag — and prints the same to stdout.
#
# WHY A DERIVED REPO EXISTS AT ALL. Packagist resolves `composer.json` from
# the repository ROOT; this repo keeps it at sdk/php/composer.json, so the
# monorepo can never be listed. Moving the manifest to the root instead would
# claim the whole monorepo as the php package and drag every font pack into
# `composer require`, so the standard monorepo path applies: publish a derived
# repository that Packagist tracks.
#
# SPLIT ONLY — nothing here pushes, tags a remote, or talks to a registry,
# which is the same boundary scripts/release/assemble.sh states. Producing the
# commits is mechanical and rerunnable; publishing them is the irreversible
# half and stays in the workflow.
#
# THE DERIVED REPO IS A STRICT MIRROR OF THIS ONE'S RELEASE TAGS. Every tag
# it carries is a tag that already exists here, so it can never serve a
# version the monorepo has not released — which matters because the release
# procedure creates the tag only AFTER a green publish run, by publishing the
# draft GitHub Release.
#
# `git subtree split` is a pure function of the commit graph, so re-running it
# reproduces the same shas: the push is a fast-forward and the tags are
# stable. The tree assertions below are what prove that per run rather than
# assuming it.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PREFIX=sdk/php
OUT="$ROOT/dist/release/php-split.txt"

cd "$ROOT"

# A shallow clone silently produces a truncated history rather than failing,
# which would then be force-pushed over the real one.
[ "$(git rev-parse --is-shallow-repository)" = false ] || {
  echo "split-php: this is a shallow clone — the split needs the full history (fetch-depth: 0)" >&2
  exit 1
}

# The split commit's ROOT tree must be byte-identical to the subdirectory's
# tree at the same ref. That is the whole correctness claim, and git answers
# it by object id rather than by diffing files.
assert_tree() { # $1 = ref, $2 = split sha
  want=$(git rev-parse "$1:$PREFIX")
  got=$(git rev-parse "$2^{tree}")
  [ "$want" = "$got" ] || {
    echo "split-php: $1 split to $2, whose tree $got is not $PREFIX's tree $want" >&2
    exit 1
  }
}

mkdir -p "$(dirname "$OUT")"
: > "$OUT"

echo "== split $PREFIX =="

head_sha=$(git subtree split -q --prefix="$PREFIX" HEAD)
assert_tree HEAD "$head_sha"
echo "main $head_sha" >> "$OUT"
echo "  main <- HEAD  $head_sha"

# The published package's root is what a Packagist visitor reads, so the files
# that make it installable and legible have to BE there. None of them is
# guaranteed by the split — they are ordinary tracked files a later change
# could move or rename, and the split would happily produce a root without them.
for required in composer.json README.md LICENSE-MIT LICENSE-APACHE LICENSE-BSD; do
  git rev-parse --verify -q "$head_sha:$required" >/dev/null || {
    echo "split-php: $required is missing from the split root (expected at $PREFIX/$required)" >&2
    exit 1
  }
done
echo "  root carries composer.json, README.md and the three licenses"

tags=0
for tag in $(git tag -l 'v*' | sort -V); do
  # A tag from before the php SDK existed has no subdirectory to split.
  git rev-parse --verify -q "$tag:$PREFIX" >/dev/null || {
    echo "  skip $tag — no $PREFIX at that tag"
    continue
  }
  sha=$(git subtree split -q --prefix="$PREFIX" "$tag")
  assert_tree "$tag" "$sha"
  # A tag that is not an ancestor of main would publish a version whose
  # history the package cannot reach — the shape a synthetic per-release
  # commit produces, and the reason this repo splits the real history.
  git merge-base --is-ancestor "$sha" "$head_sha" || {
    echo "split-php: $tag split to $sha, which is not an ancestor of the main split" >&2
    exit 1
  }
  echo "tag $tag $sha" >> "$OUT"
  echo "  $tag <- $tag  $sha"
  tags=$((tags + 1))
done

echo "  $tags release tag(s) split"
echo "manifest: $OUT"

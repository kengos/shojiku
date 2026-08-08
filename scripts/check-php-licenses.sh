#!/bin/sh
# The php SDK carries its own copy of the license set; this compares the
# copies against the originals at the repository root.
#
# WHY THE COPIES EXIST. sdk/php reaches Packagist through a derived
# subtree-split repository (scripts/release/split-php.sh), whose root is
# whatever `git subtree split --prefix=sdk/php` produces. A split cannot
# inject files, so a license living only at the repo root is simply ABSENT
# from the published package — the one artifact a Packagist visitor reads.
# The same reasoning already puts these three files inside every CLI archive
# (scripts/release/assemble.sh).
#
# WHY IT IS A GATE. Nothing else compares them, so a root license that is
# edited, relicensed or ADDED leaves a stale or missing copy in a package
# that ships to the public. The file list is DERIVED from the root rather
# than written here, which is what makes a fourth license a failure instead
# of a silent omission.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/sdk/php"

echo "== php license copies =="

found=0
stale=""
for src in "$ROOT"/LICENSE-*; do
  [ -f "$src" ] || continue
  found=$((found + 1))
  name="${src##*/}"
  if [ ! -f "$DEST/$name" ]; then
    stale="$stale  MISSING  sdk/php/$name
"
  elif ! cmp -s "$src" "$DEST/$name"; then
    stale="$stale  DIFFERS  sdk/php/$name
"
  fi
done

# A zero here means the glob matched nothing — in which case every comparison
# below was skipped and the check would have reported success having read no
# files at all. The count is the evidence that it looked.
[ "$found" -gt 0 ] || {
  echo "check-php-licenses: no LICENSE-* at the repository root — the check read nothing" >&2
  exit 1
}
echo "  compared $found license files against sdk/php/"

[ -z "$stale" ] || {
  echo "check-php-licenses: the php SDK license copies are out of date:" >&2
  printf '%s' "$stale" >&2
  echo "  fix: cp $ROOT/LICENSE-* $DEST/" >&2
  exit 1
}
echo "  every copy matches its root original"

#!/bin/sh
# Published-install proof, python: `pip install shojiku` from PyPI itself.
#
# The sibling python.sh proves the package SHAPE by building it here; this
# proves the thing actually on the registry. Nothing local is staged — if the
# published wheel is missing its payload, or the platform tags do not match
# what pip resolves for this container, only this catches it.
. "$(dirname "$0")/common.sh"

IMG="python:${PYTHON_VER:-3.11}-slim-bookworm"
SPEC="shojiku${SHOJIKU_VERSION:+==$SHOJIKU_VERSION}"

echo "== published-install proof (python, $IMG, $SPEC) =="

cat > "$WORK/proof.py" <<'PY'
import json
import os
import pathlib

import shojiku

assert "SHOJIKU_LIBRARY" not in os.environ, "void: a library was injected"
assert not pathlib.Path("/opt/shojiku").exists(), "void: an engine exists outside the package"

client = shojiku.Client(
    templates="/ex", font_dirs=["/packs/fonts"], locale_dirs=["/packs/locale"]
)
result = client.generate(
    "receipt-ja", json.load(open("/ex/receipt-ja/params.json"))
)
if not result.success:
    raise SystemExit(f"FAILED: {result.failure.kind} | {result.failure.message}")
pathlib.Path("/w/out.pdf").write_bytes(result.artifact.bytes)
PY

docker run --rm -e SPEC="$SPEC" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  pip install -q "$SPEC"
  # Name the wheel that actually resolved: a none-any fallback installs
  # cleanly and fails at render, so the resolved file IS the evidence.
  pip show -f shojiku | grep -E "^(Name|Version|Location)"
  python -c "import shojiku,pathlib;print(\"native:\",[p.name for p in (pathlib.Path(shojiku.__file__).parent/\"native\").glob(\"*\")])"
  python /w/proof.py'

assert_pdf "$WORK/out.pdf"

#!/bin/sh
# Install proof, python: wheel with the cdylib as package data, pip-installed
# into a clean floor-version container. See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

IMG="python:${PYTHON_VER:-3.11}-slim-bookworm"
require_artifact "$CAPI_LIB" engine:capi-lib

echo "== install proof (python, $IMG) =="

# Stage the package source and embed the payload exactly where a release
# platform wheel carries it: as package data under shojiku/native/.
cp -R "$ROOT/sdk/python" "$WORK/src"
mkdir -p "$WORK/src/src/shojiku/native"
cp "$CAPI_LIB" "$WORK/src/src/shojiku/native/"

docker run --rm -v "$WORK:/w" -w /w/src "$IMG" sh -euc '
  pip install -q build hatchling
  python -m build --wheel --outdir /w/wheel >/dev/null
  python - <<PY
import glob, sys, zipfile
wheel = glob.glob("/w/wheel/*.whl")[0]
names = zipfile.ZipFile(wheel).namelist()
hits = [n for n in names if "/native/" in n]
print("payload in wheel:", hits)
sys.exit(0 if hits else 1)
PY'

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

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  pip install -q --no-index /w/wheel/*.whl
  python /w/proof.py'

assert_pdf "$WORK/out.pdf"

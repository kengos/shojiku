#!/bin/sh
# Deploy-recipe proof, python: examples/deploy/python builds and renders
# against the PUBLIC registry — including the SQLite-params shape (seed.py
# builds the DB at image build; render.py composes rows over the example's
# static params, staged here as params-base.json).
. "$(dirname "$0")/common.sh"
. "$(dirname "$0")/deploy-common.sh"
stage_recipe python
stage_python_base
echo "== deploy-recipe proof (python) =="
docker build -q -t shojiku-deploy-python:proof "$WORK"
docker run --rm shojiku-deploy-python:proof > "$WORK/out.pdf"
assert_pdf "$WORK/out.pdf"

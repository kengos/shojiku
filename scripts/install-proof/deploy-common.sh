#!/bin/sh
# Shared staging for the DEPLOY-recipe proofs (sourced after common.sh):
# copy one recipe dir into $WORK, stage the template + packs beside it the
# way a real app repo would vendor them, docker-build the recipe, run the
# image, and assert the stdout is a PDF. Network-dependent by nature (the
# recipe installs from the public registry), so on demand like the
# published-* proofs — never part of `make verify`.
stage_recipe() {
  lang="$1"
  cp -R "$ROOT/examples/deploy/$lang/." "$WORK/"
  mkdir -p "$WORK/templates"
  cp -R "$ROOT/examples/business/receipt-ja" "$WORK/templates/receipt-ja"
  cp -R "$ROOT/packs" "$WORK/packs"
}

run_recipe() {
  lang="$1"
  echo "== deploy-recipe proof ($lang) =="
  stage_recipe "$lang"
  docker build -q -t "shojiku-deploy-$lang:proof" "$WORK"
  docker run --rm "shojiku-deploy-$lang:proof" > "$WORK/out.pdf"
  assert_pdf "$WORK/out.pdf"
}

# The python recipe composes its DB rows over the example's static params.
stage_python_base() {
  cp "$ROOT/examples/business/receipt-ja/params.json" "$WORK/params-base.json"
}

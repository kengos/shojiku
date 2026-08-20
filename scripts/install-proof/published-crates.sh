#!/bin/sh
# Published-install proof, rust: `cargo install shojiku-cli` from crates.io.
#
# This resolves the whole 17-crate graph FROM THE REGISTRY, which is a
# different path than the workspace build every gate uses — a member whose
# published manifest is missing a version, a feature, or a file that
# `include`/`exclude` dropped from the .crate archive fails only here.
# See published-python.sh for the rest of the rationale.
. "$(dirname "$0")/common.sh"

IMG="rust:${RUST_VER:-1.97.1}-slim-bookworm"
SPEC="--version $PROOF_VERSION"

echo "== published-install proof (rust, $IMG) =="

docker run --rm -e SPEC="$SPEC" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  test ! -e /opt/shojiku || { echo "void: an engine exists outside the package" >&2; exit 1; }
  cargo install shojiku-cli $SPEC --root /w/install
  /w/install/bin/shojiku --version
  # Rendered from the INSTALLED binary, with the packs supplied the way any
  # consumer supplies them — the crate ships no fonts.
  /w/install/bin/shojiku render \
    --definitions /ex/receipt-ja/definitions.yml \
    --templates /ex/receipt-ja/templates.yml \
    --params /ex/receipt-ja/params.json \
    --font-dir /packs/fonts --locale-dir /packs/locale \
    --output /w/out.pdf'

assert_pdf "$WORK/out.pdf"

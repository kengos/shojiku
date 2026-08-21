# Production packaging recipes

One Dockerfile per published SDK: install Shojiku from the public
registry, vendor the template + font/locale packs into the image, render
at container start. The homepage's tutorial pages transclude THESE files
(never hand-copied snippets), and `make proof:deploy` runs each recipe
against the real registry (network-dependent, so on demand — the same
doctrine as the published-install proofs).

Each recipe's build context is staged by `scripts/install-proof/deploy-<lang>.sh`:
`templates/receipt-ja/` (the bundled example) and `packs/` (the repo's
packs) land next to the Dockerfile, standing in for the app repo a real
user would vendor them into. The python recipe additionally pulls its
params out of a bundled SQLite database (`seed.py` builds it at image
build) — the "params come from your DB" shape.

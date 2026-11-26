# Browser golden-path image for the production WASM bindings. Build context is
# the REPOSITORY ROOT:
#   docker build -f engine/wasm/e2e/Dockerfile -t shojiku-wasm-e2e .
#   docker run --rm -p 8789:80 shojiku-wasm-e2e
# Serves the wasm module + the en-US font packs + the receipt-us example.

FROM rust:1.100.0-slim-bookworm AS builder
RUN rustup target add wasm32-unknown-unknown

# wasm-bindgen CLI must match the crate version pinned in engine/Cargo.toml.
ARG WASM_BINDGEN_VERSION=0.2.126
# Delete cargo's downloaded crates ($CARGO_HOME/registry, $CARGO_HOME/git) in
# the same RUN instruction as `cargo install`: a file that a later RUN
# instruction deletes still exists in the layer of this RUN instruction, so the
# downloaded crates would stay in the build cache. The installed wasm-bindgen
# binary is in $CARGO_HOME/bin and is not deleted. `${CARGO_HOME:?}` makes the
# RUN instruction fail when CARGO_HOME is unset, instead of running
# `rm -rf /registry /git`.
RUN cargo install wasm-bindgen-cli --version =${WASM_BINDGEN_VERSION} --locked \
 && rm -rf "${CARGO_HOME:?}/registry" "${CARGO_HOME:?}/git"

WORKDIR /app
COPY engine ./engine
WORKDIR /app/engine
# Build the wasm module, generate the JS bindings into /out/pkg, and delete
# target/ and cargo's downloaded crates ($CARGO_HOME/registry, $CARGO_HOME/git)
# in one RUN instruction. wasm-bindgen reads the .wasm file from target/, so
# wasm-bindgen runs before the deletion. A file that a later RUN instruction
# deletes still exists in the layer of the earlier RUN instruction, so deleting
# target/ in a separate RUN instruction would keep target/ in the build cache.
RUN cargo build -p shojiku-wasm --profile wasm-release \
      --target wasm32-unknown-unknown --locked \
 && wasm-bindgen --target web --out-dir /out/pkg \
      target/wasm32-unknown-unknown/wasm-release/shojiku_wasm.wasm \
 && ls -l /out/pkg \
 && rm -rf target "${CARGO_HOME:?}/registry" "${CARGO_HOME:?}/git"

FROM nginx:alpine
COPY engine/wasm/e2e/web /usr/share/nginx/html
COPY --from=builder /out/pkg /usr/share/nginx/html/pkg
# The en-US locale's font packs (manifest + faces), served under ./fonts/<id>/.
COPY packs/fonts/noto-sans /usr/share/nginx/html/fonts/noto-sans
COPY packs/fonts/noto-sans-mono /usr/share/nginx/html/fonts/noto-sans-mono
COPY examples/business/receipt-us/templates.yml \
     examples/business/receipt-us/params.json \
     examples/business/receipt-us/definitions.yml \
     /usr/share/nginx/html/example/
RUN printf 'gzip on;\ngzip_comp_level 6;\ngzip_types application/wasm font/ttf application/javascript application/json text/yaml;\n' \
    > /etc/nginx/conf.d/gzip.conf

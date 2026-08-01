# Self-contained serving image for the standalone Designer app: builds the
# wasm module, builds + assembles the app, and serves the static output
# (index + JS + the data/ tree: catalog, fonts, presets, wasm pkg). Used by
# `make gui-serve` (local run) and the `make gui-e2e` golden path.
# Build context = the REPOSITORY ROOT:
#   docker build -f gui/designer-app/Dockerfile -t shojiku-designer-app:local .
#   docker run --rm -p 8788:80 shojiku-designer-app:local

FROM rust:1.97.1-slim-bookworm AS wasm
RUN rustup target add wasm32-unknown-unknown
ARG WASM_BINDGEN_VERSION=0.2.126
RUN cargo install wasm-bindgen-cli --version =${WASM_BINDGEN_VERSION} --locked
WORKDIR /app
COPY engine ./engine
WORKDIR /app/engine
RUN cargo build -p shojiku-wasm --profile wasm-release --target wasm32-unknown-unknown --locked
RUN wasm-bindgen --target web --out-dir /out/pkg \
      target/wasm32-unknown-unknown/wasm-release/shojiku_wasm.wasm

FROM node:24-bookworm-slim AS app
RUN corepack enable
WORKDIR /repo
COPY gui ./gui
COPY packs ./packs
COPY examples ./examples
COPY --from=wasm /out/pkg ./engine/wasm/pkg
WORKDIR /repo/gui
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @shojiku/designer-app build
RUN pnpm --filter @shojiku/designer-app assemble

FROM nginx:alpine
COPY --from=app /repo/gui/designer-app/dist /usr/share/nginx/html
RUN printf 'gzip on;\ngzip_comp_level 6;\ngzip_types application/wasm application/javascript application/json font/ttf text/yaml;\n' \
    > /etc/nginx/conf.d/gzip.conf

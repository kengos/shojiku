# The Node SDK's gate environment.
#
# Nobody needs Node installed to work on this package: `make sdk-js` builds and
# runs this image, exactly as the Rust and gui gates run in theirs.
#
# The engine is INJECTED as a pre-compiled artifact (built once by `make napi`
# through the pinned Rust image) rather than compiled from Rust source here.
# Seven language images each building the engine would make the gate grid
# unusable. Note WHICH artifact: node is the one SDK that does not load the
# shared C ABI cdylib — it has no stdlib FFI — so what arrives here is the
# native addon, `shojiku.node`.
#
# Two things this file has to get right, both of which fail confusingly:
#
#   * the repository root `.dockerignore` excludes `sdk`, so this build sees
#     nothing of the package it exists to test. The sidecar
#     `Dockerfile.dockerignore` beside this file REPLACES that root file for
#     this build and re-admits what is needed.
#   * the addon has to load against this image's libc. Bookworm here, bookworm
#     in the Rust image — a musl base would load nothing.
#
# Node 22 is the FLOOR from docs/agents/sdk.md, and the floor is what the gate
# runs on: a package that only works on the newest runtime has not actually
# supported the version it claims.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk-js` gates on.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-bookworm-slim

# openssl is the test-key generator's only dependency
# (scripts/gen-test-keys.sh, shared with the Rust suites).
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# pnpm, at the version `packageManager` in sdk/js/package.json declares — the
# Makefile reads it out of that file and passes it here, so the declaration
# stays the single source of truth. Installed directly rather than through
# corepack, which Node stopped bundling at 25 and which exists only to do this
# same job.
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}

# Outside /repo on purpose: the gate mounts the repository over /repo, and an
# addon that lived there would be hidden by the mount.
COPY dist/napi/local/shojiku.node /opt/shojiku/lib/shojiku.node
ENV SHOJIKU_LIBRARY=/opt/shojiku/lib/shojiku.node

WORKDIR /pkg
# Only what resolves the dependency graph, so a change to src/ or test/ does
# not re-run the install.
COPY sdk/js/package.json sdk/js/pnpm-lock.yaml sdk/js/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# The gate runs against the MOUNTED source tree, using the dependency store the
# layer above resolved. The link is made at run time, by the recipe, and cannot
# be baked in here: the mount lands on top of /repo afterwards and would bury
# it. It has to be a real `node_modules` beside the package rather than
# NODE_PATH — ESM resolution does not consult NODE_PATH at all, so a vitest
# config importing `vitest/config` would not resolve.
WORKDIR /repo/sdk/js
ENV PATH=/pkg/node_modules/.bin:$PATH
CMD ["sh", "-euc", "ln -sfn /pkg/node_modules node_modules; pnpm run test"]

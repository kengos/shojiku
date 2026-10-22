# The toolchain image the engine gates run in: rust with the components, the
# wasm32 target and the tools the gates would otherwise install on first use,
# installed once here instead of into a cache volume on each machine.
# .github/workflows/toolchain-image.yml publishes it as
# ghcr.io/<owner>/shojiku-toolchain, and the Makefile pins it by digest
# (TOOLCHAIN_DIGEST); a new image reaches the gates only when that pin moves.
#
# Every ARG default below MUST equal the Makefile variable of the same name.
# The workflow passes the Makefile's values as build args, and it and
# engine:budget both fail when these defaults differ
# (scripts/check-toolchain-pins.sh), so a plain `docker build` of this file
# (`make docker:toolchain`) and the published image cannot quietly be two
# different toolchains.
#
# No crate of the workspace is built here: dependencies change with every
# lockfile edit, and an image that went stale with them would be rebuilt for
# nothing the toolchain cares about.
ARG RUST_VERSION=1.99.0
FROM rust:${RUST_VERSION}-slim-bookworm

ARG LLVM_COV_VERSION=0.9.1

# One layer, so what is deleted at the end never reaches the image: the
# registry and git checkouts cargo install fetched, and rustup's download and
# temp directories. The installed binaries and cargo's install records
# (.crates.toml, .crates2.json) stay.
RUN rustup component add rustfmt clippy llvm-tools-preview \
    && cargo install cargo-llvm-cov --locked --version "${LLVM_COV_VERSION}" \
    && rm -rf "${CARGO_HOME}/registry" "${CARGO_HOME}/git" \
        "${RUSTUP_HOME}/downloads" "${RUSTUP_HOME}/tmp"

# engine:wasm builds for this target. The git client is for engine:deny.
RUN rustup target add wasm32-unknown-unknown \
    && rm -rf "${RUSTUP_HOME}/downloads" "${RUSTUP_HOME}/tmp" \
    && apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends git >/dev/null \
    && rm -rf /var/lib/apt/lists/*

ARG CARGO_DENY_VERSION=0.20.2
ARG CARGO_DENY_SHA256_x86_64=9f12ed4c49936e09b48bf862b595cde2fe64fcbd9d74dfacac6131ca824c8d5f
ARG CARGO_DENY_SHA256_aarch64=995c82be0defc7a025cae49a2aa2644ce8245c9a3318fc4103907c6a285e8c7d
ARG WASM_BINDGEN_VERSION=0.2.126
ARG WASM_BINDGEN_SHA256_x86_64=064948d58e2d6c0a745216477a639ba696216d6309aaa902939d1b865b1d869d
ARG WASM_BINDGEN_SHA256_aarch64=2245120254a9f6c9a9adf3601f3d52bb31309219e9ceab7696e74e24885c440a
ARG WASM_OPT_VERSION=123
ARG WASM_OPT_SHA256_x86_64=e959f2170af4c20c552e9de3a0253704d6a9d2766e8fdb88e4d6ac4bae9388fe
ARG WASM_OPT_SHA256_aarch64=4b6bd61ba6cd3b18c993b4657d93426c782f9b91b74be0d38018cd8be1319376

# cargo-deny, wasm-bindgen and wasm-opt as the upstream RELEASE tarballs, each
# checked against the checksum pinned for this architecture before anything is
# unpacked: a version tag alone is not an integrity check. Release binaries
# rather than `cargo install`, because the arm64 half of the published image is
# built under QEMU, where compiling these crates takes the better part of an
# hour; binaryen has no crate that builds without a C++ toolchain at all. Only
# the one executable of each tarball is kept (binaryen's is 18 MB of 100), and
# curl leaves with the layer it was installed in.
RUN set -eu; \
    case "$(uname -m)" in \
        x86_64) arch=x86_64 \
            deny_sha=${CARGO_DENY_SHA256_x86_64} \
            bindgen_sha=${WASM_BINDGEN_SHA256_x86_64} \
            opt_sha=${WASM_OPT_SHA256_x86_64} ;; \
        aarch64) arch=aarch64 \
            deny_sha=${CARGO_DENY_SHA256_aarch64} \
            bindgen_sha=${WASM_BINDGEN_SHA256_aarch64} \
            opt_sha=${WASM_OPT_SHA256_aarch64} ;; \
        *) echo "no pinned tool checksums for $(uname -m)" >&2; exit 1 ;; \
    esac; \
    apt-get update -qq; \
    apt-get install -y -qq --no-install-recommends curl ca-certificates >/dev/null; \
    fetch() { \
        curl -fsSL -o /tmp/tool.tar.gz "$1"; \
        echo "$2  /tmp/tool.tar.gz" | sha256sum -c -; \
        tar --no-same-owner -xzf /tmp/tool.tar.gz -C /usr/local/bin \
            --strip-components="$3" "$4"; \
        rm /tmp/tool.tar.gz; \
    }; \
    deny=cargo-deny-${CARGO_DENY_VERSION}-${arch}-unknown-linux-musl; \
    fetch "https://github.com/EmbarkStudios/cargo-deny/releases/download/${CARGO_DENY_VERSION}/${deny}.tar.gz" \
        "$deny_sha" 1 "${deny}/cargo-deny"; \
    bindgen=wasm-bindgen-${WASM_BINDGEN_VERSION}-${arch}-unknown-linux-musl; \
    fetch "https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN_VERSION}/${bindgen}.tar.gz" \
        "$bindgen_sha" 1 "${bindgen}/wasm-bindgen"; \
    opt=binaryen-version_${WASM_OPT_VERSION}; \
    fetch "https://github.com/WebAssembly/binaryen/releases/download/version_${WASM_OPT_VERSION}/${opt}-${arch}-linux.tar.gz" \
        "$opt_sha" 2 "${opt}/bin/wasm-opt"; \
    apt-get purge -y -qq --auto-remove curl >/dev/null; \
    rm -rf /var/lib/apt/lists/*

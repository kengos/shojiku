# Build context is the repository root: docker build -f docker/Dockerfile .

# Builder pinned to an exact Rust release for reproducible builds; bump the
# version deliberately instead of tracking a floating tag.
FROM rust:1.98.1-slim-bookworm AS builder
WORKDIR /app
COPY engine ./engine
# `shojiku-mcp` embeds the bundled examples with `include_str!` so its read
# surface works with no root path, which makes examples/ a COMPILE-time
# input here, not just a runtime one — the builder cannot see the copy made
# into the runtime stage below. Removing this line fails the build with
# `couldn't read .../examples/...` from inside a macro expansion.
COPY examples ./examples
# Same rule, second tree: `shojiku-mcp` embeds the authoring reference pages
# (`docs/engine/*.md`) so `list_reference` / `get_reference` work with no
# root path either. `docs/` is otherwise a docs-only directory, which is
# exactly why this line is easy to drop — no Rust gate can see its absence.
COPY docs/engine ./docs/engine
WORKDIR /app/engine
# --locked: the committed Cargo.lock is authoritative; fail the build
# rather than silently resolving new dependency versions.
RUN cargo build --release --locked --package shojiku-cli --package shojiku-mcp
# The one shared library the binaries need that the runtime base below does not
# carry: the unwinder, `libgcc_s.so.1`. Staged under its own multiarch path
# (found, not spelled, so amd64 and arm64 both work) and copied across whole.
# It comes from this same bookworm builder, so it matches the base's glibc.
RUN mkdir -p /runtime-libs \
 && cp --parents "$(find /lib /usr/lib -name libgcc_s.so.1 -print -quit)" /runtime-libs

# Distroless runtime: glibc plus the libgcc_s staged above — all the binaries
# link against. The `base-nossl` variant, not `cc`: `cc` also ships libssl3,
# which nothing here links (TLS is rustls, and only at authoring time), yet
# every OpenSSL advisory against it failed the image scan with no upgrade to
# take. No shell, no package manager, no perl — debian-slim carried 43 CVEs,
# including criticals, in packages this CLI never executes. Runs as
# nonroot (uid 65532). Digest-pinned; refresh the digest deliberately.
# Debugging note: there is no shell in this image — use
# `docker run --entrypoint shojiku` variants or inspect from the builder.
FROM gcr.io/distroless/base-nossl-debian12:nonroot@sha256:be40c00dfabd86576d92666e87e406714d5618342de1a0c213ad232de255172e
COPY --from=builder /runtime-libs/ /
COPY --from=builder /app/engine/target/release/shojiku /usr/local/bin/shojiku
# The stdio MCP server rides the same image:
#   docker run -i --rm --entrypoint shojiku-mcp <image>
COPY --from=builder /app/engine/target/release/shojiku-mcp /usr/local/bin/shojiku-mcp
COPY packs /opt/shojiku/packs
COPY examples /opt/shojiku/examples
ENV SHOJIKU_FONT_DIR=/opt/shojiku/packs/fonts
ENV SHOJIKU_LOCALE_DIR=/opt/shojiku/packs/locale
ENTRYPOINT ["shojiku"]
# Default: render the bundled example to stdout, so
#   docker run --rm shojiku > output.pdf
# produces a complete sample document.
CMD ["render", \
     "--definitions", "/opt/shojiku/examples/business/receipt-ja/definitions.yml", \
     "--templates", "/opt/shojiku/examples/business/receipt-ja/templates.yml", \
     "--params", "/opt/shojiku/examples/business/receipt-ja/params.json", \
     "--output", "-"]

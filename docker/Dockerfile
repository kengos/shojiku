# Build context is the repository root: docker build -f docker/Dockerfile .

# Builder pinned to an exact Rust release for reproducible builds; bump the
# version deliberately instead of tracking a floating tag.
FROM rust:1.97.1-slim-bookworm AS builder
WORKDIR /app
COPY engine ./engine
# `shojiku-mcp` embeds the bundled examples with `include_str!` so its read
# surface works with no root path, which makes examples/ a COMPILE-time
# input here, not just a runtime one — the builder cannot see the copy made
# into the runtime stage below. Removing this line fails the build with
# `couldn't read .../examples/...` from inside a macro expansion.
COPY examples ./examples
WORKDIR /app/engine
# --locked: the committed Cargo.lock is authoritative; fail the build
# rather than silently resolving new dependency versions.
RUN cargo build --release --locked --package shojiku-cli --package shojiku-mcp

# Distroless runtime: glibc/libgcc only (all the binary links against).
# No shell, no package manager, no perl — debian-slim carried 43 CVEs,
# including criticals, in packages this CLI never executes. Runs as
# nonroot (uid 65532). Digest-pinned; refresh the digest deliberately.
# Debugging note: there is no shell in this image — use
# `docker run --entrypoint shojiku` variants or inspect from the builder.
FROM gcr.io/distroless/cc-debian12:nonroot@sha256:adcd20c7b4c988b73cbfbddb26d2eee574571e6d7c9ffea29b3821e0690efb77
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

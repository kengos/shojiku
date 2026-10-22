#!/bin/sh
# A toolchain image holds the versions the Makefile pins.
#
#   scripts/check-toolchain-image.sh <image> [<platform>]
#
# Runs the image once and compares what each tool reports with RUST_VERSION,
# LLVM_COV_VERSION, CARGO_DENY_VERSION, WASM_BINDGEN_VERSION and
# WASM_OPT_VERSION in the Makefile, and checks that the wasm32 target and git
# are installed. <platform> (linux/amd64, linux/arm64) picks one half of a
# multi-arch image; without it docker runs the host's.
#
# `make docker:toolchain` runs it over the local build, and
# .github/workflows/toolchain-image.yml over each architecture of the image it
# has just pushed, so an image missing a tool fails before anyone pins its
# digest. scripts/check-toolchain-pins.sh is the other half: it says the
# Makefile and the Dockerfile agree, this says the built image does.
set -eu

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
    echo "usage: $0 <image> [<platform>]" >&2
    exit 2
fi
image=$1
platform=${2:-}

makefile=$(dirname "$0")/../Makefile
make_pin() { sed -n "s/^$1[[:blank:]]*:=[[:blank:]]*\([^[:blank:]#]*\).*/\1/p" "$makefile" | head -1; }

# A tool that is missing or fails prints an empty version, which then fails
# the comparison below by name rather than aborting with no word of which.
have=$(docker run --rm ${platform:+--platform "$platform"} "$image" sh -c '
    v() { "$@" 2>/dev/null | head -1; }
    echo "RUST_VERSION=$(v rustc --version | cut -d" " -f2)"
    echo "LLVM_COV_VERSION=$(v cargo llvm-cov --version | cut -d" " -f2)"
    echo "CARGO_DENY_VERSION=$(v cargo deny --version | cut -d" " -f2)"
    echo "WASM_BINDGEN_VERSION=$(v wasm-bindgen --version | cut -d" " -f2)"
    echo "WASM_OPT_VERSION=$(v wasm-opt --version | cut -d" " -f3)"
    echo "wasm32=$(rustup target list --installed | grep -x wasm32-unknown-unknown)"
    echo "git=$(v git --version | cut -d" " -f1)"')

field() { printf '%s\n' "$have" | sed -n "s/^$1=//p"; }

status=0
expect() {
    got=$(field "$1")
    if [ "$got" != "$2" ]; then
        echo "toolchain-image: $1 is '$got' in $image${platform:+ ($platform)}, want '$2'" >&2
        status=1
    fi
}
for name in RUST_VERSION LLVM_COV_VERSION CARGO_DENY_VERSION WASM_BINDGEN_VERSION WASM_OPT_VERSION; do
    want=$(make_pin "$name")
    if [ -z "$want" ]; then
        echo "toolchain-image: $name not found in the Makefile" >&2
        status=1
    else
        expect "$name" "$want"
    fi
done
expect wasm32 wasm32-unknown-unknown
expect git git
[ "$status" -eq 0 ] || exit 1

echo "toolchain-image: OK ($image${platform:+ $platform}: rust $(field RUST_VERSION), cargo-llvm-cov $(field LLVM_COV_VERSION), cargo-deny $(field CARGO_DENY_VERSION), wasm-bindgen $(field WASM_BINDGEN_VERSION), wasm-opt $(field WASM_OPT_VERSION), wasm32, git)"

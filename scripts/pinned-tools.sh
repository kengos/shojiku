#!/bin/sh
# Puts the pinned cargo-deny, wasm-bindgen or wasm-opt on PATH inside an
# engine container.
#
#   . /repo/scripts/pinned-tools.sh
#   pinned_tool cargo-deny        # or wasm-bindgen, wasm-opt
#
# Sourced, not run, because what it changes is the caller's PATH. The pins
# come from the environment as <PIN>_VERSION and <PIN>_SHA256_<arch>, the
# Makefile variables of the same names (PINNED_TOOLS in the Makefile passes
# them and sources this file).
#
# The tool the toolchain image holds is used when it reports the pinned
# version, which is the normal case and downloads nothing. It does not when
# a pull request moves a pin ahead of TOOLCHAIN_DIGEST: the image can only be
# republished from main, so until the digest follows, the upstream release
# tarball of the pinned version is fetched into
# $CARGO_HOME/tools/<tool>-<version>-<arch>/ on the cargo volume, checked
# against the pinned checksum before anything is unpacked, and that directory
# goes first on PATH. One directory per version and architecture, so working
# trees on different pins never overwrite each other's copy in the shared
# volume. The URLs and tarball layouts are the ones
# docker/toolchain.Dockerfile installs from.

# cargo runs `cargo deny` from $CARGO_HOME/bin AHEAD of PATH unless PATH
# already names that directory, so a cargo-deny an older recipe once
# installed there would win over the one checked below. Naming it last keeps
# the order PATH gives, the same order the version check sees.
case :$PATH: in
*:"$CARGO_HOME/bin":*) ;;
*) PATH=$PATH:$CARGO_HOME/bin ;;
esac

pinned_tool_version() {
    "$1" --version 2>/dev/null | head -1 | cut -d' ' -f"$2"
}

pinned_tool_fetch() {
    local name=$1 pin=$2 want=$3 dir=$4 field=$5
    local arch sha stem url member strip tmp status
    arch=$(uname -m)
    case $arch in
    x86_64 | aarch64) ;;
    *)
        echo "pinned-tools: no pinned $name checksum for $arch" >&2
        return 1
        ;;
    esac
    eval "sha=\${${pin}_SHA256_${arch}:?}"
    case $name in
    cargo-deny)
        stem=cargo-deny-$want-$arch-unknown-linux-musl
        url=https://github.com/EmbarkStudios/cargo-deny/releases/download/$want/$stem.tar.gz
        member=$stem/cargo-deny strip=1
        ;;
    wasm-bindgen)
        stem=wasm-bindgen-$want-$arch-unknown-linux-musl
        url=https://github.com/wasm-bindgen/wasm-bindgen/releases/download/$want/$stem.tar.gz
        member=$stem/wasm-bindgen strip=1
        ;;
    wasm-opt)
        stem=binaryen-version_$want
        url=https://github.com/WebAssembly/binaryen/releases/download/version_$want/$stem-$arch-linux.tar.gz
        member=$stem/bin/wasm-opt strip=2
        ;;
    esac
    echo "pinned-tools: fetching $name $want into $dir"
    command -v curl >/dev/null 2>&1 || {
        apt-get update -qq >/dev/null &&
            apt-get install -y -qq --no-install-recommends curl ca-certificates >/dev/null
    } || return 1
    # Unpacked beside $dir and moved into place last, so a run that stops
    # half-way never leaves a directory holding a partial binary. Another
    # tree fetching the same version at the same time may win the move; its
    # copy is kept when it reports the version, rather than deleted from
    # under it.
    mkdir -p "$CARGO_HOME/tools" || return 1
    # A fetch stopped by Ctrl-C or `docker kill` never reaches its rm below.
    find "$CARGO_HOME/tools" -maxdepth 1 -name '.fetch.*' -mmin +60 \
        -exec rm -rf {} + 2>/dev/null || true
    tmp=$(mktemp -d "$CARGO_HOME/tools/.fetch.XXXXXX") || return 1
    if curl -fsSL -o "$tmp/tool.tar.gz" "$url" &&
        echo "$sha  $tmp/tool.tar.gz" | sha256sum -c - >/dev/null &&
        mkdir "$tmp/bin" &&
        tar --no-same-owner -xzf "$tmp/tool.tar.gz" -C "$tmp/bin" \
            --strip-components="$strip" "$member"; then
        status=0
        mv -T "$tmp/bin" "$dir" 2>/dev/null ||
            [ "$(pinned_tool_version "$dir/$name" "$field")" = "$want" ] ||
            { rm -rf "$dir" && mv -T "$tmp/bin" "$dir"; } ||
            [ "$(pinned_tool_version "$dir/$name" "$field")" = "$want" ] ||
            status=1
    else
        echo "pinned-tools: $url did not download, or its sha256 is not $sha" >&2
        status=1
    fi
    rm -rf "$tmp"
    return "$status"
}

pinned_tool() {
    local pin field want have dir got
    case $1 in
    cargo-deny) pin=CARGO_DENY field=2 ;;
    wasm-bindgen) pin=WASM_BINDGEN field=2 ;;
    wasm-opt) pin=WASM_OPT field=3 ;;
    *)
        echo "pinned-tools: unknown tool $1" >&2
        return 2
        ;;
    esac
    eval "want=\${${pin}_VERSION:?}"
    have=$(pinned_tool_version "$1" "$field")
    [ "$have" != "$want" ] || return 0
    dir=$CARGO_HOME/tools/$1-$want-$(uname -m)
    if [ "$(pinned_tool_version "$dir/$1" "$field")" != "$want" ]; then
        pinned_tool_fetch "$1" "$pin" "$want" "$dir" "$field" || return 1
        got=$(pinned_tool_version "$dir/$1" "$field")
        if [ "$got" != "$want" ]; then
            echo "pinned-tools: the fetched $1 reports '$got', want '$want'" >&2
            return 1
        fi
    fi
    PATH=$dir:$PATH
    echo "pinned-tools: $1 $want from $dir (PATH had ${have:-none})"
}

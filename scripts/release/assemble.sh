#!/bin/sh
# Assemble the release packages from the five-platform binary matrix.
#
#   scripts/release/assemble.sh [python|ruby|npm|dotnet|java|cli|checksums ...]
#
# Reads  dist/release/bin/<slug>/…   (normalized by normalize.sh)
# Writes dist/release/packages/<ecosystem>/…
#
# Assembly only — nothing here talks to a registry, signs, or tags. The
# split is deliberate: this half is mechanical and rerunnable, while
# publishing is the irreversible half and stays a separate, deliberate act.
# php ships no binary (subprocess SDK) and its publish is a repository rather
# than an archive — split-php.sh builds it — while go publishes as a git tag,
# so neither appears here. `cli`
# is the odd one out: its output is not a registry package but the archives
# a human downloads from the GitHub Release.
#
# One naming rule runs through everything: a platform's payload keeps the
# filename cargo gave it (libshojiku_capi.so / .dylib / shojiku_capi.dll),
# because every SDK's lookup probes exactly those names.

set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$ROOT/dist/release/bin"
OUT="$ROOT/dist/release/packages"
VERSION=0.2.0

# slug ↔ per-ecosystem spellings, one row per release platform.
#   slug        capi payload              wheel tag             gem platform     npm package                  rid
TABLE="\
linux-x64    libshojiku_capi.so    manylinux_2_36_x86_64   x86_64-linux    @shojiku/linux-x64-gnu    linux-x64
linux-arm64  libshojiku_capi.so    manylinux_2_36_aarch64  aarch64-linux   @shojiku/linux-arm64-gnu  linux-arm64
darwin-x64   libshojiku_capi.dylib macosx_11_0_x86_64      x86_64-darwin   @shojiku/darwin-x64       osx-x64
darwin-arm64 libshojiku_capi.dylib macosx_11_0_arm64       arm64-darwin    @shojiku/darwin-arm64     osx-arm64
win-x64      shojiku_capi.dll      win_amd64               x64-mingw-ucrt  @shojiku/win32-x64-msvc   win-x64"

each_platform() { # calls "$1 slug capi_name wheel_tag gem_platform npm_pkg rid" per row
  echo "$TABLE" | while read -r slug capi wheel gem npmpkg rid; do
    [ -n "$slug" ] && "$1" "$slug" "$capi" "$wheel" "$gem" "$npmpkg" "$rid"
  done
}

require_bin() {
  echo "$TABLE" | while read -r slug capi _; do
    [ -f "$BIN/$slug/$capi" ] || {
      echo "assemble: $BIN/$slug/$capi is missing — run normalize.sh first" >&2
      exit 1
    }
  done
}

# ---- python: one wheel per platform, payload as package data --------------

assemble_python() {
  echo "== assemble python (5 platform wheels + the any fallback) =="
  rm -rf "$OUT/python" && mkdir -p "$OUT/python"
  # The payload-LESS none-any wheel ships too, deliberately last in pip's
  # preference order: on a matrix platform the platform wheel outranks it,
  # and anywhere else it installs cleanly and fails at runtime with the
  # named install hint (SHOJIKU_LIBRARY, the source-build route) instead of
  # pip failing with "no matching distribution".
  stage="$ROOT/dist/release/stage/python-any"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$ROOT/sdk/python/." "$stage/"
  docker run --rm -v "$stage:/s" -v "$OUT/python:/out" -w /s \
    "python:${PYTHON_VER:-3.11}-slim-bookworm" sh -euc '
    pip install -q build hatchling
    python -m build --wheel --outdir /out >/dev/null'
  echo "  any -> $(ls "$OUT/python" | grep any)"
  one_wheel() {
    slug=$1 capi=$2 tag=$3
    stage="$ROOT/dist/release/stage/python-$slug"
    rm -rf "$stage" && mkdir -p "$stage"
    cp -R "$ROOT/sdk/python/." "$stage/"
    mkdir -p "$stage/src/shojiku/native"
    cp "$BIN/$slug/$capi" "$stage/src/shojiku/native/"
    docker run --rm -v "$stage:/s" -v "$OUT/python:/out" -w /s \
      "python:${PYTHON_VER:-3.11}-slim-bookworm" sh -euc '
      pip install -q build hatchling wheel
      python -m build --wheel --outdir /tmp/w >/dev/null
      python -m wheel tags --remove --platform-tag '"$tag"' /tmp/w/*.whl >/dev/null
      cp /tmp/w/*.whl /out/'
    echo "  $slug -> $(ls "$OUT/python" | grep "$tag")"
  }
  each_platform one_wheel
}

# ---- ruby: one platform gem per platform ---------------------------------

assemble_ruby() {
  echo "== assemble ruby (5 platform gems + the plain fallback) =="
  rm -rf "$OUT/ruby" && mkdir -p "$OUT/ruby"
  # The plain ruby-platform gem (no payload) is the same fallback story as
  # python's none-any wheel: RubyGems serves it wherever no platform gem
  # matches, and the runtime raises the named install hint instead of
  # `gem install` dying with "could not find a valid gem".
  stage="$ROOT/dist/release/stage/ruby-plain"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$ROOT/sdk/ruby/." "$stage/"
  docker run --rm -v "$stage:/s" -v "$OUT/ruby:/out" -w /s \
    "ruby:${RUBY_VER:-3.3}-slim-bookworm" sh -euc '
    gem build -q shojiku.gemspec >/dev/null
    cp shojiku-*.gem /out/'
  echo "  plain -> shojiku-$VERSION.gem"
  one_gem() {
    slug=$1 capi=$2 gem_platform=$4
    stage="$ROOT/dist/release/stage/ruby-$slug"
    rm -rf "$stage" && mkdir -p "$stage"
    cp -R "$ROOT/sdk/ruby/." "$stage/"
    mkdir -p "$stage/lib/shojiku/native"
    cp "$BIN/$slug/$capi" "$stage/lib/shojiku/native/"
    docker run --rm -v "$stage:/s" -v "$OUT/ruby:/out" -w /s \
      -e SHOJIKU_GEM_PLATFORM="$gem_platform" \
      "ruby:${RUBY_VER:-3.3}-slim-bookworm" sh -euc '
      gem build -q shojiku.gemspec >/dev/null
      cp shojiku-*.gem /out/'
    echo "  $slug -> $(ls "$OUT/ruby" | grep -F "$gem_platform")"
  }
  each_platform one_gem
}

# ---- npm: the entry tarball + 5 platform packages ------------------------

assemble_npm() {
  echo "== assemble npm (entry + 5 platform packages) =="
  rm -rf "$OUT/npm" && mkdir -p "$OUT/npm"

  stage="$ROOT/dist/release/stage/npm-entry"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$ROOT/sdk/js/." "$stage/"
  rm -rf "$stage/node_modules" "$stage/dist"
  PNPM_VERSION="$(sed -n 's/.*"packageManager": *"pnpm@\([^"]*\)".*/\1/p' "$ROOT/sdk/js/package.json")"
  # Build against the PRISTINE manifest, then inject optionalDependencies
  # only for the pack. The order is load-bearing twice over: the platform
  # package names resolve nowhere until this same release publishes them
  # (so an install that sees them 404s), and the frozen lockfile predates
  # them (so pnpm refuses the manifest even before resolving). Which is
  # also why the block lands at release time and not in the checkout.
  docker run --rm -v "$stage:/s" -v "$OUT/npm:/out" -w /s \
    -e VERSION="$VERSION" \
    "node:${NODE_VER:-22}-bookworm-slim" sh -euc '
    npm install -g pnpm@'"$PNPM_VERSION"' >/dev/null 2>&1
    pnpm install --ignore-scripts --frozen-lockfile >/dev/null
    pnpm run build >/dev/null
    node -e "
      const fs = require(\"fs\");
      const d = JSON.parse(fs.readFileSync(\"package.json\", \"utf8\"));
      d.optionalDependencies = Object.fromEntries([
        \"@shojiku/linux-x64-gnu\", \"@shojiku/linux-arm64-gnu\",
        \"@shojiku/darwin-x64\", \"@shojiku/darwin-arm64\",
        \"@shojiku/win32-x64-msvc\",
      ].map((n) => [n, process.env.VERSION]));
      fs.writeFileSync(\"package.json\", JSON.stringify(d, null, 2));
    "
    pnpm pack --pack-destination /out >/dev/null'
  echo "  entry -> $(ls "$OUT/npm" | grep '^shojiku-')"

  one_platform_pkg() {
    slug=$1 npmpkg=$5
    node_file="$BIN/$slug/shojiku.node"
    [ -f "$node_file" ] || { echo "assemble: $node_file missing" >&2; exit 1; }
    pdir="$ROOT/dist/release/stage/npm-$slug"
    rm -rf "$pdir" && mkdir -p "$pdir"
    cp "$node_file" "$pdir/"
    os=$(echo "$slug" | cut -d- -f1); cpu=$(echo "$slug" | cut -d- -f2)
    case "$os" in darwin) nos=darwin ;; win) nos=win32 ;; *) nos=linux ;; esac
    case "$cpu" in x64) ncpu=x64 ;; arm64) ncpu=arm64 ;; esac
    extra=""
    [ "$nos" = "linux" ] && extra=',
  "libc": ["glibc"]'
    cat > "$pdir/package.json" <<JSON
{
  "name": "$npmpkg",
  "version": "$VERSION",
  "description": "Shojiku engine addon for $slug",
  "homepage": "https://shojiku.kengos.jp",
  "repository": { "type": "git", "url": "git+https://github.com/kengos/shojiku.git" },
  "license": "MIT OR Apache-2.0 OR BSD-3-Clause",
  "files": ["shojiku.node"],
  "os": ["$nos"],
  "cpu": ["$ncpu"]$extra
}
JSON
    docker run --rm -v "$pdir:/p" -v "$OUT/npm:/out" -w /p \
      "node:${NODE_VER:-22}-bookworm-slim" \
      npm pack --pack-destination /out >/dev/null 2>&1
    echo "  $slug -> $(ls "$OUT/npm" | grep -F "$(echo "$npmpkg" | tr -d @ | tr / -)")"
  }
  each_platform one_platform_pkg
}

# ---- dotnet: ONE nupkg carrying all five RID assets ----------------------

assemble_dotnet() {
  echo "== assemble dotnet (one nupkg, 5 RID assets) =="
  rm -rf "$OUT/dotnet" && mkdir -p "$OUT/dotnet"
  stage="$ROOT/dist/release/stage/dotnet"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$ROOT/sdk/dotnet/." "$stage/"
  one_rid() {
    slug=$1 capi=$2 rid=$6
    mkdir -p "$stage/Shojiku/runtimes/$rid/native"
    cp "$BIN/$slug/$capi" "$stage/Shojiku/runtimes/$rid/native/"
  }
  each_platform one_rid
  docker run --rm -v "$stage:/s" -v "$OUT/dotnet:/out" -w /s \
    "mcr.microsoft.com/dotnet/sdk:${DOTNET_VER:-10.0}-noble" sh -euc '
    dotnet pack Shojiku/Shojiku.csproj -c Release -o /out --nologo -v q'
  echo "  -> $(ls "$OUT/dotnet")"
}

# ---- java: main/sources/javadoc + 5 classifier jars ----------------------

assemble_java() {
  echo "== assemble java (3 jars + 5 classifier jars + pom) =="
  rm -rf "$OUT/java" && mkdir -p "$OUT/java"
  GATE_IMG="${GATE_IMG:-shojiku-sdk-java:${JAVA_VER:-21}}"
  DOCKER_BUILDKIT=1 docker build -q --build-arg JAVA_VERSION="${JAVA_VER:-21}" \
    -f "$ROOT/sdk/java/Dockerfile" -t "$GATE_IMG" "$ROOT" >/dev/null
  stage="$ROOT/dist/release/stage/java"
  rm -rf "$stage" && mkdir -p "$stage"
  cp -R "$ROOT/sdk/java/." "$stage/"
  docker run --rm -v "$stage:/s" -v "$OUT/java:/out" -w /s "$GATE_IMG" sh -euc '
    mvn -o -q -DskipTests -Dspotless.check.skip=true -Djacoco.skip=true package
    cp target/shojiku-*.jar /out/
    cp pom.xml /out/shojiku-'"$VERSION"'.pom'
  one_classifier() {
    slug=$1 capi=$2
    cdir="$ROOT/dist/release/stage/java-$slug"
    rm -rf "$cdir" && mkdir -p "$cdir/native"
    cp "$BIN/$slug/$capi" "$cdir/native/"
    docker run --rm -v "$cdir:/c" -v "$OUT/java:/out" -w /c "$GATE_IMG" \
      jar cf "/out/shojiku-$VERSION-$slug.jar" native
    echo "  $slug -> shojiku-$VERSION-$slug.jar"
  }
  each_platform one_classifier
  echo "  -> $(ls "$OUT/java" | tr '\n' ' ')"
}

# ---- cli: the GitHub Release assets --------------------------------------

# sha256sum on Linux, shasum on macOS — same output format.
sha_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then echo "sha256sum"; else echo "shasum -a 256"; fi
}

# Unlike the registry packages above, these are what a human downloads:
# one archive per platform, plus the font/locale packs ONCE. The packs are
# platform-independent and 94 MB, so bundling them into each of the five
# would be 470 MB of the same fonts. The CLI's default lookup is
# ./packs/fonts (engine/authoring/src/fs.rs), so extracting both archives
# into the same directory needs no --font-dir and no env var.
assemble_cli() {
  echo "== assemble cli (5 platform archives + the shared packs) =="
  rm -rf "$OUT/cli" && mkdir -p "$OUT/cli"
  # macOS tar otherwise buries ._AppleDouble entries in the tarball.
  COPYFILE_DISABLE=1; export COPYFILE_DISABLE
  one_cli() {
    slug=$1
    case "$slug" in win-*) exe=shojiku.exe ;; *) exe=shojiku ;; esac
    sdir="$ROOT/dist/release/stage/cli-$slug"
    rm -rf "$sdir" && mkdir -p "$sdir"
    cp "$BIN/$slug/$exe" "$sdir/"
    chmod +x "$sdir/$exe"
    # The triple license travels with every redistributed binary; the FONT
    # licenses ride inside packs/fonts/<pack>/ in the packs archive, which
    # is what makes shipping IPAmj Mincho legitimate.
    cp "$ROOT/LICENSE-MIT" "$ROOT/LICENSE-APACHE" "$ROOT/LICENSE-BSD" "$sdir/"
    # zip for Windows, tar.gz elsewhere — each platform's own idiom.
    case "$slug" in
      win-*) (cd "$sdir" && zip -qr "$OUT/cli/shojiku-$VERSION-$slug.zip" .) ;;
      *)     tar czf "$OUT/cli/shojiku-$VERSION-$slug.tar.gz" -C "$sdir" . ;;
    esac
    echo "  $slug -> shojiku-$VERSION-$slug"
  }
  each_platform one_cli
  tar czf "$OUT/cli/shojiku-$VERSION-packs.tar.gz" -C "$ROOT" packs
  echo "  packs -> shojiku-$VERSION-packs.tar.gz"
  # A SHA256SUMS the Release can carry as its own asset, covering exactly
  # the files attached to it — the workspace-wide one below spans every
  # registry package too, which a CLI downloader cannot check.
  (cd "$OUT/cli" && find . -type f ! -name SHA256SUMS -exec $(sha_cmd) {} + \
    | sed 's| \./| |' | sort -k2 > SHA256SUMS)
  echo "  -> $(ls "$OUT/cli" | tr '\n' ' ')"
}

# ---- checksums over everything -------------------------------------------

assemble_checksums() {
  echo "== checksums =="
  (cd "$OUT" && find . -type f ! -name SHA256SUMS -exec $(sha_cmd) {} + | sort -k2 > SHA256SUMS)
  wc -l < "$OUT/SHA256SUMS" | xargs echo "  files:"
}

require_bin
[ $# -gt 0 ] || set -- python ruby npm dotnet java cli checksums
for component in "$@"; do
  "assemble_$component"
done

#!/bin/sh
# Install proof, ruby: platform gem carrying the cdylib under
# lib/shojiku/native/, gem-installed into a clean floor-version container.
# See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

IMG="ruby:${RUBY_VER:-3.3}-slim-bookworm"
require_artifact "$CAPI_LIB" capi-lib

echo "== install proof (ruby, $IMG) =="

cp -R "$ROOT/sdk/ruby" "$WORK/src"
mkdir -p "$WORK/src/lib/shojiku/native"
cp "$CAPI_LIB" "$WORK/src/lib/shojiku/native/"

docker run --rm -v "$WORK:/w" -w /w/src "$IMG" sh -euc '
  gem build -q shojiku.gemspec >/dev/null
  mv shojiku-*.gem /w/
  # The gemspec must have CARRIED the payload — a files glob of *.rb alone
  # builds a gem that installs fine and renders nothing.
  gem spec /w/shojiku-*.gem files | grep -q "native/libshojiku_capi" || {
    echo "the built gem does not contain the engine payload" >&2; exit 1; }
  echo "payload in gem: lib/shojiku/native/libshojiku_capi.so"'

cat > "$WORK/proof.rb" <<'RB'
require "json"

raise "void: a library was injected" if ENV.key?("SHOJIKU_LIBRARY")
raise "void: an engine exists outside the package" if File.exist?("/opt/shojiku")

require "shojiku"

client = Shojiku::Client.new(
  templates: "/ex", font_dirs: ["/packs/fonts"], locale_dirs: ["/packs/locale"]
)
result = client.generate("receipt-ja", JSON.parse(File.read("/ex/receipt-ja/params.json")))
unless result.success?
  abort "FAILED: #{result.failure.kind} | #{result.failure.message}"
end
File.binwrite("/w/out.pdf", result.artifact.bytes)
RB

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  gem install -q --local --no-document /w/shojiku-*.gem >/dev/null
  ruby /w/proof.rb'

assert_pdf "$WORK/out.pdf"

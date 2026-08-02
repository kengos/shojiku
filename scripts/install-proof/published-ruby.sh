#!/bin/sh
# Published-install proof, ruby: `gem install shojiku` from rubygems.org.
# See published-python.sh for why the registry copy is proved separately.
. "$(dirname "$0")/common.sh"

IMG="ruby:${RUBY_VER:-3.3}-slim-bookworm"

echo "== published-install proof (ruby, $IMG) =="

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

docker run --rm -e VER="${SHOJIKU_VERSION:-}" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  if [ -n "$VER" ]; then gem install -N shojiku -v "$VER"; else gem install -N shojiku; fi
  # Which gem resolved matters: the plain `ruby` platform gem carries no
  # payload, so a mis-tagged platform gem installs and then fails to render.
  gem list -d shojiku | head -5
  ruby /w/proof.rb'

assert_pdf "$WORK/out.pdf"

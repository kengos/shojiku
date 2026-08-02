# Renders the vendored template with its bundled sample data and writes the
# PDF to stdout — swap the JSON.parse line for params built from your app.
require "json"
require "shojiku"

client = Shojiku::Client.new(
  templates: "templates/", font_dirs: ["packs/fonts"], locale_dirs: ["packs/locale"]
)
result = client.generate("receipt-ja", JSON.parse(File.read("templates/receipt-ja/params.json")))
abort "render failed: #{result.failure.kind} | #{result.failure.message}" unless result.success?
$stdout.binmode
$stdout.write(result.artifact.bytes)

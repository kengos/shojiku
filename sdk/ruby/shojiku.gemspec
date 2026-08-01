# frozen_string_literal: true

# Read rather than required. Loading the file here would define
# `Shojiku::VERSION` in whatever process evaluates this gemspec — including
# the gate container, which then loads the same constant again from the
# checkout and warns about redefining it. A gate that prints warnings trains
# people to ignore warnings.
VERSION_FILE = File.expand_path("lib/shojiku/version.rb", __dir__)
SHOJIKU_VERSION = File.read(VERSION_FILE)[/VERSION = "([^"]+)"/, 1]

Gem::Specification.new do |spec|
  spec.name = "shojiku"
  spec.version = SHOJIKU_VERSION
  spec.authors = ["kengos"]
  spec.email = ["kengo@kengos.jp"]

  spec.summary = "Deterministic PDF documents from a YAML template plus your data"
  spec.description = <<~TEXT
    Ruby bindings for Shojiku, a document engine for invoices, receipts and
    slips. A YAML template plus JSON or YAML params in, a deterministic PDF
    out, with signing and verification over the result. The layout engine is a
    shared C library loaded through fiddle, so the same params produce the same
    bytes here as in the CLI and every other Shojiku SDK.
  TEXT
  spec.homepage = "https://github.com/kengos/shojiku"
  # The workspace's `MIT OR Apache-2.0 OR BSD-3-Clause`, in the form RubyGems
  # understands: a list of SPDX identifiers, which it reads as "any of these,
  # at your option". The single-string SPDX expression is rejected as an
  # invalid identifier.
  spec.licenses = ["MIT", "Apache-2.0", "BSD-3-Clause"]

  # The policy, from docs/agents/sdk.md: every upstream line that is not
  # end-of-life, minus those whose support ends within six months.
  spec.required_ruby_version = ">= 3.3.0"

  spec.metadata = {
    "homepage_uri" => spec.homepage,
    "source_code_uri" => "#{spec.homepage}/tree/main/sdk/ruby",
    "documentation_uri" => "#{spec.homepage}/blob/main/docs/engine/README.md",
    "rubygems_mfa_required" => "true"
  }

  spec.files = Dir["lib/**/*.rb", "README.md"]
  spec.require_paths = ["lib"]

  # Declared rather than assumed: fiddle is leaving the default-gem set, and a
  # binding that silently relied on it being there would break on the release
  # that drops it. It is also the whole reason this SDK is Ruby-version
  # independent — one binary serves every supported interpreter, unlike a
  # native extension.
  spec.add_dependency "fiddle", "~> 1.1"
end

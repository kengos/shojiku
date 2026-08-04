# frozen_string_literal: true

require "json"

require_relative "shojiku/version"
require_relative "shojiku/errors"
require_relative "shojiku/env"
require_relative "shojiku/log"
require_relative "shojiku/library"
require_relative "shojiku/engine"
require_relative "shojiku/diagnostic"
require_relative "shojiku/failure"
require_relative "shojiku/result"
require_relative "shojiku/verification_report"
require_relative "shojiku/artifact"
require_relative "shojiku/local_pem"
require_relative "shojiku/external_signer"
require_relative "shojiku/lockdown"
require_relative "shojiku/sources"
require_relative "shojiku/template_root"
require_relative "shojiku/request"
require_relative "shojiku/outcome"
require_relative "shojiku/config"
require_relative "shojiku/settings"
require_relative "shojiku/client"

# Shojiku for Ruby — a template plus your data, deterministically, as a PDF.
#
# ```ruby
# client = Shojiku::Client.new(templates: "app/templates")
# result = client.generate("receipt_ja", customer: { name: "Yamada Shoji K.K." })
# result.artifact.write("receipt.pdf") if result.success?
# ```
#
# Three things about this gem are worth knowing before reading any of it.
#
# **Results, not exceptions.** No lifecycle operation raises in the normal
# flow. What raises is programmer misuse ({UsageError}) and an environment
# with no engine in it ({LibraryNotFound}).
#
# **Nothing here reimplements the engine.** Layout, formatting and PDF
# construction all happen in the shared C library this gem loads, so the same
# params produce the same bytes here, in the CLI, in the Designer and in the
# other six SDKs. A missing capability is missing in the engine and gets added
# there.
#
# **Nothing here downloads anything**, at install time or at run time. The
# platform gem carries the binary; otherwise you point `SHOJIKU_LIBRARY` at
# one you built. Sources an application fetched itself go to
# {Client#generate_source} — fetching is the application's act, and a
# deployment that wants to forbid even that declares `strict:` (see
# {Lockdown}).
module Shojiku
end

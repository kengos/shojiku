# frozen_string_literal: true

require "simplecov"

# The gate's configuration lives in `.simplecov`, which SimpleCov loads
# itself — the conventional location, and the one docs/guidelines.md names.
SimpleCov.start

require "shojiku"
require "tmpdir"

require "fileutils"

# Used to express the fixture root RELATIVE to the current directory, so the
# root-shape specs never move the process cwd out from under the suite.
require "pathname"

require_relative "support/engine_fixtures"

RSpec.configure do |config|
  config.expect_with(:rspec) { |expectations| expectations.syntax = :expect }
  config.disable_monkey_patching!
  config.order = :random
  Kernel.srand config.seed

  config.include EngineFixtures

  # `Shojiku.configure` is process-wide state and this suite runs in a random
  # order, so an example that sets a default would otherwise decide what an
  # unrelated one resolves to — the failure appearing in whichever example
  # happened to run next.
  config.after { Shojiku.reset_configuration! }
end

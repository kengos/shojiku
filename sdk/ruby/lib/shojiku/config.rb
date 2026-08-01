# frozen_string_literal: true

# Process-wide configuration: the {Shojiku::Config} object and the
# module-level entry points that reach it.
module Shojiku
  # Process-wide defaults for every {Client} built after it is set.
  #
  # The ecosystem idiom (a `configure` block in an initializer) OVER the
  # frozen constructor, never a third precedence layer: what `configure` sets
  # stands exactly where an explicit constructor argument stands against the
  # environment. So the order is
  #
  #   explicit argument > `Shojiku.configure` > `SHOJIKU_*`
  #
  # for the template root and the pack directories, and the deliberate
  # reverse for the engine library — `SHOJIKU_LIBRARY` still wins over both,
  # because where the engine lives is a deployment decision.
  #
  # **`strict` is the one exception, and it is the only place `configure`
  # beats a call site.** Strictness is a restriction rather than a default: an
  # operator who declared a lockdown must not have it lifted by application
  # code passing `strict: false`. Every SDK mirrors that asymmetry.
  #
  # The rule the other six mirror: an ecosystem-standard configuration idiom
  # (an options object, properties, a builder) feeds the same constructor and
  # never adds a precedence level of its own.
  class Config
    # Every setting a client can take, which is also what {#merge} accepts —
    # so a misspelled key is a named error rather than a silently ignored one.
    ATTRIBUTES = %i[
      templates font_dirs locale_dirs lang library logger strict providers env
    ].freeze

    attr_accessor(*ATTRIBUTES)

    def initialize
      @strict = false
      @providers = {}
      @env = true
    end

    # A copy with `overrides` applied — one client's resolution step.
    #
    # A nil override means "not given", so an explicit constructor argument
    # beats a configured default and an absent one inherits it. `strict` is
    # the exception documented above: it is OR-ed rather than overridden.
    #
    # `providers` replaces rather than merges. A client that declares its own
    # registry is stating the whole set it may sign with, and quietly adding
    # globally-registered keys to that set would defeat the point.
    def merge(overrides)
      merged = dup
      overrides.each do |key, value|
        raise UsageError, "unknown client setting `#{Echo.bounded(key)}`" unless
          ATTRIBUTES.include?(key)

        merged.public_send(:"#{key}=", value) unless value.nil?
      end
      merged.strict = strict || merged.strict
      merged
    end
  end

  class << self
    # The process-wide defaults. Mutated through {configure}, read by every
    # {Client} at construction.
    def config
      @config ||= Config.new
    end

    # ```ruby
    # Shojiku.configure do |config|
    #   config.templates = "app/templates"
    #   config.lang = "ja-JP"
    # end
    # ```
    def configure
      yield(config)
      config
    end

    # Drops every configured default.
    #
    # Public because a global that cannot be reset makes every test suite
    # invent its own teardown — and get it wrong in a randomly-ordered run.
    # Applications call it at most once, if at all.
    def reset_configuration!
      @config = Config.new
    end
  end
end

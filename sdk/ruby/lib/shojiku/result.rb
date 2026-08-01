# frozen_string_literal: true

module Shojiku
  # What every lifecycle operation returns.
  #
  # Nothing in the normal flow raises. A template that will not render, a key
  # that will not sign, a signature that does not verify are all data you
  # query — `success?`, the value, the engine's diagnostics either way, and on
  # failure the {Failure} trace.
  #
  # Diagnostics ride on a SUCCESS too. A render that worked can still have
  # warned about an overflowing box, and a caller that only looks at failures
  # never sees them.
  class Result
    attr_reader :value, :diagnostics, :failure

    def self.succeeded(value, diagnostics)
      new(value: value, diagnostics: diagnostics)
    end

    def self.failed(failure)
      new(failure: failure, diagnostics: failure.diagnostics)
    end

    def initialize(value: nil, diagnostics: [], failure: nil)
      @value = value
      @diagnostics = diagnostics
      @failure = failure
    end

    def success?
      @failure.nil?
    end

    def failure?
      !success?
    end

    # `value` under the name of what the operation produced. Both are the same
    # object; the aliases exist so calling code reads as what it is doing.
    alias artifact value
    alias report value

    # The value, or a raised {UnwrapError} when the operation failed.
    #
    # The opt-in bridge for a script that wants a stack trace rather than a
    # branch, and the ONE place this API raises for something other than a
    # misused argument. That is why the ruling is stated rather than implied,
    # and frozen for every Shojiku SDK: **calling unwrap on a failed result is
    # programmer misuse** — a caller who has not checked `success?` is
    # asserting the operation worked. Application code that handles failure
    # keeps using `success?` and {#failure}; nothing in this gem calls these.
    #
    # (Go is the recorded exception: the language has no exceptions, so its
    # SDK mirrors the shape as an error return rather than a panic.)
    def value!
      raise UnwrapError, @failure if @failure

      @value
    end

    alias artifact! value!
    alias report! value!

    # Only the diagnostics that are errors — the ones that explain a refusal.
    def errors
      @diagnostics.select(&:error?)
    end

    # Only the warnings, which a SUCCESSFUL result can carry.
    def warnings
      @diagnostics.select(&:warning?)
    end
  end
end

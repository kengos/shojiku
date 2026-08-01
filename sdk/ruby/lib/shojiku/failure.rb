# frozen_string_literal: true

module Shojiku
  # Why a lifecycle operation did not produce what was asked for.
  #
  # A VALUE, not an exception. The shape takes effect-ts's `Cause` as its
  # conceptual reference: which step failed, what class of thing went wrong,
  # and — when one failure happened because of another — the chain underneath
  # it, all inspectable rather than unwound. No effect framework is involved;
  # only the idea that a failure is data.
  class Failure
    # The lifecycle step, as a symbol: `:generate`, `:sign` or `:verify`.
    #
    # Always one of those three — the SDK's own vocabulary, from
    # `docs/agents/sdk.md`. The engine's error object carries a step of its
    # own naming an INTERNAL stage (`render`, `validate`), and passing that
    # through would make the trace's step mean different things depending on
    # which layer refused. What the engine said specifically is in {#kind}.
    attr_reader :step

    # A stable machine-readable class. Engine-side kinds come straight off the
    # wire; host-side ones are this gem's own (`template_name`, `io`, …).
    attr_reader :kind

    attr_reader :message, :diagnostics, :cause

    def self.from_error_json(json, step:, diagnostics: [], cause: nil)
      parsed = json.nil? || json.empty? ? {} : JSON.parse(json)
      new(
        step: step,
        kind: parsed.fetch("kind", "unknown"),
        message: parsed.fetch("message", ""),
        diagnostics: diagnostics,
        cause: cause
      )
    end

    def initialize(step:, kind:, message:, diagnostics: [], cause: nil)
      @step = step.to_sym
      @kind = kind
      @message = message
      @diagnostics = diagnostics
      @cause = cause
    end

    # This failure and everything under it, outermost first. What you log when
    # you want the whole story rather than only its headline.
    def causes
      [self] + (@cause ? @cause.causes : [])
    end

    def to_s
      "#{@step}/#{@kind}: #{@message}"
    end
  end
end

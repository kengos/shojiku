# frozen_string_literal: true

module Shojiku
  # The optional host-side log channel.
  #
  # Silent unless an application supplies a logger, and deliberately narrow:
  # it reports what the BINDING did — which library it loaded, which ABI
  # revision it found, which lifecycle step ran and for how long — and never
  # what the document contained. Params, rendered bytes, diagnostics and key
  # material are all outside this channel BY RULE, because a log line is the
  # easiest way for a secret to leave a process, and because a diagnostic
  # belongs to the {Result} the caller already has.
  #
  # What does cross is bounded first ({Echo}), so a hostile template name
  # cannot smuggle control characters into a log file.
  #
  # Any object answering `debug` is accepted — `Logger`, `Rails.logger`, or an
  # application's own — so the gem's runtime dependency list stays at exactly
  # one entry. The cross-language rule the other six mirror: each SDK accepts
  # its ecosystem's standard logger interface, optionally.
  class Log
    def initialize(logger = nil)
      @logger = logger
    end

    # Records one host event. The message is built only when someone is
    # listening: a silent log costs a nil check, not string formatting.
    def event(name, **fields)
      return unless @logger

      @logger.debug("shojiku #{name}#{render(fields)}")
    end

    # Times one lifecycle operation and returns what the block returned.
    #
    # The block is expected to produce a {Result}, whose verdict is recorded
    # as `ok` — the one thing worth knowing about an operation that is not
    # its content.
    def timed(name, **fields)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      result = yield
      event(name, **fields, ms: elapsed_ms(started), ok: result.success?)
      result
    end

    private

    def elapsed_ms(started)
      ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(1)
    end

    def render(fields)
      fields.map { |key, value| " #{key}=#{value}" }.join
    end
  end
end

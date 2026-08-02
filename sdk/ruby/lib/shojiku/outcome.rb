# frozen_string_literal: true

module Shojiku
  # Turning one engine {Snapshot} into the {Result} an application sees.
  #
  # The C surface's two levels of failure meet here, and keeping them apart is
  # the whole job: a non-zero status is the CALLER's mistake and raises, while
  # everything a DOCUMENT can do wrong comes back as a failed result with the
  # engine's diagnostics attached.
  module Outcome
    class << self
      # A non-zero status is the C surface saying the CALLER got it wrong — a
      # null pointer, a request the schema rejects, an argument past a hard
      # cap. That is programmer misuse in Ruby terms, so it raises.
      def guard!(snapshot)
        return if snapshot.status.zero?

        raise UsageError,
              "the engine refused the call (status #{snapshot.status}): #{snapshot.error}"
      end

      # A rendered or signed document. Diagnostics are attached either way: a
      # render that WORKED can still have warned.
      def document(snapshot, step:, client:, origin:)
        guard!(snapshot)
        diagnostics = Diagnostic.parse(snapshot.diagnostics)
        return refused(snapshot, step, diagnostics) unless snapshot.success

        Result.succeeded(artifact(snapshot, diagnostics, client, origin), diagnostics)
      end

      # A verification verdict.
      #
      # The report is parsed BEFORE the verdict is read, because it rides a
      # FAILED verify too — that is the whole point of carrying `not_checked`.
      # Diagnostics are parsed on both paths for the same reason they are on a
      # render: whatever the engine noticed belongs to the caller, and an
      # operation that drops them makes its result mean something different
      # from every other operation's.
      def verdict(snapshot)
        guard!(snapshot)
        diagnostics = Diagnostic.parse(snapshot.diagnostics)
        report = snapshot.json.empty? ? nil : VerificationReport.parse(snapshot.json)
        return Result.succeeded(report, diagnostics) if snapshot.success

        failure = Failure.from_error_json(
          snapshot.error, step: :verify, diagnostics: diagnostics
        )
        Result.new(value: report, diagnostics: diagnostics, failure: failure)
      end

      private

      def artifact(snapshot, diagnostics, client, origin)
        DocumentArtifact.new(
          bytes: snapshot.pdf, diagnostics: diagnostics, client: client,
          page_count: page_count(snapshot.json), origin: origin
        )
      end

      def refused(snapshot, step, diagnostics)
        Result.failed(
          Failure.from_error_json(snapshot.error, step: step, diagnostics: diagnostics)
        )
      end

      # Absent (not zero) on a signed artifact: signing appends a revision to
      # bytes it never laid out, and the surface returns no JSON payload for
      # it at all.
      def page_count(json)
        json.empty? ? nil : JSON.parse(json)["pageCount"]
      end
    end
  end
end

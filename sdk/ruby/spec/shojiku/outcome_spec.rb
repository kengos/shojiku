# frozen_string_literal: true

# The Snapshot → Result seam, tested over Snapshots built here.
#
# Everything else in this suite runs against the real library, and these do
# too wherever the library can produce the case. What it cannot produce is a
# verify result that CARRIES diagnostics: the verify operation emits none
# today, by design (`shojiku_verify` attaches an empty list so every operation
# has the same result shape). The binding must still carry whatever arrives,
# because an operation that drops them makes its result mean something
# different from every other operation's — and the day the engine has
# something to say about a document it verified, no SDK should need a change.
#
# A Snapshot is a value object, not a boundary mock: it is exactly what the
# engine hands the binding, and constructing one asserts nothing about how the
# library behaves.
RSpec.describe Shojiku::Outcome, :aggregate_failures do
  def snapshot(success:, json: "", diagnostics: "", error: "", status: 0)
    Shojiku::Snapshot.new(status: status, success: success, pdf: "", json: json,
                          diagnostics: diagnostics, error: error)
  end

  def diagnostics_json
    JSON.generate(items: [{ severity: "warning", code: "example_code", message: "noticed" }])
  end

  def report_json
    JSON.generate(
      valid: true,
      signature: { status: "passed" }, coverage: { status: "passed" },
      certificateValidity: { status: "passed" }, trustChain: { status: "passed" },
      notChecked: %w[revocation timestamp]
    )
  end

  describe ".verdict" do
    it "carries diagnostics through a passing verdict" do
      result = described_class.verdict(
        snapshot(success: true, json: report_json, diagnostics: diagnostics_json)
      )

      expect(result).to be_success
      expect(result.report).to be_valid
      expect(result.diagnostics.map(&:code)).to eq(%w[example_code])
    end

    it "carries them through a failing one too, onto the failure as well" do
      error = JSON.generate(kind: "signature", message: "the signature did not verify")
      result = described_class.verdict(
        snapshot(success: false, json: report_json, diagnostics: diagnostics_json, error: error)
      )

      expect(result).to be_failure
      expect(result.diagnostics.map(&:code)).to eq(%w[example_code])
      expect(result.failure.diagnostics.map(&:code)).to eq(%w[example_code])
      expect(result.report).not_to be_nil
    end

    # "It did not verify" is a report; "there is nothing to verify" is a cause
    # with no report behind it.
    it "gives no report when the engine sent no payload" do
      error = JSON.generate(kind: "document", message: "no signature")

      expect(described_class.verdict(snapshot(success: false, error: error)).report).to be_nil
    end
  end

  describe ".guard!" do
    it "passes a status of zero through" do
      expect { described_class.guard!(snapshot(success: true)) }.not_to raise_error
    end

    it "raises for the caller-error level, quoting what the surface said" do
      expect { described_class.guard!(snapshot(success: false, status: 4, error: "too large")) }
        .to raise_error(Shojiku::UsageError, /status 4.*too large/)
    end
  end
end

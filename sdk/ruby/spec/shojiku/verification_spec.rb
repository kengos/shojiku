# frozen_string_literal: true

RSpec.describe "verification", :aggregate_failures do
  it "verifies a document against the certificate that signed it" do
    result = signed.verify(anchors: key_path("rsa2048.cert.pem"))

    expect(result).to be_success
    expect(result.report).to be_valid
    expect(result.report.checks.values).to all(be_passed)
  end

  # The single most important thing this binding must not do. A "valid"
  # verdict that quietly skipped revocation turns a missing capability into a
  # false assurance — so the omissions travel with a PASSING verdict too, and
  # dropping them on the way through an SDK would be the same lie one layer
  # up.
  it "carries the checks this release does not perform, on a passing verdict" do
    report = signed.verify(anchors: key_path("rsa2048.cert.pem")).report

    expect(report.not_checked).to eq(%i[revocation timestamp])
  end

  it "carries them on a failing verdict as well" do
    result = tampered.verify(anchors: key_path("rsa2048.cert.pem"))

    expect(result).to be_failure
    expect(result.report.not_checked).to eq(%i[revocation timestamp])
  end

  # A signature that does not verify is DATA, not an exception — and the
  # verdict is the result's success, so a caller who checks only `success?`
  # fails closed rather than being told a forgery is fine.
  it "fails the result when the signed bytes were altered, and says which check" do
    result = tampered.verify(anchors: key_path("rsa2048.cert.pem"))

    expect(result).to be_failure
    expect(result.failure.step).to eq(:verify)
    expect(result.failure.kind).to eq("signature")
    expect(result.report).not_to be_valid
    expect(result.report.signature).not_to be_passed
    expect(result.report.signature.reason).not_to be_empty
    # Separate fields, so "the bytes changed" is never confused with "the
    # chain is wrong".
    expect(result.report.trust_chain).to be_passed
  end

  it "renders a check for a log line, with the reason when there is one" do
    result = tampered.verify(anchors: key_path("rsa2048.cert.pem"))

    expect(result.report.coverage.to_s).to eq("passed")
    expect(result.report.signature.to_s).to start_with("failed: ")
  end

  it "fails the chain when the anchor signed nothing here" do
    result = signed.verify(anchors: key_path("other-ca.cert.pem"))

    expect(result.failure.kind).to eq("trust_chain")
    expect(result.report.signature).to be_passed
    expect(result.report.trust_chain).not_to be_passed
  end

  it "accepts a chain-issued leaf against its authority" do
    leaf = rendered.sign(signer(key: "leaf.key.pem", cert: "leaf.cert.pem")).artifact

    expect(leaf.verify(anchors: key_path("ca.cert.pem"))).to be_success
  end

  it "fails validity, not the signature, for an expired certificate" do
    expired = rendered.sign(signer(key: "leaf.key.pem", cert: "leaf-expired.cert.pem")).artifact
    result = expired.verify(anchors: key_path("ca.cert.pem"))

    expect(result.failure.kind).to eq("certificate_validity")
    expect(result.report.signature).to be_passed
  end

  it "takes several anchor files at once, as the CLI takes several flags" do
    result = signed.verify(anchors: [key_path("other-ca.cert.pem"), key_path("rsa2048.cert.pem")])

    expect(result).to be_success
  end

  it "takes anchors as bytes, for a certificate that never touched disk" do
    result = signed.verify(anchors_pem: key_bytes("rsa2048.cert.pem"))

    expect(result).to be_success
  end

  # "It did not verify" is a report; "there is nothing to verify" is a cause
  # with no report behind it. An SDK that conflated them would show a caller
  # an empty report and let them read it as four passed checks.
  it "gives no report at all for a document with no signature in it" do
    result = rendered.verify(anchors: key_path("rsa2048.cert.pem"))

    expect(result).to be_failure
    expect(result.report).to be_nil
    expect(result.failure.kind).to eq("document")
  end

  it "reports unusable anchors as a failed result" do
    result = signed.verify(anchors_pem: "-----BEGIN NONSENSE-----")

    expect(result).to be_failure
    expect(result.failure.kind).to eq("anchors")
  end

  it "reports an unreadable anchor file as a failed result, not an exception" do
    result = signed.verify(anchors: "/nonexistent/ca.pem")

    expect(result).to be_failure
    expect(result.failure.kind).to eq("anchor_unreadable")
  end

  it "requires anchors, since there is no trust store to fall back on" do
    expect { signed.verify }.to raise_error(Shojiku::UsageError, /anchors:/)
  end

  # The PDF version digit: inside the signed revision, so the signature is
  # what breaks, and semantically harmless, so the document still PARSES. A
  # tamper that also broke parsing would come back as "cannot be evaluated"
  # and prove the wrong thing.
  def tampered
    bytes = signed.bytes.dup
    bytes[7] = "6"
    client.artifact(bytes)
  end
end

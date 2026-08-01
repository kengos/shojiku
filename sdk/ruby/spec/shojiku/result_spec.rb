# frozen_string_literal: true

RSpec.describe Shojiku::Result do
  it "names the same object after what the operation produced" do
    result = client.generate("receipt", {})

    expect(result.artifact).to be(result.value)
    expect(result.report).to be(result.value)
  end

  it "splits diagnostics by severity" do
    result = client.generate("warns", {})

    expect(result.warnings).not_to be_empty
    expect(result.errors).to be_empty
    expect(result.warnings.first).to be_warning
  end

  it "reports a failure as a failure and not a success" do
    result = client.generate("broken", {})

    expect(result).to be_failure
    expect(result).not_to be_success
    expect(result.errors.first).to be_error
  end

  # The opt-in bridge to exception-style control flow, and the one place this
  # API raises for something other than a misused argument. The ruling it
  # rests on is frozen for every SDK: calling unwrap on a failed result is
  # programmer misuse, because a caller who has not checked `success?` is
  # asserting the operation worked.
  describe "unwrapping" do
    it "hands back the value under either name when the operation worked" do
      result = client.generate("receipt", {})

      expect(result.artifact!).to be(result.value)
      expect(result.report!).to be(result.value)
    end

    it "raises the failure, rather than returning nil, when it did not" do
      result = client.generate("broken", {})

      expect { result.artifact! }
        .to raise_error(Shojiku::UnwrapError, %r{generate/document})
    end

    it "carries the whole failure on the exception, so nothing is lost" do
      result = client.generate("broken", {})

      begin
        result.report!
      rescue Shojiku::UnwrapError => e
        expect(e.failure).to be(result.failure)
        expect(e.failure.diagnostics.map(&:code)).to include("image_source_missing")
      end
    end

    # An unwrap of a signing failure reaches an exception reporter, which is
    # exactly the audience that must not receive key material.
    it "echoes no key material when a signing failure is unwrapped" do
      key = key_bytes("rsa2048.enc.pem")
      secret = key.lines.find { |line| line.length > 40 && !line.start_with?("-----") }.strip

      expect { rendered.sign(signer(key: "rsa2048.enc.pem")).artifact! }
        .to raise_error(Shojiku::UnwrapError) { |error| expect(error.message).not_to include(secret) }
    end
  end
end

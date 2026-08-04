# frozen_string_literal: true

require "openssl"

RSpec.describe Shojiku::ExternalSigner, :aggregate_failures do
  # The stand-in for the key service is OpenSSL, which is a genuinely
  # different implementation from the engine's own backend. That is the point:
  # if the bytes handed out are wrong, a signature produced by other code over
  # them will not verify, and no amount of agreement between the engine and
  # itself would show it.
  def signing_block(key_file)
    key = OpenSSL::PKey.read(File.read(key_path(key_file)))
    ->(to_be_signed) { key.sign(OpenSSL::Digest.new("SHA256"), to_be_signed) }
  end

  # A block that never runs: these examples fail in the constructor, before
  # anything could be signed.
  def stub
    ->(_to_be_signed) { "unused" }
  end

  def external(key_file: "rsa2048.key.pem", cert: "rsa2048.cert.pem",
               algorithm: :rsa_pkcs1_sha256, &block)
    block ||= signing_block(key_file)
    described_class.new(cert: key_path(cert), algorithm: algorithm, &block)
  end

  it "signs with a key this process never hands to the engine" do
    result = rendered.sign(external)

    expect(result).to be_success
    # Append-only, exactly as the in-process provider is.
    expect(result.artifact.bytes[0, rendered.bytes.bytesize]).to eq(rendered.bytes)
    expect(result.artifact.verify(anchors: key_path("rsa2048.cert.pem"))).to be_success
  end

  it "signs on the other supported curve" do
    provider = external(key_file: "ec256.key.pem", cert: "ec256.cert.pem",
                        algorithm: :ecdsa_p256_sha256)
    result = rendered.sign(provider)

    expect(result).to be_success
    expect(result.artifact.verify(anchors: key_path("ec256.cert.pem"))).to be_success
  end

  it "produces the same bytes the in-process provider does for the same key" do
    # The two providers must not be two implementations of signing. RSA
    # PKCS#1 v1.5 is deterministic, so identical bytes is the strongest form
    # this claim can take.
    expect(rendered.sign(external).artifact.bytes).to eq(rendered.sign(signer).artifact.bytes)
  end

  it "hands the block the signed attributes rather than the document digest" do
    # A caller who signs the wrong thing gets a document that fails
    # verification, so what the block receives is contract. 32 bytes would be
    # the bare SHA-256; this is a DER structure containing it.
    seen = nil
    inner = signing_block("rsa2048.key.pem")
    provider = external do |to_be_signed|
      seen = to_be_signed
      inner.call(to_be_signed)
    end

    expect(rendered.sign(provider)).to be_success
    expect(seen.bytesize).to be > 32
    expect(seen.encoding).to eq(Encoding::BINARY)
  end

  it "takes the certificate as bytes already in memory" do
    provider = described_class.new(cert_pem: key_bytes("rsa2048.cert.pem"),
                                   algorithm: :rsa_pkcs1_sha256,
                                   &signing_block("rsa2048.key.pem"))

    expect(rendered.sign(provider)).to be_success
  end

  it "accepts the algorithm as a String, since configuration files produce them" do
    provider = described_class.new(cert: key_path("rsa2048.cert.pem"),
                                   algorithm: "rsa_pkcs1_sha256",
                                   &signing_block("rsa2048.key.pem"))

    expect(rendered.sign(provider)).to be_success
  end

  describe "misuse" do
    it "refuses both certificate forms at once, and neither" do
      expect { described_class.new(cert: "a", cert_pem: "b", algorithm: :rsa_pkcs1_sha256, &stub) }
        .to raise_error(Shojiku::UsageError, /not both/)
      expect { described_class.new(algorithm: :rsa_pkcs1_sha256, &stub) }
        .to raise_error(Shojiku::UsageError, /needs either/)
    end

    it "refuses a missing or unknown algorithm, naming the ones it takes" do
      expect { described_class.new(cert: "a", &stub) }
        .to raise_error(Shojiku::UsageError, /:rsa_pkcs1_sha256/)
      expect { described_class.new(cert: "a", algorithm: :rsa_pss_sha512, &stub) }
        .to raise_error(Shojiku::UsageError, /must be one of/)
    end

    it "refuses a provider with no block, since there would be nothing to sign with" do
      expect { described_class.new(cert: "a", algorithm: :rsa_pkcs1_sha256) }
        .to raise_error(Shojiku::UsageError, /block/)
    end

    it "refuses a block that returns something other than signature bytes" do
      [nil, 42, ""].each do |returned|
        provider = external { returned }

        expect { rendered.sign(provider) }
          .to raise_error(Shojiku::UsageError, /non-empty String/)
      end
    end

    it "lets the block's own exception through rather than filing it as a document failure" do
      # The block is the caller's code talking to the caller's key service. An
      # outage there is not a fact about this document, and burying it in a
      # failed Result is how it would be read as one.
      provider = external { raise IOError, "the key service is unreachable" }

      expect { rendered.sign(provider) }.to raise_error(IOError, /unreachable/)
    end

    it "reports an unreadable certificate as a failed result, not an exception" do
      provider = described_class.new(cert: "/nowhere/signer.crt", algorithm: :rsa_pkcs1_sha256,
                                     &signing_block("rsa2048.key.pem"))
      result = rendered.sign(provider)

      expect(result).to be_failure
      expect(result.failure.step).to eq(:sign)
    end

    it "does not run the block when preparing already failed" do
      # An unusable certificate is discovered before the round trip, which is
      # why `prepare` takes one at all.
      called = false
      provider = described_class.new(cert_pem: "-----BEGIN NONSENSE-----",
                                     algorithm: :rsa_pkcs1_sha256) do
        called = true
        "x"
      end
      result = rendered.sign(provider)

      expect(result).to be_failure
      expect(called).to be(false)
    end
  end

  describe "redaction" do
    it "prints the certificate's form and the algorithm, and nothing it closed over" do
      provider = described_class.new(cert: "/keys/signer.crt", algorithm: :ecdsa_p256_sha256, &stub)

      expect(provider.inspect).to eq(
        "#<Shojiku::ExternalSigner cert=/keys/signer.crt algorithm=ecdsa-p256-sha256>"
      )
    end

    it "says so when the certificate came from memory, without printing it" do
      provider = described_class.new(cert_pem: "-----BEGIN CERTIFICATE-----\ndistinctive\n",
                                     algorithm: :rsa_pkcs1_sha256, &stub)

      expect(provider.inspect).to include("[pem bytes]")
      expect(provider.inspect).not_to include("distinctive")
    end
  end

  describe "under a strict client" do
    it "signs when registered by name, exactly as the in-process provider does" do
      strict = client(strict: true, providers: { "kms" => external })
      artifact = strict.generate("receipt", customer: { name: "Yamada Shoji K.K." }).artifact

      expect(strict.sign(artifact, :kms)).to be_success
    end

    it "gets no exemption from the rule that a provider object is refused" do
      strict = client(strict: true, providers: { kms: external })
      artifact = strict.generate("receipt", customer: { name: "Yamada Shoji K.K." }).artifact

      expect { strict.sign(artifact, external) }
        .to raise_error(Shojiku::UsageError, /registered in configuration/)
    end
  end
end

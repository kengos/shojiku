# frozen_string_literal: true

RSpec.describe "signing", :aggregate_failures do
  it "signs a rendered document, appending rather than rewriting" do
    result = rendered.sign(signer)

    expect(result).to be_success
    # Append-only is the whole trust story: the input must be a byte-for-byte
    # PREFIX of the output, not merely "still a PDF".
    expect(result.artifact.bytes.bytesize).to be > rendered.bytes.bytesize
    expect(result.artifact.bytes[0, rendered.bytes.bytesize]).to eq(rendered.bytes)
  end

  it "reports no page count for a signed artifact, having laid nothing out" do
    # A zero would read as "a document with no pages"; nil is the honest
    # answer for an operation that never measured anything.
    expect(rendered.sign(signer).artifact.page_count).to be_nil
  end

  it "signs with an encrypted key when the passphrase is supplied" do
    provider = signer(key: "rsa2048.enc.pem", passphrase: passphrase)

    expect(rendered.sign(provider)).to be_success
  end

  it "names the missing passphrase rather than failing to parse the key" do
    result = rendered.sign(signer(key: "rsa2048.enc.pem"))

    expect(result).to be_failure
    expect(result.failure.step).to eq(:sign)
    expect(result.failure.kind).to eq("passphrase_required")
  end

  it "fails structurally on a wrong passphrase" do
    provider = signer(key: "rsa2048.enc.pem", passphrase: "not the passphrase")
    result = rendered.sign(provider)

    expect(result).to be_failure
    expect(result.failure.kind).to eq("key")
  end

  it "signs from key material already in memory" do
    provider = Shojiku::LocalPem.new(
      key_pem: key_bytes("ec256.key.pem"), cert_pem: key_bytes("ec256.cert.pem")
    )

    expect(rendered.sign(provider)).to be_success
  end

  it "reports an unreadable key as a failed result, not an exception" do
    result = rendered.sign(Shojiku::LocalPem.new(key: "/nope.pem",
                                                 cert: key_path("rsa2048.cert.pem")))

    expect(result).to be_failure
    expect(result.failure.kind).to eq("key_unreadable")
  end

  it "reports an unreadable certificate the same way" do
    result = rendered.sign(Shojiku::LocalPem.new(key: key_path("rsa2048.key.pem"),
                                                 cert: "/nope.pem"))

    expect(result.failure.kind).to eq("certificate_unreadable")
  end

  it "needs a key and a certificate, in one form or the other" do
    expect { Shojiku::LocalPem.new(cert: "c.pem") }
      .to raise_error(Shojiku::UsageError, /`key:`.*`key_pem:`/)
    expect { Shojiku::LocalPem.new(key: "k.pem") }
      .to raise_error(Shojiku::UsageError, /`cert:`.*`cert_pem:`/)
  end

  # Explicit in BOTH directions. Preferring one form when both are given
  # ignores the argument the caller meant — the same mistake as sniffing,
  # one layer quieter, and on the path where reading the wrong key matters
  # most.
  it "refuses both forms of the same material at once" do
    expect { Shojiku::LocalPem.new(key: "k.pem", key_pem: "bytes", cert: "c.pem") }
      .to raise_error(Shojiku::UsageError, /not both/)
    expect { Shojiku::LocalPem.new(key: "k.pem", cert: "c.pem", cert_pem: "bytes") }
      .to raise_error(Shojiku::UsageError, /not both/)
  end

  it "refuses both anchor forms at once, and demands one of them" do
    expect { signed.verify(anchors: key_path("rsa2048.cert.pem"), anchors_pem: "bytes") }
      .to raise_error(Shojiku::UsageError, /not both/)
    expect { signed.verify }
      .to raise_error(Shojiku::UsageError, /`anchors:`.*`anchors_pem:`/)
  end

  # `inspect` is not a debugging nicety here: it is what an exception
  # reporter prints for a local variable, what `pp` writes to a console, and
  # what any log line interpolating the provider emits. The default prints
  # every instance variable — which for this object is the private key and
  # the passphrase.
  describe "#inspect" do
    it "shows neither key material nor the passphrase" do
      provider = Shojiku::LocalPem.new(key_pem: key_bytes("rsa2048.enc.pem"),
                                       cert_pem: key_bytes("rsa2048.cert.pem"),
                                       passphrase: "a distinctive passphrase")
      secret = provider.key.lines.find { |l| l.length > 40 && !l.start_with?("-----") }.strip

      expect(provider.inspect).not_to include(secret, "a distinctive passphrase")
      expect(provider.inspect).to include("[redacted]", "[pem bytes]")
    end

    it "still says enough to tell which provider loaded the wrong material" do
      provider = Shojiku::LocalPem.new(key: "/keys/signer.key", cert: "/keys/signer.crt")

      expect(provider.inspect)
        .to eq("#<Shojiku::LocalPem key=/keys/signer.key cert=/keys/signer.crt passphrase=none>")
    end

    # The provider is reachable from a registry, so the redaction has to hold
    # through whatever prints the container as well.
    it "holds when the provider is printed inside a registry" do
      registry = { invoice: Shojiku::LocalPem.new(key_pem: "-----BEGIN KEY-----\nsecretbytes\n",
                                                  cert_pem: "cert", passphrase: "pass") }

      expect(registry.inspect).not_to include("secretbytes", "pass\"")
    end
  end

  # This binding is what hands an error to another process's logger, so the
  # claim is worth pinning HERE and not only in the engine's own suite.
  it "never echoes key material or the passphrase in a failure" do
    key = key_bytes("rsa2048.enc.pem")
    secret = key.lines.find { |line| line.length > 40 && !line.start_with?("-----") }.strip
    distinctive = "a distinctive wrong passphrase"

    [signer(key: "rsa2048.enc.pem"),
     signer(key: "rsa2048.enc.pem", passphrase: distinctive)].each do |provider|
      message = rendered.sign(provider).failure.message

      expect(message).not_to include(secret)
      expect(message).not_to include(distinctive)
    end
  end
end

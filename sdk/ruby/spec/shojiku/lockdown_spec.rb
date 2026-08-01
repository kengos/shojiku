# frozen_string_literal: true

RSpec.describe Shojiku::Lockdown, :aggregate_failures do
  let(:providers) { { invoice: signer } }

  def strict_client
    client(strict: true, providers: providers)
  end

  # One clause of the ceiling per example. A lockdown tested as a whole
  # reports "something was refused" and stops proving which rule did it.
  describe "the entrances it closes" do
    it "refuses the bytes-first entrance, so every signed document came from the root" do
      expect { strict_client.generate_source(template: "irrelevant", params: {}) }
        .to raise_error(Shojiku::UsageError, /generate_source` is disabled/)
    end

    it "still renders from the template root" do
      expect(strict_client.generate("receipt", customer: { name: "Yamada Shoji K.K." }))
        .to be_success
    end

    it "refuses to sign a document handed to it whole" do
      loaded = strict_client.artifact(signed.bytes)

      expect { strict_client.sign(loaded, :invoice) }
        .to raise_error(Shojiku::UsageError, /only a document rendered from its own template/)
    end

    # The gap a boolean "was it loaded" would leave open: these bytes WERE
    # laid out by the engine, from a template the caller supplied. Same trust
    # class as handing over the PDF.
    it "refuses to sign another client's bytes-first render" do
      elsewhere = client.generate_source(
        template: source_template(text_item("customer.name")), params: {}
      ).artifact

      expect(elsewhere.origin).to eq(:source)
      expect { strict_client.sign(elsewhere, :invoice) }
        .to raise_error(Shojiku::UsageError, /this one is source/)
    end

    # Verification is never restricted. A locked-down deployment is precisely
    # the one that has to check an archived document it did not produce, and
    # refusing that would make strict a reason to skip verifying.
    it "verifies a loaded artifact all the same" do
      loaded = strict_client.artifact(signed.bytes)

      expect(loaded.verify(anchors: key_path("rsa2048.cert.pem"))).to be_success
    end
  end

  describe "signing material" do
    it "signs with the name of a registered provider" do
      result = strict_client.sign(rendered, :invoice)

      expect(result).to be_success
      expect(result.artifact.bytes).to start_with("%PDF-")
    end

    it "refuses a provider object, so key paths stay out of request handling" do
      expect { strict_client.sign(rendered, signer) }
        .to raise_error(Shojiku::UsageError, /not with a provider object/)
    end

    # A configuration hash keyed by strings is the ordinary Ruby spelling of
    # this, and it must not answer "no provider named `invoice`" for a
    # provider named exactly that.
    it "finds a provider registered under a String name" do
      strung = client(strict: true, providers: { "invoice" => signer })

      expect(strung.sign(rendered, :invoice)).to be_success
      expect(strung.sign(rendered, "invoice")).to be_success
    end

    it "names an unregistered provider without echoing anything else" do
      expect { strict_client.sign(rendered, :payroll) }
        .to raise_error(Shojiku::UsageError, /no signing provider named `payroll`/)
    end

    # The name reaches an exception reporter and a log line, so it is bounded
    # and stripped exactly as a template name is.
    it "strips control characters out of the name it echoes" do
      expect { strict_client.sign(rendered, "pay\x00roll\n") }
        .to raise_error(Shojiku::UsageError, /named `payroll`/)
    end

    # Naming providers is good practice everywhere; only REFUSING the
    # alternative belongs to strict.
    it "resolves a registered name on a client that is not strict" do
      expect(client(providers: providers).sign(rendered, :invoice)).to be_success
    end

    it "still takes a provider object when the client is not strict" do
      expect(client.sign(rendered, signer)).to be_success
    end
  end

  # The one place `configure` beats a call site. Strictness is a restriction
  # rather than a default: an operator who declared a lockdown must not have
  # it lifted by application code, or the ceiling is only a suggestion.
  describe "precedence" do
    it "keeps strictness a configured operator declaration cannot lift" do
      Shojiku.configure { |config| config.strict = true }

      expect { client(strict: false).generate_source(template: "x", params: {}) }
        .to raise_error(Shojiku::UsageError, /generate_source` is disabled/)
    end

    it "is off unless something turns it on" do
      expect(described_class.new(strict: false)).not_to be_strict
      expect(described_class.new(strict: true)).to be_strict
    end
  end
end

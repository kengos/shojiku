# frozen_string_literal: true

RSpec.describe Shojiku::Client do
  describe "#engine_info" do
    it "reports what this build can do, before any template exists" do
      info = client.engine_info

      expect(info["capabilities"]).to be_an(Array).and(be_any)
      expect(info["builtinLocales"]).to be_an(Array).and(be_any)
    end

    # A plain Hash on purpose, and pinned so the decision is visible rather
    # than incidental: the payload is an append-only wire this SDK does not
    # model, exactly as a diagnostic's typed args pass through untranslated.
    # A typed object would owe a field in seven languages every time the
    # engine adds one.
    it "hands the payload over as a plain Hash, unmodelled" do
      expect(client.engine_info).to be_a(Hash)
    end
  end

  describe "#generate" do
    it "renders a template with params and hands back the bytes" do
      result = client.generate("receipt", customer: { name: "Yamada Shoji K.K." })

      expect(result).to be_success
      expect(result.failure).to be_nil
      expect(result.artifact.bytes).to start_with("%PDF-")
      expect(result.artifact.page_count).to eq(1)
      expect(result.diagnostics).to be_empty
    end

    it "accepts params that are already a JSON string" do
      result = client.generate("receipt", '{"customer":{"name":"Direct JSON"}}')

      expect(result).to be_success
    end

    # A render that WORKED can still have warned. A caller who only inspects
    # failures never sees these, which is why they ride the success too.
    it "succeeds with diagnostics attached when the engine only warns" do
      result = client.generate("warns", {})

      expect(result).to be_success
      expect(result.warnings.map(&:code)).to include("text_overflow")
      expect(result.errors).to be_empty
    end

    it "fails with the engine's diagnostics when the document is refused" do
      result = client.generate("broken", {})

      expect(result).to be_failure
      expect(result.failure.step).to eq(:generate)
      expect(result.errors.map(&:code)).to include("image_source_missing")
    end

    # The engine's stable contract, carried untranslated. A translating
    # consumer renders its own message from `code` plus `args`; this binding
    # must not have consumed either on the way through.
    it "preserves the diagnostic code and its typed arguments verbatim" do
      warning = client.generate("warns", {}).warnings.first

      expect(warning.code).to eq("text_overflow")
      expect(warning.args).to include("avail" => 24.0, "content" => 25.2)
      expect(warning.severity).to eq("warning")
      expect(warning.path).to eq("sections.body.items[0]")
    end

    # A hostile template name is a fact about the request, not a bug in the
    # calling program — so it is a failed result, never an exception.
    it "returns a failed result for a refused template name" do
      result = client.generate("../escape", {})

      expect(result).to be_failure
      expect(result.failure.kind).to eq("template_name")
    end

    # A name that is not a String is the calling program contradicting
    # itself, not a hostile request — so it raises rather than coming back as
    # data. Before the split, a Symbol passed every name rule and died inside
    # `File.join` as a `TypeError` from a method the caller never invoked.
    it "raises for a template name that is not a String" do
      expect { client.generate(:receipt) }
        .to raise_error(Shojiku::UsageError, /must be a String/)
    end

    it "still returns a failed result for a hostile String name" do
      expect(client.generate("../escape")).to be_failure
    end

    it "carries the underlying io cause under a name that resolved to nothing" do
      result = client.generate("nonexistent", {})

      expect(result.failure.kind).to eq("template_not_found")
      expect(result.failure.causes.map(&:kind)).to eq(%w[template_not_found io])
      expect(result.failure.cause.message).to include("No such file")
    end
  end

  # A multi-locale application renders one template in each buyer's locale.
  # Ruby spells the override as a derived client rather than a `lang:`
  # keyword, because `generate` takes its params as a trailing Hash and a
  # keyword beside it would turn `generate("receipt", customer: …)` into an
  # `unknown keyword: :customer` error. What the other SDKs mirror is that a
  # per-call locale beats the client-wide one.
  describe "#with_lang" do
    it "renders in the locale the derived client names" do
      expect(client(lang: "en-US").with_lang("ja-JP").generate("receipt")).to be_success
    end

    it "beats the locale the client was built with" do
      result = client(lang: "en-US").with_lang("zz-ZZ").generate("receipt")

      expect(result).to be_failure
      expect(result.failure.kind).to eq("locale_pack")
    end

    it "leaves the client it derived from alone" do
      original = client(lang: "en-US")
      original.with_lang("zz-ZZ")

      expect(original.generate("receipt")).to be_success
    end

    it "shares the opened library rather than loading a second one" do
      original = client
      derived = original.with_lang("ja-JP")
      engine_of = ->(c) { c.send(:instance_variable_get, :@engine) }

      expect(derived.generate("receipt")).to be_success
      expect(engine_of.call(derived)).to be(engine_of.call(original))
    end
  end

  describe "the template root" do
    it "prefers an explicit templates: over the environment" do
      with_env("SHOJIKU_TEMPLATE_ROOT" => "/nonexistent") do
        engine_client = described_class.new(
          templates: EngineFixtures::FIXTURE_TEMPLATES, font_dirs: font_dirs,
          locale_dirs: locale_dirs, library: engine_library
        )

        expect(engine_client.generate("receipt", {})).to be_success
      end
    end

    it "falls back to SHOJIKU_TEMPLATE_ROOT when nothing was configured" do
      with_env("SHOJIKU_TEMPLATE_ROOT" => EngineFixtures::FIXTURE_TEMPLATES) do
        engine_client = described_class.new(
          font_dirs: font_dirs, locale_dirs: locale_dirs, library: engine_library
        )

        expect(engine_client.generate("receipt", {})).to be_success
      end
    end

    it "ignores the environment entirely when env: false" do
      with_env("SHOJIKU_TEMPLATE_ROOT" => EngineFixtures::FIXTURE_TEMPLATES) do
        engine_client = described_class.new(library: engine_library, env: false)

        expect { engine_client.generate("receipt", {}) }
          .to raise_error(Shojiku::UsageError, /no template root/)
      end
    end

    it "reads the font and locale directories from the environment too" do
      with_env("SHOJIKU_FONT_DIR" => font_dirs.join(File::PATH_SEPARATOR),
               "SHOJIKU_LOCALE_DIR" => locale_dirs.join(File::PATH_SEPARATOR)) do
        engine_client = described_class.new(
          templates: EngineFixtures::FIXTURE_TEMPLATES, library: engine_library
        )

        expect(engine_client.generate("receipt", {})).to be_success
      end
    end
  end

  # The C surface's two levels, kept apart. A non-zero status means the CALLER
  # got it wrong, which is programmer misuse in Ruby terms; everything a
  # DOCUMENT can do wrong is a failed Result.
  describe "the two levels of failure" do
    # A locale nobody has a pack for is an OUTCOME, not caller misuse: the
    # call was well formed and the environment could not satisfy it. It comes
    # back as a failed result with a named cause, never as an exception.
    it "reports a missing locale pack as a failed result" do
      result = client(lang: "zz-ZZ").generate("receipt", {})

      expect(result).to be_failure
      expect(result.failure.step).to eq(:generate)
      expect(result.failure.kind).to eq("locale_pack")
    end

    # Params that are not valid UTF-8 have nothing the engine could render,
    # so they are misuse — but the exception has to be THIS gem's, not a
    # `JSON::GeneratorError` escaping from a dependency the caller never
    # invited into their rescue clauses.
    it "raises its own error for params that cannot be serialized as UTF-8" do
      expect { client.generate("receipt", customer: { name: "\xff\xfe".b }) }
        .to raise_error(Shojiku::UsageError, /could not be serialized as UTF-8/)
    end

    # And the other level: an argument past a hard cap the C surface
    # documents is the CALLER's mistake, so it raises rather than pretending
    # a document was refused.
    it "raises for an input past the C surface's own cap" do
      oversized = client.artifact("x" * ((64 * 1024 * 1024) + 1))

      expect { oversized.verify(anchors_pem: key_bytes("rsa2048.cert.pem")) }
        .to raise_error(Shojiku::UsageError, /status 4/)
    end
  end

  def with_env(values)
    previous = values.keys.to_h { |key| [key, ENV.fetch(key, nil)] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end
end

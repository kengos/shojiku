# frozen_string_literal: true

RSpec.describe Shojiku::Config, :aggregate_failures do
  # `configure` is ecosystem idiom OVER the frozen constructor, never a third
  # precedence layer — so every example here is about where it sits relative
  # to the two layers that already existed.
  describe "precedence" do
    it "feeds the constructor, so a configured root needs no argument" do
      Shojiku.configure do |config|
        config.templates = EngineFixtures::FIXTURE_TEMPLATES
        config.font_dirs = font_dirs
        config.locale_dirs = locale_dirs
        config.library = engine_library
        config.env = false
      end

      expect(Shojiku::Client.new.generate("receipt")).to be_success
    end

    it "loses to an explicit constructor argument" do
      Shojiku.configure { |config| config.templates = "/nonexistent" }

      expect(client.generate("receipt")).to be_success
    end

    # What an application renders is the application's own decision, so a
    # configured root beats the environment exactly as an explicit one does.
    it "beats the environment for the template root" do
      with_env("SHOJIKU_TEMPLATE_ROOT" => "/nonexistent") do
        Shojiku.configure { |config| config.templates = EngineFixtures::FIXTURE_TEMPLATES }

        expect(configured_client.generate("receipt")).to be_success
      end
    end

    # And the deliberate asymmetry survives the new layer: WHERE THE ENGINE
    # LIVES stays an operator decision that wins over application code,
    # however the application spells its configuration.
    it "still loses to SHOJIKU_LIBRARY for the engine library" do
      with_env("SHOJIKU_LIBRARY" => "/nonexistent/libshojiku_capi.so") do
        Shojiku.configure { |config| config.library = engine_library }

        expect { Shojiku::Client.new }.to raise_error(Shojiku::LibraryNotFound)
      end
    end

    it "leaves `env: false` in charge of the environment" do
      with_env("SHOJIKU_TEMPLATE_ROOT" => EngineFixtures::FIXTURE_TEMPLATES) do
        Shojiku.configure { |config| config.library = engine_library }

        expect { Shojiku::Client.new(env: false).generate("receipt") }
          .to raise_error(Shojiku::UsageError, /no template root/)
      end
    end
  end

  describe "the settings themselves" do
    # Typo safety at both layers: the constructor's explicit keywords catch a
    # misspelling at the call site, and this catches one that reached the
    # merge — a silently ignored setting is how a template root, or a
    # lockdown, quietly fails to apply.
    it "reports a misspelled setting instead of ignoring it" do
      expect { described_class.new.merge(tempaltes: "typo") }
        .to raise_error(Shojiku::UsageError, /unknown client setting `tempaltes`/)
      expect { Shojiku::Client.new(tempaltes: "typo") }
        .to raise_error(ArgumentError, /unknown keyword/)
    end

    it "treats an absent argument as unset rather than as nil" do
      configured = described_class.new
      configured.lang = "ja-JP"

      expect(configured.merge(lang: nil).lang).to eq("ja-JP")
      expect(configured.merge(lang: "en-US").lang).to eq("en-US")
    end

    it "starts with nothing configured" do
      expect(described_class.new.templates).to be_nil
      expect(described_class.new.strict).to be(false)
      expect(described_class.new.providers).to eq({})
    end

    # A client that declares its own registry is stating the whole set it may
    # sign with; quietly unioning it with globally-registered keys would let
    # configuration widen what a call site narrowed.
    it "replaces the provider registry rather than merging it" do
      configured = described_class.new
      configured.providers = { global: :a }

      expect(configured.merge(providers: { local: :b }).providers).to eq(local: :b)
    end
  end

  describe ".reset_configuration!" do
    it "drops every configured default" do
      Shojiku.configure { |config| config.lang = "ja-JP" }
      Shojiku.reset_configuration!

      expect(Shojiku.config.lang).to be_nil
    end
  end

  def configured_client
    Shojiku::Client.new(font_dirs: font_dirs, locale_dirs: locale_dirs, library: engine_library)
  end

  def with_env(values)
    previous = values.keys.to_h { |key| [key, ENV.fetch(key, nil)] }
    values.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end
end

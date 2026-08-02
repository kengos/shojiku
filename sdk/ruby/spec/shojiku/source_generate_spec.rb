# frozen_string_literal: true

# The bytes-first entrance: sources the APPLICATION already holds.
#
# The contract difference from `generate` is the whole point of these
# examples. There is no root, so there is no containment — and there is no
# filesystem read either, which is what keeps "no root" from meaning "any
# path". Fetching the bytes stays the application's act.
RSpec.describe "generate_source", :aggregate_failures do
  # No template root anywhere: not configured, not in the environment. A
  # client that will only ever render sources it is handed should not have to
  # invent a directory to satisfy a constructor.
  def rootless
    Shojiku::Client.new(font_dirs: font_dirs, locale_dirs: locale_dirs,
                        library: engine_library, env: false)
  end

  it "renders sources handed over as bytes, with no template root configured" do
    result = rootless.generate_source(
      template: source_template(text_item("customer.name")),
      params: { customer: { name: "Yamada Shoji K.K." } }
    )

    expect(result).to be_success
    expect(result.artifact.bytes).to start_with("%PDF-")
    expect(result.artifact.page_count).to eq(1)
    expect(result.diagnostics).to be_empty
  end

  it "has no template root to demand, unlike the name entrance" do
    expect(rootless.template_root).to be_nil
    expect { rootless.generate("receipt") }
      .to raise_error(Shojiku::UsageError, /no template root/)
  end

  # A String params is the caller's own source text and is passed through
  # verbatim; the engine parses YAML, of which JSON is a subset. The gem does
  # not re-encode it, and there is deliberately no per-format method family.
  it "takes params as YAML, not only as JSON" do
    result = rootless.generate_source(
      template: source_template(text_item("customer.name")),
      params: "customer:\n  name: From YAML\n"
    )

    expect(result).to be_success
  end

  # Definitions are the engineer↔author seam, so proving they are CONSUMED
  # needs a case that behaves differently with and without them: a binding to
  # an undeclared key is only a warning while nothing declares the schema, and
  # an error once something does.
  describe "definitions" do
    let(:template) { source_template(text_item("customer.rank")) }
    let(:params) { { customer: { name: "Yamada Shoji K.K." } } }
    let(:definitions) do
      <<~YAML
        version: 0.2.0
        type: object
        properties:
          customer:
            type: object
            properties:
              name: { type: string }
      YAML
    end

    it "only warns about an unbound key when no definitions declare one" do
      result = rootless.generate_source(template: template, params: params)

      expect(result).to be_success
      expect(result.warnings).not_to be_empty
    end

    it "refuses the same document once definitions declare the schema" do
      result = rootless.generate_source(template: template, definitions: definitions,
                                        params: params)

      expect(result).to be_failure
      expect(result.errors).not_to be_empty
    end
  end

  # Bundled assets belong to a template, not to a deployment, which is why the
  # directory is a per-call argument here rather than client configuration.
  describe "assets_dir" do
    let(:template) do
      source_template(<<~YAML)
        - id: logo
          type: image
          box: { x: 0, y: 0, w: 30, h: 30 }
          src: assets/logo.svg
      YAML
    end

    it "resolves a bundled asset against the directory the call names" do
      result = rootless.generate_source(
        template: template, assets_dir: EngineFixtures::SOURCE_ASSETS, params: {}
      )

      expect(result).to be_success
      expect(result.diagnostics).to be_empty
    end

    # Without a directory there is nothing for a relative source to resolve
    # against: an inline template has no directory of its own, and defaulting
    # to the working directory would make the engine read files nobody named.
    it "disables bundled sources when no directory is given" do
      result = rootless.generate_source(template: template, params: {})

      expect(result).to be_failure
    end

    # The bytes entrance drops CONTAINMENT of the template name, not of the
    # assets: `assets_dir` is still the only directory a bundled source may
    # resolve inside.
    it "refuses a bundled source that climbs out of the assets directory" do
      escaping = source_template(<<~YAML)
        - id: logo
          type: image
          box: { x: 0, y: 0, w: 30, h: 30 }
          src: ../../../../etc/hosts
      YAML

      result = rootless.generate_source(
        template: escaping, assets_dir: EngineFixtures::SOURCE_ASSETS, params: {}
      )

      expect(result).to be_failure
    end
  end

  # The single most important thing this entrance must NOT do. `template:` is
  # source text; a value that looks like a path is a template that fails to
  # parse, never a file this gem opens on the caller's behalf. If it ever
  # became a path, every containment rule the name entrance enforces would be
  # bypassable by spelling the same thing differently.
  it "treats a path-shaped template as SOURCE TEXT, never as a path to read" do
    result = rootless.generate_source(template: "/etc/passwd", params: {})

    expect(result).to be_failure
    expect(result.failure.step).to eq(:generate)
    expect(result.failure.kind).to eq("parse")
  end
end

# frozen_string_literal: true

# Fixtures shared by every spec: the real engine library, the repository's own
# font and locale packs, and generated key material.
#
# Nothing here is a stub. This SDK's whole job is to be a faithful binding, so
# a suite that mocked the boundary would test the mock. What it does avoid is
# repeating the setup: one client, one rendered document, one signed document,
# each built once per process.
module EngineFixtures
  REPO_ROOT = File.expand_path("../../../..", __dir__)
  FIXTURE_TEMPLATES = File.expand_path("../fixtures/templates", __dir__)

  # Generated, never committed: a repository checkout holds no private key,
  # and a leaked test key is worth nothing. The same generator the Rust suites
  # use, so both sides sign with the same shapes.
  def self.keys
    @keys ||= begin
      dir = File.join(Dir.tmpdir, "shojiku-ruby-keys-#{Process.pid}")
      system("sh", File.join(REPO_ROOT, "scripts/gen-test-keys.sh"), dir,
             out: File::NULL) || raise("the test-key generator failed")
      dir
    end
  end

  def key_path(name)
    File.join(EngineFixtures.keys, name)
  end

  def key_bytes(name)
    File.binread(key_path(name))
  end

  def passphrase
    File.read(key_path("passphrase.txt"))
  end

  def font_dirs
    [File.join(REPO_ROOT, "packs/fonts")]
  end

  def locale_dirs
    [File.join(REPO_ROOT, "packs/locale")]
  end

  # A client over the fixture template root, with the packs wired up and the
  # environment deliberately OFF — a spec that accidentally inherited a
  # `SHOJIKU_*` variable from the runner would be testing the runner.
  def client(templates: FIXTURE_TEMPLATES, **)
    Shojiku::Client.new(
      templates: templates, font_dirs: font_dirs, locale_dirs: locale_dirs,
      library: engine_library, env: false, **
    )
  end

  # The library path, read once from the environment the image sets. Passed
  # explicitly because the clients above run with `env: false`.
  def engine_library
    ENV.fetch("SHOJIKU_LIBRARY", nil)
  end

  def rendered
    @rendered ||= begin
      result = client.generate("receipt", customer: { name: "Yamada Shoji K.K." })
      raise "the fixture template did not render: #{result.failure}" if result.failure?

      result.artifact
    end
  end

  def signer(key: "rsa2048.key.pem", cert: "rsa2048.cert.pem", passphrase: nil)
    Shojiku::LocalPem.new(key: key_path(key), cert: key_path(cert), passphrase: passphrase)
  end

  def signed
    @signed ||= begin
      result = rendered.sign(signer)
      raise "the fixture document did not sign: #{result.failure}" if result.failure?

      result.artifact
    end
  end

  # A throwaway directory for one example, removed when the block ends.
  def in_temp_dir(&)
    Dir.mktmpdir("shojiku-ruby", &)
  end

  # Where the bytes-first entrance's bundled assets live. A directory rather
  # than a template root: `generate_source` resolves `assets/logo.svg` against
  # it and resolves NOTHING else, since there is no name to look up.
  SOURCE_ASSETS = File.expand_path("../fixtures/sources", __dir__)

  # A template as SOURCE TEXT, for the entrance that never reads a file.
  # `items` is spliced in already indented to the flow's item list.
  def source_template(items)
    <<~YAML
      version: 0.1.0
      name: inline
      page: { size: A4, margin: 25 }
      defaults:
        locale: en-US
        style: { fontFamily: noto-sans, fontSize: 10.5 }
      sections:
        body:
          type: flow
          items:
      #{items.chomp.gsub(/^/, "      ")}
    YAML
  end

  # One text item binding `key`, sized from the fixture templates that render
  # warning-free at this font size.
  def text_item(key)
    <<~YAML
      - id: line
        type: text
        box: { x: 0, y: 0, w: 400, h: 16 }
        text: "Billed to {#{key}}"
    YAML
  end
end

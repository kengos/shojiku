# frozen_string_literal: true

require "json"

module Shojiku
  # The entry point: a configured engine, and the sources to render with it.
  #
  # ```ruby
  # client = Shojiku::Client.new(templates: "app/templates")
  # result = client.generate("receipt_ja", customer: { name: "…" })
  # result.artifact.write("receipt.pdf") if result.success?
  # ```
  #
  # **Two entrances, deliberately.** {#generate} takes a template NAME and
  # resolves it against the configured root, which is where the containment
  # rules live. {#generate_source} takes the sources as BYTES the application
  # already has — fetched from object storage, read out of a database, written
  # inline — because fetching is the application's act and this gem downloads
  # nothing. Root containment does not apply to bytes a caller supplied: there
  # is no root to be contained by, which is exactly why a strict client
  # refuses that entrance (see {Lockdown}).
  #
  # **Precedence, and its one deliberate asymmetry.** An explicit `templates:`
  # beats {Shojiku.configure}, which beats `SHOJIKU_TEMPLATE_ROOT`; the pack
  # directories resolve the same way. What an application renders is the
  # application's own decision. An explicit `library:` is the other way round —
  # `SHOJIKU_LIBRARY` beats it — because where the ENGINE lives is an
  # operator's decision that has to be able to win over application code, the
  # same order the subprocess SDKs give `SHOJIKU_BIN`. Passing `env: false`
  # disables every one of those lookups at once. `strict:` is the one setting
  # {Shojiku.configure} wins outright, for the reason in {Lockdown}.
  class Client
    ANCHOR_FORMS = "`anchors:` (paths) or `anchors_pem:` (bytes)"

    def initialize(templates: nil, font_dirs: nil, locale_dirs: nil, lang: nil, library: nil,
                   logger: nil, strict: nil, providers: nil, env: nil)
      @settings = Settings.new(
        templates:, font_dirs:, locale_dirs:, lang:, library:, logger:, strict:, providers:, env:
      )
      @engine = Engine.new(@settings.library)
    end

    def template_root
      @settings.template_root
    end

    # A copy of this client that renders in `lang`, for the call — or the
    # request — that needs a locale other than this client's own. A
    # multi-locale application renders one template in each buyer's locale
    # without building (or configuring) a second client.
    #
    # **A derived client rather than a `lang:` keyword on {#generate}, and
    # that is a Ruby spelling of a contract every SDK shares.** `generate`
    # takes its params as a trailing Hash, so a keyword argument beside it
    # would turn the natural `generate("receipt", customer: …)` into an
    # `unknown keyword: :customer` error — Ruby resolves that ambiguity
    # against the common case. The other six, whose params are an ordinary
    # argument, express the same override as a per-call option; what they
    # mirror is that a per-call locale beats the client-wide one, not the
    # spelling.
    #
    # The opened library, the template root and the lockdown are shared:
    # deriving a client re-opens nothing.
    def with_lang(lang)
      copy = dup
      copy.settings = @settings.with_lang(lang)
      copy
    end

    # What this build of the engine can do — its version, capability keys and
    # builtin locales. Gate a feature on this rather than on a gem version.
    #
    # A plain Hash, deliberately. The payload is an append-only wire this SDK
    # does not model, exactly as a diagnostic's typed `args` pass through
    # untranslated: a typed value object would have to grow a field in seven
    # languages every time the engine adds one, and an application reading a
    # key its engine is too old to send already has to handle nil.
    def engine_info
      snapshot = @engine.engine_info
      Outcome.guard!(snapshot)
      JSON.parse(snapshot.json)
    end

    # Renders `name` with `params`, returning a {Result}.
    #
    # `params` may be a Hash (serialized here) or a String you already have —
    # JSON or YAML, since the engine parses either and a String is passed
    # through verbatim. To render in another locale, see {#with_lang}.
    #
    # A rejected template name is a FAILED RESULT, not an exception: a hostile
    # name is a fact about the request, not a bug in the program. A name that
    # is not a String at all IS a bug in the program, and raises.
    def generate(name, params = {})
      sources = template_root!.resolve(name)
      render(sources, params, origin: :rendered, template: Echo.bounded(name))
    rescue TemplateRoot::Rejected => e
      Result.failed(rejection(e, :generate))
    end

    # Renders sources the APPLICATION supplies, returning a {Result}.
    #
    # For templates that do not live in a directory this gem can see: fetched
    # from object storage, stored in a database, or written inline. Fetching
    # them stays the application's act — nothing here opens a socket.
    #
    # `assets_dir:` is per call rather than per client, because bundled assets
    # belong to a template rather than to a deployment. Without it, bundled
    # image sources are disabled: inline sources have no directory of their
    # own. The locale is overridden the same way as for {#generate}, with
    # {#with_lang} — one spelling, not two.
    def generate_source(template:, definitions: nil, assets_dir: nil, params: {})
      @settings.lockdown.source_entrance!
      sources = Sources.new(template: template, definitions: definitions,
                            assets_dir: assets_dir)
      render(sources, params, origin: :source)
    end

    # Re-enters an archived document, so bytes signed some time ago can be
    # verified — or re-signed — without hand-building an artifact.
    #
    # The result is marked as LOADED: its bytes are the caller's rather than
    # this client's own render, which is a distinction a strict client acts
    # on. `page_count` is nil, honestly: nothing here laid anything out.
    def artifact(bytes)
      DocumentArtifact.new(bytes: bytes, diagnostics: [], client: self, origin: :loaded)
    end

    # Signs an artifact with `provider`, returning a {Result}. The signed
    # bytes begin with the input byte for byte — signing appends a revision.
    #
    # `provider` is a {LocalPem} (or another provider object), or the NAME of
    # one registered in configuration. A strict client takes the name only.
    def sign(artifact, provider)
      signer = @settings.lockdown.provider!(provider)
      @settings.lockdown.signable!(artifact)
      @settings.log.timed(:sign) { signed(artifact, signer) }
    end

    # Verifies an artifact against trust anchors, returning a {Result} whose
    # value is a {VerificationReport}.
    #
    # Anchors are required and are given as paths (`anchors:`, one or several)
    # or as PEM bytes (`anchors_pem:`, which may carry several concatenated).
    # Which form you passed is explicit rather than sniffed, and passing both
    # raises rather than silently preferring one. There is no fallback to the
    # machine's trust store, because the engine never consults one — a default
    # would answer a different question than you asked.
    #
    # A signature that does not verify is a FAILED result that still carries
    # the report, so `not_checked` reaches you either way.
    def verify(artifact, anchors: nil, anchors_pem: nil)
      pem = anchor_material(anchors, anchors_pem)
      @settings.log.timed(:verify) do
        Outcome.verdict(@engine.verify(pdf: artifact.bytes, anchors: pem))
      end
    rescue MaterialUnreadable => e
      Result.failed(Failure.new(step: :verify, kind: e.kind, message: e.message))
    end

    protected

    # Written only by {#with_lang}, on a copy that is not yet visible to
    # anyone — a derived client is built, not mutated.
    attr_writer :settings

    private

    def render(sources, params, origin:, **fields)
      request = Request.new(sources: sources, params: params, lang: @settings.lang,
                            font_dirs: @settings.font_dirs, locale_dirs: @settings.locale_dirs)
      @settings.log.timed(:generate, **fields) do
        snapshot = @engine.render(request.json)
        Outcome.document(snapshot, step: :generate, client: self, origin: origin)
      end
    end

    # The signed document inherits the origin of what it signed: appending a
    # revision does not launder where the document came from.
    def signed(artifact, provider)
      snapshot = @engine.sign(
        pdf: artifact.bytes, key: provider.key, certificate: provider.certificate,
        passphrase: provider.passphrase
      )
      Outcome.document(snapshot, step: :sign, client: self, origin: artifact.origin)
    rescue MaterialUnreadable => e
      Result.failed(Failure.new(step: :sign, kind: e.kind, message: e.message))
    end

    def template_root!
      return template_root if template_root

      raise UsageError,
            "no template root: pass Shojiku::Client.new(templates: …), set it with " \
            "Shojiku.configure, or set SHOJIKU_TEMPLATE_ROOT (which `env: false` " \
            "disables). Sources you already hold go to `generate_source`."
    end

    def anchor_material(paths, pem)
      raise UsageError, "verify takes either #{ANCHOR_FORMS}, not both" if paths && pem
      return pem if pem
      raise UsageError, "verify needs #{ANCHOR_FORMS}" if paths.nil?

      Array(paths).map { |path| Material.read(path, "anchor_unreadable") }.join("\n")
    end

    def rejection(error, step)
      cause = if error.cause_message
                Failure.new(step: step, kind: "io", message: error.cause_message)
              end
      Failure.new(step: step, kind: error.kind, message: error.message, cause: cause)
    end
  end
end

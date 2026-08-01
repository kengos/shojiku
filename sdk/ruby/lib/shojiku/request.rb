# frozen_string_literal: true

module Shojiku
  # The one JSON envelope every document operation crosses with.
  #
  # Both entrances build it: sources resolved from a template NAME and
  # sources the application handed over as BYTES produce the same request,
  # because the C surface has one request schema — and that schema rejects
  # unknown keys, so a key the engine may legitimately not receive is dropped
  # rather than sent as null.
  class Request
    def initialize(sources:, params:, lang: nil, font_dirs: [], locale_dirs: [])
      @sources = sources
      @params = params
      @lang = lang
      @font_dirs = font_dirs
      @locale_dirs = locale_dirs
    end

    # The serialized envelope, turning the one failure JSON generation has
    # into this gem's own exception.
    #
    # Params that are not valid UTF-8 are programmer misuse — the engine's
    # surface is UTF-8 by contract, so there is nothing to render — but a bare
    # `JSON::GeneratorError` escaping from `generate` would make callers
    # rescue a foreign class they never invited into their code.
    def json
      JSON.generate(envelope)
    rescue JSON::GeneratorError, Encoding::UndefinedConversionError => e
      raise UsageError, "params could not be serialized as UTF-8 JSON: #{e.message}"
    end

    private

    def envelope
      {
        template: @sources.template,
        definitions: @sources.definitions,
        params: params_source,
        lang: @lang,
        fontDirs: @font_dirs,
        localeDirs: @locale_dirs,
        assetsDir: @sources.assets_dir
      }.compact
    end

    # A String params is the caller's own source text, passed through
    # VERBATIM: the engine parses JSON or YAML (YAML is a superset), so
    # re-encoding it here would only be a chance to change it. Anything else
    # is serialized as JSON.
    #
    # There is deliberately no per-format method family — format dispatch is
    # the engine's, and an SDK that offered `generate_yaml` would be claiming
    # a distinction the engine does not make.
    def params_source
      @params.is_a?(String) ? @params : JSON.generate(@params)
    end
  end
end

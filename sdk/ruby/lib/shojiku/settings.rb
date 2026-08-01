# frozen_string_literal: true

module Shojiku
  # One client's resolved configuration, plus the collaborators built from it.
  #
  # {Config} answers "what was configured"; this answers "what does THIS
  # client use", which is the merge of the process-wide defaults with the
  # arguments the client was constructed with. Keeping it out of {Client}
  # keeps the precedence rules in one readable place instead of spread across
  # a constructor.
  #
  # Everything is built lazily and memoized: a bytes-first application never
  # configures a template root, and demanding one at construction would refuse
  # a legitimate client.
  class Settings
    attr_reader :lang

    def initialize(**overrides)
      @config = Shojiku.config.merge(overrides)
      @lang = @config.lang
    end

    # A copy that renders in `lang`, for {Client#with_lang}. Everything
    # already built — the opened library, the template root, the lockdown —
    # is carried over by `dup`, so deriving a client re-opens nothing.
    def with_lang(lang)
      copy = dup
      copy.override_lang(lang)
      copy
    end

    def env
      @env ||= Env.new(enabled: @config.env)
    end

    def log
      @log ||= Log.new(@config.logger)
    end

    def lockdown
      @lockdown ||= Lockdown.new(strict: @config.strict, providers: @config.providers)
    end

    def library
      @library ||= Library.new(path: @config.library, env: env, log: log)
    end

    def font_dirs
      @font_dirs ||= @config.font_dirs || env.paths("SHOJIKU_FONT_DIR")
    end

    def locale_dirs
      @locale_dirs ||= @config.locale_dirs || env.paths("SHOJIKU_LOCALE_DIR")
    end

    # The template root, or nil when nothing configured one.
    #
    # `defined?` rather than `||=` because nil is a legitimate answer here and
    # would otherwise be re-resolved on every call.
    def template_root
      return @template_root if defined?(@template_root)

      root = @config.templates || env["SHOJIKU_TEMPLATE_ROOT"]
      @template_root = root ? TemplateRoot.new(root) : nil
    end

    protected

    # Only {#with_lang} calls this, on a copy nobody else can see yet.
    def override_lang(lang)
      @lang = lang
    end
  end
end

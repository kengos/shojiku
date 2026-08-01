# frozen_string_literal: true

module Shojiku
  # The input ceiling an operator can declare, and the named signing
  # providers that go with it.
  #
  # Once signing is in the loop, template input is a security boundary:
  # whoever controls the bytes controls what gets signed. A strict client
  # therefore narrows where signable input may come from.
  #
  # * The bytes-first entrance ({Client#generate_source}) is refused, so
  #   every document this client signs came from the configured template
  #   root, with its containment rules.
  # * An artifact this client did not render ({Client#artifact}) may not be
  #   signed — those bytes are the caller's, exactly like a bytes-first
  #   template.
  # * Signing material must be a provider REGISTERED in configuration and
  #   named at the call site, so a key path never appears in
  #   request-handling code and the material is loaded by one object rather
  #   than rebuilt per request.
  #
  # **Verification is never restricted.** Verifying bytes of unknown
  # provenance is the entire point of verify, and a locked-down deployment is
  # precisely the one that needs to check an archived document it did not
  # produce.
  #
  # Refusals raise {UsageError} rather than returning a failed {Result}:
  # strict disables an ENTRANCE, so calling it is the program contradicting
  # its own deployment's configuration — not a fact about a document — and a
  # failed result is something `if result.success?` can swallow.
  #
  # The six other SDKs mirror this with identical semantics. It is contract,
  # not ecosystem idiom.
  class Lockdown
    def initialize(strict:, providers: nil)
      @strict = strict
      # Registered under symbols whatever the caller wrote them as. A
      # configuration hash keyed by strings is the ordinary Ruby spelling,
      # and looking it up only by symbol would answer "no signing provider
      # named `invoice` is registered" for a provider named exactly that.
      @providers = (providers || {}).transform_keys(&:to_sym)
    end

    def strict?
      @strict
    end

    # The bytes-first entrance.
    def source_entrance!
      return unless @strict

      raise UsageError,
            "this client is strict: templates must come from the template root, so " \
            "`generate_source` is disabled. Use `generate(name, params)`."
    end

    # An artifact about to be signed. Only a document laid out from a template
    # the ROOT resolved qualifies — bytes handed over whole, and bytes laid
    # out from a caller's own template, are the same trust class here. That
    # closes the gap a boolean "was it loaded" would leave open: an artifact
    # from another client's bytes-first render is not this deployment's
    # document either.
    def signable!(artifact)
      return unless @strict && artifact.origin != :rendered

      raise UsageError,
            "this client is strict: only a document rendered from its own template " \
            "root may be signed (this one is #{artifact.origin}). It can still be " \
            "verified."
    end

    # The provider to sign with.
    #
    # A Symbol or String is a registered name, in strict mode and out of it —
    # naming providers is good practice everywhere, and only the REFUSAL of
    # the alternative is strict's. A provider object is accepted only when
    # this client is not strict.
    def provider!(provider)
      return registered!(provider) if provider.is_a?(Symbol) || provider.is_a?(String)
      return provider unless @strict

      raise UsageError,
            "this client is strict: sign with the name of a provider registered in " \
            "configuration, not with a provider object."
    end

    private

    def registered!(name)
      @providers.fetch(name.to_sym) do
        raise UsageError, "no signing provider named `#{Echo.bounded(name)}` is registered"
      end
    end
  end
end

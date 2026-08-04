# frozen_string_literal: true

module Shojiku
  # A signing provider for a key this process is never given.
  #
  # The second provider, and the shape {LocalPem}'s own comment promised: a
  # new class rather than new arguments on `sign`, so the call site is
  # unchanged in all seven SDKs.
  #
  # The engine hands out the bytes a signature has to cover; the block signs
  # them wherever the key actually lives — AWS KMS, Google Cloud KMS, an HSM,
  # a smartcard, another service entirely — and hands the signature back:
  #
  #   provider = Shojiku::ExternalSigner.new(cert: "signer.crt",
  #                                          algorithm: :ecdsa_p256_sha256) do |to_be_signed|
  #     kms.sign(key_id: ENV.fetch("KEY_ID"), message: to_be_signed,
  #              message_type: "RAW", signing_algorithm: "ECDSA_SHA_256").signature
  #   end
  #   client.sign(artifact, provider)
  #
  # Shojiku ships no cloud client of its own, deliberately: the block is
  # whatever client your application already has, and the SDK stays a wrapper
  # with nothing to keep in step with a vendor's releases.
  #
  # **What the block receives is the signed ATTRIBUTES, not the document
  # digest.** A service that signs a digest must hash these bytes with SHA-256
  # itself. Signing the document digest instead produces a document that fails
  # verification, so the distinction is not cosmetic.
  #
  # The signature is the raw output of that operation: PKCS#1 v1.5 bytes for
  # `:rsa_pkcs1_sha256`, an ASN.1 DER sequence for `:ecdsa_p256_sha256` —
  # which is what both major cloud key services return unchanged.
  #
  # The certificate comes either from a path (`cert:`) or from bytes already
  # in memory (`cert_pem:`), explicit rather than sniffed, exactly as
  # {LocalPem} takes its material.
  class ExternalSigner
    FORMS = "`cert:` (a path) or `cert_pem:` (bytes)"

    # The wire spellings the engine accepts, keyed by the Ruby-side names.
    # A Symbol reads better at a call site; a String is accepted because
    # configuration files produce them.
    ALGORITHMS = {
      rsa_pkcs1_sha256: "rsa-pkcs1-sha256",
      ecdsa_p256_sha256: "ecdsa-p256-sha256"
    }.freeze

    attr_reader :algorithm

    def initialize(cert: nil, cert_pem: nil, algorithm: nil, &block)
      @cert_path = cert
      @cert_pem = cert_pem
      @algorithm = wire_algorithm(algorithm)
      @block = block
      one_source!(cert, cert_pem)
      raise UsageError, "ExternalSigner needs a block that signs the bytes it is given" unless block
    end

    # Redacted for the same reason {LocalPem} is. Nothing here is key
    # material — that is the point of this provider — but a block closes over
    # whatever built it, which in practice is a client holding credentials.
    def inspect
      "#<#{self.class.name} cert=#{form} algorithm=#{@algorithm}>"
    end

    def certificate
      @certificate ||= @cert_pem || Material.read(@cert_path, "certificate_unreadable")
    end

    # Signs `pdf` in two calls, with the block in between.
    #
    # Both engine calls take the same document, certificate and algorithm:
    # the pair is stateless, so the second re-derives what the first prepared.
    # Keeping them inside ONE method is what makes that impossible to get
    # wrong from Ruby — there is no way to pair a prepare of one document
    # with a complete of another.
    #
    # A prepare that did not succeed is returned as it is: an unreadable
    # certificate or a document the signer refuses is a fact about the
    # inputs, and paying for a signature afterwards would tell the caller
    # nothing new.
    def sign_with(engine, pdf)
      prepared = engine.sign_prepare(pdf: pdf, certificate: certificate, algorithm: @algorithm)
      return prepared unless prepared.status.zero? && prepared.success

      engine.sign_complete(
        pdf: pdf, certificate: certificate, algorithm: @algorithm,
        signature: signature_for(prepared)
      )
    end

    private

    # Runs the block over the bytes the engine wants signed.
    #
    # The block's own exceptions are deliberately not rescued: it is the
    # caller's code talking to the caller's key service, and turning its
    # failures into a failed {Result} would file a caller's outage under
    # "something was wrong with this document".
    # `unpack1("m")` rather than `Base64.decode64`: base64 is a bundled gem
    # now, and this SDK's runtime dependency list is exactly one entry
    # (fiddle) on purpose. The unpack directive is core String, so decoding
    # the payload costs nothing an application has to install.
    def signature_for(prepared)
      to_be_signed = JSON.parse(prepared.json).fetch("toBeSigned").unpack1("m")
      signature = @block.call(to_be_signed)
      unless signature.is_a?(String) && !signature.empty?
        raise UsageError,
              "the signer block must return the signature as a non-empty String of bytes"
      end

      signature.b
    end

    def wire_algorithm(algorithm)
      raise UsageError, "ExternalSigner needs `algorithm:` (#{named})" if algorithm.nil?

      ALGORITHMS.fetch(algorithm.to_sym) do
        raise UsageError, "`algorithm:` must be one of #{named}"
      end
    end

    def named
      ALGORITHMS.keys.map(&:inspect).join(" or ")
    end

    # The path, or a note that the bytes came from memory — a configured path
    # is not secret, and it is the one thing worth seeing when a provider
    # loaded the wrong certificate.
    def form
      @cert_path ? @cert_path.to_s : "[pem bytes]"
    end

    # Explicit, never sniffed, in BOTH directions — {LocalPem}'s rule, for
    # the same reason: guessing whether a string is a path or a PEM body is
    # how the wrong file gets read.
    def one_source!(path, pem)
      raise UsageError, "ExternalSigner takes either #{FORMS}, not both" if path && pem
      return if path || pem

      raise UsageError, "ExternalSigner needs either #{FORMS}"
    end
  end
end

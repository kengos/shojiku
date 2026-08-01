# frozen_string_literal: true

module Shojiku
  # A signing provider backed by a PEM key and certificate.
  #
  # The only provider this release has. KMS and HSM providers are a recorded
  # deferral, which is why this is a named class rather than a pair of
  # arguments on `sign` — a second provider then adds a class, not a signature
  # change in seven languages.
  #
  # The material comes either from paths (`key:` / `cert:`) or from bytes
  # already in memory (`key_pem:` / `cert_pem:`), so a key fetched from a
  # secret manager never has to be written to disk first. Which one you passed
  # is explicit rather than sniffed: guessing whether a string is a path or a
  # PEM body is exactly the kind of cleverness that reads the wrong file.
  #
  # Nothing here logs key material, and the engine builds its refusals from
  # fixed strings, so a rejection cannot echo it back either.
  class LocalPem
    FORMS = "`%<what>s:` (a path) or `%<what>s_pem:` (bytes)"

    attr_reader :passphrase

    def initialize(key: nil, cert: nil, key_pem: nil, cert_pem: nil, passphrase: nil)
      @key_path = key
      @cert_path = cert
      @key_pem = key_pem
      @cert_pem = cert_pem
      @passphrase = passphrase
      one_source!(key, key_pem, "key")
      one_source!(cert, cert_pem, "cert")
    end

    # Redacted, deliberately.
    #
    # The default `#inspect` prints every instance variable, which here is the
    # private key and the passphrase — into a console, a `binding.irb`, an
    # exception reporter's local-variable dump, or any log line that
    # interpolates the provider. None of that is worth showing, so nothing is
    # shown but the class and which FORM each half came from. Registering the
    # provider once (see {Lockdown}) shrinks this surface further: material
    # loads into one object instead of being rebuilt per request.
    def inspect
      "#<#{self.class.name} key=#{form(@key_path)} cert=#{form(@cert_path)} " \
        "passphrase=#{@passphrase ? "[redacted]" : "none"}>"
    end

    def key
      @key ||= @key_pem || Material.read(@key_path, "key_unreadable")
    end

    def certificate
      @certificate ||= @cert_pem || Material.read(@cert_path, "certificate_unreadable")
    end

    private

    # The path, or a note that the bytes came from memory. A configured file
    # path is not secret and is the one thing worth seeing when a provider
    # loaded the wrong material; the bytes themselves are never printed.
    def form(path)
      path ? path.to_s : "[pem bytes]"
    end

    # Explicit, never sniffed — in BOTH directions. Guessing whether a string
    # is a path or a PEM body is how the wrong file gets read; accepting both
    # forms and silently preferring one ignores the argument the caller meant,
    # which is the same mistake one layer quieter.
    def one_source!(path, pem, what)
      forms = format(FORMS, what: what)
      raise UsageError, "LocalPem takes either #{forms}, not both" if path && pem
      return if path || pem

      raise UsageError, "LocalPem needs either #{forms}"
    end
  end
end

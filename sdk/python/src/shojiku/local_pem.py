"""A signing provider backed by a PEM key and certificate.

The only provider this release has. KMS and HSM providers are a recorded
deferral, which is why this is a named class rather than a pair of arguments on
``sign`` — a second provider then adds a class, not a signature change in seven
languages.

The material comes either from paths (``key`` / ``cert``) or from bytes already
in memory (``key_pem`` / ``cert_pem``), so a key fetched from a secret manager
never has to be written to disk first. Which one you passed is explicit rather
than sniffed: guessing whether a string is a path or a PEM body is exactly the
kind of cleverness that reads the wrong file.

Nothing here logs key material, and the engine builds its refusals from fixed
strings, so a rejection cannot echo it back either.
"""

from __future__ import annotations

from shojiku.errors import UsageError, read_material


class LocalPem:
    """PEM key + certificate, from paths or from bytes, never sniffed."""

    def __init__(
        self,
        key: str | None = None,
        cert: str | None = None,
        key_pem: bytes | None = None,
        cert_pem: bytes | None = None,
        passphrase: bytes | str | None = None,
    ) -> None:
        self._key_path = key
        self._cert_path = cert
        self._key_pem = key_pem
        self._cert_pem = cert_pem
        self.passphrase = passphrase
        self._one_source(key, key_pem, "key")
        self._one_source(cert, cert_pem, "cert")

    def __repr__(self) -> str:
        """Redacted, deliberately.

        The default repr prints every attribute, which here is the private key
        and the passphrase — into a console, a REPL, an exception reporter's
        local-variable dump, or any log line that interpolates the provider. None
        of that is worth showing, so nothing is shown but the class and which
        FORM each half came from. Registering the provider once shrinks this
        surface further: material loads into one object instead of being rebuilt
        per request.
        """
        passphrase = "[redacted]" if self.passphrase is not None else "none"
        return (
            f"<{type(self).__name__} key={self._form(self._key_path)} "
            f"cert={self._form(self._cert_path)} passphrase={passphrase}>"
        )

    @property
    def key(self) -> bytes:
        if self._key_pem is None:
            # A path is the only remaining form: the constructor refused neither.
            self._key_pem = read_material(str(self._key_path), "key_unreadable")
        return self._key_pem

    @property
    def certificate(self) -> bytes:
        if self._cert_pem is None:
            self._cert_pem = read_material(str(self._cert_path), "certificate_unreadable")
        return self._cert_pem

    @staticmethod
    def _form(path: str | None) -> str:
        """The path, or a note that the bytes came from memory.

        A configured file path is not secret and is the one thing worth seeing
        when a provider loaded the wrong material; the bytes themselves are never
        printed.
        """
        return path if path else "[pem bytes]"

    @staticmethod
    def _one_source(path: str | None, pem: bytes | None, what: str) -> None:
        """Explicit, never sniffed — in BOTH directions.

        Guessing whether a string is a path or a PEM body is how the wrong file
        gets read; accepting both forms and silently preferring one ignores the
        argument the caller meant, which is the same mistake one layer quieter.
        """
        forms = f"`{what}` (a path) or `{what}_pem` (bytes)"
        if path is not None and pem is not None:
            raise UsageError(f"LocalPem takes either {forms}, not both")
        if path is None and pem is None:
            raise UsageError(f"LocalPem needs either {forms}")

<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * A signing provider backed by a PEM key and certificate.
 *
 * The only provider this release has. KMS and HSM providers are a recorded
 * deferral, which is why this is a named class rather than a pair of
 * arguments on `sign` — a second provider then adds a class, not a signature
 * change in seven languages.
 *
 * The material comes either from paths (`key:` / `cert:`) or from bytes
 * already in memory (`keyPem:` / `certPem:`), so a key fetched from a secret
 * manager never has to be written to disk first. Which one you passed is
 * explicit rather than sniffed: guessing whether a string is a path or a PEM
 * body is exactly the kind of cleverness that reads the wrong file.
 *
 * **Redaction takes more than one hook in PHP.** The default printed form of
 * an object dumps its properties, and there are four functions that do it
 * (`var_dump`, `print_r`, `var_export`, string interpolation) of which
 * `__debugInfo()` covers exactly one. So the secret halves are not held in
 * properties at all: they live in a private static `\WeakMap` keyed by the
 * provider, which is invisible to every dumper and released with the object.
 * `#[\SensitiveParameter]` covers the fifth surface — a stack trace, which
 * prints the arguments a constructor was called with.
 */
final class LocalPem
{
    /**
     * The material, keyed by the provider that owns it. Deliberately not a
     * property: see the class note above.
     *
     * @var \WeakMap<self, array{key: ?string, cert: ?string, passphrase: ?string}>|null
     */
    private static ?\WeakMap $material = null;

    private readonly ?string $keyPath;
    private readonly ?string $certPath;

    public function __construct(
        ?string $key = null,
        ?string $cert = null,
        #[\SensitiveParameter]
        ?string $keyPem = null,
        #[\SensitiveParameter]
        ?string $certPem = null,
        #[\SensitiveParameter]
        ?string $passphrase = null,
    ) {
        self::oneSource($key, $keyPem, 'key');
        self::oneSource($cert, $certPem, 'cert');
        $this->keyPath = $key;
        $this->certPath = $cert;
        self::store()[$this] = ['key' => $keyPem, 'cert' => $certPem, 'passphrase' => $passphrase];
    }

    /**
     * The path the key was configured at, or null when it was handed over as
     * bytes.
     *
     * **A path is passed to the engine as a path.** The SDKs that link a
     * library have to read the file themselves and hand over bytes; this one
     * does not, and copying a private key into a temporary file so it could
     * would be a worse trade than any parity it buys. What follows from that
     * is worth stating: an unreadable key path is reported by the ENGINE, so
     * it arrives as a failed result of kind `io` rather than under a
     * host-side kind of this package's own. It is a failed result either way,
     * which is what the contract fixes.
     */
    public function keyPath(): ?string
    {
        return $this->keyPath;
    }

    public function certPath(): ?string
    {
        return $this->certPath;
    }

    /**
     * The key bytes, when the caller handed bytes over. Null for the path
     * form — see {@see self::keyPath()}.
     */
    public function keyPem(): ?string
    {
        return self::store()[$this]['key'];
    }

    public function certPem(): ?string
    {
        return self::store()[$this]['cert'];
    }

    public function passphrase(): ?string
    {
        return self::store()[$this]['passphrase'];
    }

    /**
     * The redacted printed form — the class, and which FORM each half came
     * from. A configured file path is not secret and is the one thing worth
     * seeing when a provider loaded the wrong material; the bytes themselves
     * are never printed.
     *
     * @return array<string, string>
     */
    public function __debugInfo(): array
    {
        return [
            'key' => self::form($this->keyPath),
            'cert' => self::form($this->certPath),
            'passphrase' => self::store()[$this]['passphrase'] === null ? 'none' : '[redacted]',
        ];
    }

    public function __toString(): string
    {
        $shown = $this->__debugInfo();

        return sprintf(
            '%s key=%s cert=%s passphrase=%s',
            self::class,
            $shown['key'],
            $shown['cert'],
            $shown['passphrase'],
        );
    }

    /**
     * @return \WeakMap<self, array{key: ?string, cert: ?string, passphrase: ?string}>
     */
    private static function store(): \WeakMap
    {
        /** @var \WeakMap<self, array{key: ?string, cert: ?string, passphrase: ?string}> */
        return self::$material ??= new \WeakMap();
    }

    private static function form(?string $path): string
    {
        return $path ?? '[pem bytes]';
    }

    /**
     * Explicit, never sniffed — in BOTH directions. Guessing whether a string
     * is a path or a PEM body is how the wrong file gets read; accepting both
     * forms and silently preferring one ignores the argument the caller
     * meant, which is the same mistake one layer quieter.
     */
    private static function oneSource(?string $path, ?string $pem, string $what): void
    {
        $forms = sprintf('`%s:` (a path) or `%sPem:` (bytes)', $what, $what);
        if ($path !== null && $pem !== null) {
            throw new UsageException(sprintf('LocalPem takes either %s, not both', $forms));
        }
        if ($path === null && $pem === null) {
            throw new UsageException(sprintf('LocalPem needs either %s', $forms));
        }
    }
}

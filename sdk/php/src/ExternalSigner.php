<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\EngineFailureException;
use Shojiku\Exception\UsageException;

/**
 * A signing provider for a key this process is never given.
 *
 * The second provider, and the shape {@see LocalPem}'s own comment promised: a
 * new class rather than new arguments on `sign`, so the call site is unchanged
 * in all seven SDKs.
 *
 * The engine hands out the bytes a signature has to cover; the callable signs
 * them wherever the key actually lives — AWS KMS, Google Cloud KMS, an HSM, a
 * smartcard, another service entirely — and hands the signature back:
 *
 * ```php
 * $provider = new Shojiku\ExternalSigner(
 *     sign: fn (string $toBeSigned): string => $kms->sign([
 *         'KeyId' => getenv('KEY_ID'),
 *         'Message' => $toBeSigned,
 *         'MessageType' => 'RAW',
 *         'SigningAlgorithm' => 'ECDSA_SHA_256',
 *     ])['Signature'],
 *     cert: 'signer.crt',
 *     algorithm: Shojiku\Algorithm::EcdsaP256Sha256,
 * );
 * $client->sign($artifact, $provider);
 * ```
 *
 * Shojiku ships no cloud client of its own, deliberately: the callable is
 * whatever client your application already has, and the SDK stays a wrapper
 * with nothing to keep in step with a vendor's releases.
 *
 * **What the callable receives is the signed ATTRIBUTES, not the document
 * digest.** A service that signs a digest must hash these bytes with SHA-256
 * itself. Signing the document digest instead produces a document that fails
 * verification, so the distinction is not cosmetic.
 *
 * The signature is the raw output of that operation: PKCS#1 v1.5 bytes for
 * `rsa-pkcs1-sha256`, an ASN.1 DER sequence for `ecdsa-p256-sha256` — which is
 * what both major cloud key services return unchanged.
 *
 * **Redaction.** Nothing here is key material — that is the point of this
 * provider — but a callable closes over whatever built it, which in practice
 * is a client holding credentials. So the callable lives in the same private
 * `\WeakMap` {@see LocalPem} keeps its secrets in, which is invisible to all
 * four of PHP's dumpers, and the constructor's callable is marked
 * `#[\SensitiveParameter]` so a stack trace cannot print it either.
 */
final class ExternalSigner implements SigningProvider
{
    /**
     * The callables, keyed by the provider that owns them. Deliberately not a
     * property: see the class note above.
     *
     * @var \WeakMap<self, callable(string): string>|null
     */
    private static ?\WeakMap $signers = null;

    private readonly ?string $certPath;
    private readonly ?string $certPem;
    public readonly Algorithm $algorithm;

    /**
     * @param callable(string): string $sign receives the bytes to sign,
     *                                       returns the raw signature
     */
    public function __construct(
        #[\SensitiveParameter]
        callable $sign,
        ?string $cert = null,
        ?string $certPem = null,
        Algorithm|string|null $algorithm = null,
    ) {
        self::oneSource($cert, $certPem);
        $this->certPath = $cert;
        $this->certPem = $certPem;
        $this->algorithm = self::wireAlgorithm($algorithm);
        self::store()[$this] = $sign;
    }

    /**
     * The redacted printed form — the class, which FORM the certificate came
     * from, and the algorithm. A configured file path is not secret and is
     * the one thing worth seeing when a provider loaded the wrong material.
     *
     * @return array<string, string>
     */
    public function __debugInfo(): array
    {
        return [
            'cert' => $this->certPath ?? '[pem bytes]',
            'algorithm' => $this->algorithm->value,
        ];
    }

    public function __toString(): string
    {
        $shown = $this->__debugInfo();

        return sprintf('%s cert=%s algorithm=%s', self::class, $shown['cert'], $shown['algorithm']);
    }

    /**
     * Signs in two engine calls, with the caller's callable in between.
     *
     * Both calls take the same document, certificate and algorithm: the pair
     * is stateless, so the second re-derives what the first prepared. Keeping
     * them inside ONE method is what makes that impossible to get wrong from
     * PHP — there is no way to pair a prepare of one document with a complete
     * of another.
     *
     * A prepare that did not succeed is returned as it is: an unreadable
     * certificate or a document the engine refuses is a fact about the
     * inputs, and paying for a signature afterwards would tell the caller
     * nothing new.
     *
     * @return array{Report, string}
     */
    public function signWith(Engine $engine, Workspace $workspace, DocumentArtifact $artifact): array
    {
        $engine->requireExternal();
        $input = $workspace->write('input.pdf', $artifact->bytes());
        $cert = $this->certPath ?? $workspace->write('cert.pem', (string) $this->certPem);
        $algorithm = $this->algorithm->value;

        [$prepared] = $engine->execute(Request::signPrepare($input, $cert, $algorithm), $workspace);
        if (!$prepared->ok) {
            return [$prepared, ''];
        }

        return $engine->execute(
            Request::signComplete(
                $input,
                $cert,
                $algorithm,
                $workspace->write('signature.bin', $this->signatureFor($prepared)),
            ),
            $workspace,
        );
    }

    /**
     * Runs the callable over the bytes the engine wants signed.
     *
     * The callable's own exceptions are deliberately not caught: it is the
     * caller's code talking to the caller's key service, and turning its
     * failures into a failed {@see Result} would file a caller's outage under
     * "something was wrong with this document".
     */
    private function signatureFor(Report $prepared): string
    {
        $payload = $prepared->prepared;
        if ($payload === null || !is_string($payload['toBeSigned'] ?? null)) {
            throw new EngineFailureException('the engine reported no bytes to sign');
        }
        $toBeSigned = base64_decode($payload['toBeSigned'], true);
        if ($toBeSigned === false) {
            throw new EngineFailureException("the engine's bytes-to-sign payload is not base64");
        }

        $signature = (self::store()[$this])($toBeSigned);
        if ($signature === '') {
            throw new UsageException('the signing callable must return a non-empty signature');
        }

        return $signature;
    }

    /**
     * @return \WeakMap<self, callable(string): string>
     */
    private static function store(): \WeakMap
    {
        /** @var \WeakMap<self, callable(string): string> */
        return self::$signers ??= new \WeakMap();
    }

    private static function wireAlgorithm(Algorithm|string|null $algorithm): Algorithm
    {
        if ($algorithm instanceof Algorithm) {
            return $algorithm;
        }
        $named = implode(' or ', array_map(
            static fn (Algorithm $case): string => sprintf('`%s`', $case->value),
            Algorithm::cases(),
        ));
        if ($algorithm === null) {
            throw new UsageException(sprintf('ExternalSigner needs `algorithm:` (%s)', $named));
        }

        // The caller's string is never echoed — it came from configuration
        // this package does not control, and the accepted names are the
        // useful half of the answer.
        return Algorithm::tryFrom($algorithm)
            ?? throw new UsageException(sprintf('`algorithm:` must be one of %s', $named));
    }

    /**
     * Explicit, never sniffed — in BOTH directions, {@see LocalPem}'s rule.
     */
    private static function oneSource(?string $path, ?string $pem): void
    {
        $forms = '`cert:` (a path) or `certPem:` (bytes)';
        if ($path !== null && $pem !== null) {
            throw new UsageException(sprintf('ExternalSigner takes either %s, not both', $forms));
        }
        if ($path === null && $pem === null) {
            throw new UsageException(sprintf('ExternalSigner needs either %s', $forms));
        }
    }
}

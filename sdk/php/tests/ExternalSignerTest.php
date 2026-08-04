<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Algorithm;
use Shojiku\Exception\EngineFailureException;
use Shojiku\Exception\IncompatibleEngineException;
use Shojiku\Exception\UsageException;
use Shojiku\ExternalSigner;
use Shojiku\Result;

/**
 * Signing with a key this process is never given.
 *
 * The engine hands out bytes, something else signs them, and the finished
 * document has to verify. Nothing is stubbed for the round trip: the callable
 * here runs `openssl` over the bytes it is handed, which is exactly the shape
 * a cloud key service takes from this package's point of view. The stub
 * appears only where "what if the thing on the other end is not what we think"
 * is the claim under test.
 */
final class ExternalSignerTest extends TestCase
{
    use EngineFixtures;
    use StubBinary;

    /**
     * The capability payload an engine WITH the two-step verbs answers with.
     */
    private const EXTERNAL_CAPABILITIES = '{"version":"9.9.9",'
        .'"capabilities":["cli.report","cli.sign.external"],"builtinLocales":["en-US"]}';

    public function testSigningWithAKeyHeldElsewhereProducesADocumentThatVerifies(): void
    {
        $document = $this->rendered();

        $result = $document->sign($this->external());

        self::assertTrue($result->success(), (string) $result->failure());
        $signed = $result->artifact();
        self::assertNotNull($signed);
        // Append-only: the signed bytes begin with the input byte for byte.
        self::assertTrue(str_starts_with($signed->bytes(), $document->bytes()));

        $verified = $signed->verify(anchors: $this->keyPath('rsa2048.cert.pem'));
        self::assertTrue($verified->success(), (string) $verified->failure());
    }

    public function testSigningWithAnEllipticCurveKey(): void
    {
        $result = $this->rendered()->sign($this->external('ec256', Algorithm::EcdsaP256Sha256));

        self::assertTrue($result->success(), (string) $result->failure());
    }

    public function testTheCallableIsHandedTheSignedAttributesNotTheDocumentDigest(): void
    {
        // The distinction the shorthand gets wrong: signing the digest instead
        // produces a document that fails verification.
        $seen = [];
        $inner = $this->opensslSigner('rsa2048');
        $provider = new ExternalSigner(
            sign: function (string $toBeSigned) use (&$seen, $inner): string {
                $seen[] = $toBeSigned;

                return $inner($toBeSigned);
            },
            cert: $this->keyPath('rsa2048.cert.pem'),
            algorithm: Algorithm::RsaPkcs1Sha256,
        );

        $this->rendered()->sign($provider);

        self::assertCount(1, $seen);
        // A DER SET OF attributes (RFC 5652's explicit form, tag 0x31), not
        // the 32-byte SHA-256 digest.
        self::assertSame(0x31, ord($seen[0][0]));
        self::assertNotSame(32, strlen($seen[0]));
    }

    public function testACertificateHeldInMemoryNeverHasToBeWrittenDown(): void
    {
        $pem = file_get_contents($this->keyPath('rsa2048.cert.pem'));
        self::assertIsString($pem);
        $provider = new ExternalSigner(
            sign: $this->opensslSigner('rsa2048'),
            certPem: $pem,
            algorithm: Algorithm::RsaPkcs1Sha256,
        );

        self::assertTrue($this->rendered()->sign($provider)->success());
        self::assertStringContainsString('[pem bytes]', (string) $provider);
    }

    public function testASignatureWithNothingInItIsRefused(): void
    {
        $provider = new ExternalSigner(
            sign: static fn (string $bytes): string => '',
            cert: $this->keyPath('rsa2048.cert.pem'),
            algorithm: Algorithm::RsaPkcs1Sha256,
        );

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/non-empty signature/');
        $this->rendered()->sign($provider);
    }

    public function testTheCallablesOwnFailureIsNotFiledAsADocumentFailure(): void
    {
        // A key service outage is the caller's, not a fact about this document.
        $provider = new ExternalSigner(
            sign: static function (string $bytes): string {
                throw new \RuntimeException('the key service is unreachable');
            },
            cert: $this->keyPath('rsa2048.cert.pem'),
            algorithm: Algorithm::RsaPkcs1Sha256,
        );

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('the key service is unreachable');
        $this->rendered()->sign($provider);
    }

    public function testNoSignatureIsAskedForWhenPreparingFailed(): void
    {
        // An unreadable certificate is a fact about the inputs; paying for a
        // signature afterwards would tell the caller nothing new.
        $asked = false;
        $provider = new ExternalSigner(
            sign: static function (string $bytes) use (&$asked): string {
                $asked = true;

                return 'never reached';
            },
            cert: '/nonexistent/signer.crt',
            algorithm: Algorithm::RsaPkcs1Sha256,
        );

        $result = $this->rendered()->sign($provider);

        self::assertTrue($result->failed());
        self::assertFalse($asked);
    }

    public function testTheCertificateIsTakenExplicitlyInBothDirections(): void
    {
        $sign = static fn (string $bytes): string => 'x';

        try {
            new ExternalSigner(sign: $sign, cert: 'a.crt', certPem: 'b', algorithm: Algorithm::RsaPkcs1Sha256);
            self::fail('both forms at once were accepted');
        } catch (UsageException $error) {
            self::assertStringContainsString('not both', $error->getMessage());
        }

        try {
            new ExternalSigner(sign: $sign, algorithm: Algorithm::RsaPkcs1Sha256);
            self::fail('neither form was accepted');
        } catch (UsageException $error) {
            self::assertStringContainsString('needs either', $error->getMessage());
        }
    }

    public function testTheAlgorithmIsRequiredAndNamedRatherThanEchoed(): void
    {
        $sign = static fn (string $bytes): string => 'x';

        try {
            new ExternalSigner(sign: $sign, cert: 'a.crt');
            self::fail('a missing algorithm was accepted');
        } catch (UsageException $error) {
            self::assertStringContainsString('needs `algorithm:`', $error->getMessage());
        }

        try {
            new ExternalSigner(sign: $sign, cert: 'a.crt', algorithm: 'rsa-pkcs1-sha1');
            self::fail('an unsupported algorithm was accepted');
        } catch (UsageException $error) {
            self::assertStringContainsString('rsa-pkcs1-sha256', $error->getMessage());
            self::assertStringContainsString('ecdsa-p256-sha256', $error->getMessage());
            // The caller's string came from configuration this package does
            // not control, so it is never quoted back.
            self::assertStringNotContainsString('sha1"', $error->getMessage());
        }
    }

    public function testAWireSpellingIsAcceptedBesideTheEnumCase(): void
    {
        // A configuration file produces strings; a call site produces cases.
        $provider = new ExternalSigner(
            sign: static fn (string $bytes): string => 'x',
            cert: 'a.crt',
            algorithm: 'ecdsa-p256-sha256',
        );

        self::assertSame(Algorithm::EcdsaP256Sha256, $provider->algorithm);
    }

    public function testThePrintedFormShowsTheCertificateFormAndTheAlgorithmOnly(): void
    {
        $provider = $this->external('rsa2048', Algorithm::EcdsaP256Sha256);

        foreach ([(string) $provider, print_r($provider, true), var_export($provider, true)] as $shown) {
            self::assertStringNotContainsString('Closure', $shown);
        }
        self::assertStringContainsString('ecdsa-p256-sha256', (string) $provider);
        self::assertStringContainsString('rsa2048.cert.pem', (string) $provider);
    }

    public function testARegisteredExternalSignerSignsFromAStrictClient(): void
    {
        // The provider a strict deployment may use is a NAMED one, and an
        // external signer is as nameable as a local key.
        $client = $this->client(['strict' => true, 'providers' => ['kms' => $this->external()]]);

        $result = $client->sign($this->rendered(), 'kms');

        self::assertTrue($result->success(), (string) $result->failure());
    }

    public function testABareExternalSignerIsRefusedByAStrictClient(): void
    {
        $client = $this->client(['strict' => true, 'providers' => ['kms' => $this->external()]]);

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/registered in configuration/');
        $client->sign($this->rendered(), $this->external());
    }

    public function testAnEngineWithoutTheTwoStepVerbsIsRefusedByName(): void
    {
        // The FFI SDKs ask for an ABI revision before their first call; this
        // is that check in the shape a subprocess has.
        $this->inTempDir(function (string $dir): void {
            $client = $this->client(['binary' => $this->stubBinary($dir, 'exit 0')]);

            $this->expectException(IncompatibleEngineException::class);
            $this->expectExceptionMessageMatches('/cli\.sign\.external/');
            $client->sign($this->rendered(), $this->external());
        });
    }

    public function testAPrepareThatReportsNoBytesToSignIsAHostFailure(): void
    {
        // A report that parses and is not this operation's envelope: the
        // engine did not answer the question it was asked.
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/no bytes to sign/');
        $this->throughStub('{"ok":true,"diagnostics":{"items":[]}}');
    }

    public function testBytesToSignThatAreNotBase64AreAHostFailure(): void
    {
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/not base64/');
        // Strict base64 admits letters, digits and whitespace, so a string
        // that merely READS as prose still decodes — the refusal needs a
        // character outside the alphabet to be provable at all.
        $this->throughStub(
            '{"ok":true,"diagnostics":{"items":[]},"prepared":{"toBeSigned":"!!!!"}}',
        );
    }

    public function testACompleteThatWritesNoReportIsAHostFailure(): void
    {
        // The two legs must not share a report file: a second leg that dies
        // without writing would otherwise read the FIRST one's and report
        // success over a leg that never ran.
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/wrote no report/');
        $this->throughStub(
            '{"ok":true,"diagnostics":{"items":[]},"prepared":{"toBeSigned":"MTIz"}}',
            'exit 1',
        );
    }

    public function testACompleteThatSucceedsReadsItsOwnReportNotThePreparesOne(): void
    {
        // The two legs must not share a report file. A complete that says
        // `ok: false` has to arrive as a FAILED result even though the prepare
        // before it said `ok: true`.
        $result = $this->throughStub(
            '{"ok":true,"diagnostics":{"items":[]},"prepared":{"toBeSigned":"MTIz"}}',
            'printf \'%s\' \'{"ok":false,"diagnostics":{"items":[]},'
            .'"failure":{"class":"document","step":"sign","kind":"signing","message":"no"}}\' > "$report"'
            .PHP_EOL.'exit 1',
        );

        self::assertTrue($result->failed());
    }

    /**
     * Runs a signature through a stub engine that answers `sign-prepare` with
     * `$prepared` and `sign-complete` with `$complete`, and hands back the
     * result.
     */
    private function throughStub(
        string $prepared,
        string $complete = 'printf \'%s\' \'{"ok":true,"diagnostics":{"items":[]}}\' > "$report"',
    ): Result {
        return $this->inTempDir(function (string $dir) use ($prepared, $complete): Result {
            $body = <<<SH
                if [ "\$1" = "sign-prepare" ]; then
                    printf '%s' '{$prepared}' > "\$report"
                    exit 0
                fi
                {$complete}
                SH;
            $binary = $this->stubBinary($dir, $body, self::EXTERNAL_CAPABILITIES);
            $provider = new ExternalSigner(
                sign: static fn (string $bytes): string => 'a signature',
                certPem: '-----BEGIN CERTIFICATE-----',
                algorithm: Algorithm::RsaPkcs1Sha256,
            );
            return $this->client(['binary' => $binary])->sign($this->rendered(), $provider);
        });
    }

    private function external(
        string $stem = 'rsa2048',
        Algorithm $algorithm = Algorithm::RsaPkcs1Sha256,
    ): ExternalSigner {
        return new ExternalSigner(
            sign: $this->opensslSigner($stem),
            cert: $this->keyPath($stem.'.cert.pem'),
            algorithm: $algorithm,
        );
    }

    /**
     * A stand-in for a key service: signs with a key this package never sees.
     *
     * `openssl dgst -sha256 -sign` produces exactly what the engine expects —
     * PKCS#1 v1.5 bytes for an RSA key, an ASN.1 DER sequence for an EC one —
     * which is also what AWS KMS and Google Cloud KMS return.
     *
     * @return callable(string): string
     */
    private function opensslSigner(string $stem): callable
    {
        $key = $this->keyPath($stem.'.key.pem');

        return static function (string $toBeSigned) use ($key): string {
            $dir = sys_get_temp_dir().'/shojiku-php-sign-'.bin2hex(random_bytes(8));
            mkdir($dir, 0o700);
            $message = $dir.'/to-be-signed.bin';
            $signature = $dir.'/signature.bin';
            file_put_contents($message, $toBeSigned);
            exec(sprintf(
                'openssl dgst -sha256 -sign %s -out %s %s',
                escapeshellarg($key),
                escapeshellarg($signature),
                escapeshellarg($message),
            ), $output, $status);
            self::assertSame(0, $status, 'the stand-in key service failed');
            $bytes = file_get_contents($signature);
            self::assertIsString($bytes);
            unlink($message);
            unlink($signature);
            rmdir($dir);

            return $bytes;
        };
    }
}

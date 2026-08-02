<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Exception\UsageException;
use Shojiku\LocalPem;
use Shojiku\Origin;
use Shojiku\Step;

final class SigningTest extends TestCase
{
    use EngineFixtures;

    public function testSigningAppendsARevisionToTheDocumentItSigned(): void
    {
        $document = $this->rendered();

        $result = $document->sign($this->signer());

        self::assertTrue($result->success());
        $signed = $result->artifact();
        self::assertNotNull($signed);
        // The signed bytes BEGIN with the input, byte for byte.
        self::assertTrue(str_starts_with($signed->bytes(), $document->bytes()));
        self::assertGreaterThan($document->size(), $signed->size());
    }

    public function testASignedArtifactHasNoPageCount(): void
    {
        // Absent, not zero: signing appends a revision to bytes it never laid
        // out, and a zero would read as "a document with no pages".
        self::assertNull($this->signed()->pageCount());
    }

    public function testSigningInheritsTheOriginOfWhatItSigned(): void
    {
        self::assertSame(Origin::Rendered, $this->signed()->origin());

        $loaded = $this->client()->artifact($this->rendered()->bytes());
        $signed = $loaded->sign($this->signer())->artifact();
        self::assertNotNull($signed);
        self::assertSame(Origin::Loaded, $signed->origin());
    }

    public function testMaterialCrossesAsPathsOrAsBytes(): void
    {
        $fromBytes = new LocalPem(
            keyPem: (string) file_get_contents($this->keyPath('rsa2048.key.pem')),
            certPem: (string) file_get_contents($this->keyPath('rsa2048.cert.pem')),
        );

        self::assertTrue($this->rendered()->sign($this->signer())->success());
        self::assertTrue($this->rendered()->sign($fromBytes)->success());
    }

    public function testAnEncryptedKeyIsUnlockedThroughThePassphrase(): void
    {
        $provider = $this->signer(key: 'rsa2048.enc.pem', passphrase: $this->passphrase());

        self::assertTrue($this->rendered()->sign($provider)->success());
    }

    public function testAWrongPassphraseIsAFailedResultRatherThanAnException(): void
    {
        $provider = $this->signer(key: 'rsa2048.enc.pem', passphrase: 'not the passphrase');

        $result = $this->rendered()->sign($provider);

        self::assertTrue($result->failed());
        $failure = $result->failure();
        self::assertNotNull($failure);
        self::assertSame(Step::Sign, $failure->step());
        self::assertSame('key', $failure->kind());
    }

    public function testThePassphraseNeverAppearsInTheChildsArgumentVector(): void
    {
        // `argv` is readable by other processes on most systems and lands in
        // shell history, which is why the CLI offers no flag that takes a
        // passphrase. What crosses is the NAME of an environment variable.
        $argv = \Shojiku\Request::sign('/in.pdf', '/key.pem', '/cert.pem', 'SHOJIKU_PASSPHRASE');

        self::assertContains('--passphrase-env', $argv);
        self::assertContains('SHOJIKU_PASSPHRASE', $argv);
        self::assertNotContains($this->passphrase(), $argv);
    }

    public function testAnUnencryptedKeyIsSignedWithoutThePassphraseFlagAtAll(): void
    {
        $argv = \Shojiku\Request::sign('/in.pdf', '/key.pem', '/cert.pem', null);

        self::assertNotContains('--passphrase-env', $argv);
    }

    public function testAnUnreadableKeyIsAFailedResultNotAnException(): void
    {
        $provider = new LocalPem(
            key: $this->keyPath('no-such-key.pem'),
            cert: $this->keyPath('rsa2048.cert.pem'),
        );

        $result = $this->rendered()->sign($provider);

        self::assertTrue($result->failed());
        $failure = $result->failure();
        self::assertNotNull($failure);
        // The engine reads the path, so the kind is the engine's `io` rather
        // than a host-side one — a failed result either way, which is what
        // the contract fixes.
        self::assertSame('io', $failure->kind());
        self::assertSame(Step::Sign, $failure->step());
    }

    public function testBothFormsOfTheSameMaterialAtOnceIsProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/either `key:` \(a path\) or `keyPem:` \(bytes\), not both/');
        new LocalPem(key: '/a.pem', keyPem: 'bytes', cert: '/c.pem');
    }

    public function testNeitherFormOfTheMaterialIsProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/needs either `cert:`/');
        new LocalPem(key: '/a.pem');
    }

    public function testAProviderNeverPrintsItsKeyOrPassphrase(): void
    {
        // PHP has four ways to dump an object and `__debugInfo()` covers
        // exactly one, so the material is not held in a property at all. Each
        // surface reaches a different audience — a console, an exception
        // reporter, a log aggregator — so each is checked.
        $secretKey = "-----BEGIN PRIVATE KEY-----\nSUPERSECRETKEYMATERIAL\n-----END PRIVATE KEY-----\n";
        $provider = new LocalPem(
            keyPem: $secretKey,
            cert: '/etc/ssl/signer.crt',
            passphrase: 'hunter2',
        );

        $forms = [
            'toString' => (string) $provider,
            'print_r' => print_r($provider, true),
            'var_export' => var_export($provider, true),
            'var_dump' => self::dumped($provider),
        ];
        foreach ($forms as $name => $printed) {
            self::assertStringNotContainsString('SUPERSECRETKEYMATERIAL', $printed, $name);
            self::assertStringNotContainsString('hunter2', $printed, $name);
        }
        self::assertStringContainsString('[pem bytes]', $forms['toString']);
        self::assertStringContainsString('/etc/ssl/signer.crt', $forms['toString']);
        self::assertStringContainsString('[redacted]', $forms['toString']);
    }

    public function testAProviderWithNoPassphraseSaysSoRatherThanRedactingNothing(): void
    {
        self::assertStringContainsString('passphrase=none', (string) $this->signer());
    }

    public function testAStackTraceDoesNotCarryTheMaterialItWasConstructedWith(): void
    {
        // `#[\SensitiveParameter]` is the fifth surface: PHP prints the
        // arguments a frame was called with, so a throw anywhere below a
        // constructor would otherwise publish the key.
        try {
            new LocalPem(keyPem: 'SUPERSECRETKEYMATERIAL', passphrase: 'hunter2');
            self::fail('the provider was not refused');
        } catch (UsageException $e) {
            $trace = $e->getTraceAsString();
            self::assertStringNotContainsString('SUPERSECRETKEYMATERIAL', $trace);
            self::assertStringNotContainsString('hunter2', $trace);
        }
    }

    public function testTheMaterialAccessorsReportWhichFormEachHalfCameFrom(): void
    {
        $fromPath = $this->signer();
        self::assertNull($fromPath->keyPem());
        self::assertNull($fromPath->certPem());
        self::assertSame($this->keyPath('rsa2048.key.pem'), $fromPath->keyPath());

        $fromBytes = new LocalPem(keyPem: 'k', certPem: 'c');
        self::assertSame('k', $fromBytes->keyPem());
        self::assertSame('c', $fromBytes->certPem());
        self::assertNull($fromBytes->keyPath());
        self::assertNull($fromBytes->certPath());
    }

    private static function dumped(object $value): string
    {
        ob_start();
        var_dump($value);

        return (string) ob_get_clean();
    }
}

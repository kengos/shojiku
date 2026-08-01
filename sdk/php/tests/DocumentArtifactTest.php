<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\DocumentArtifact;
use Shojiku\Exception\UsageException;
use Shojiku\Origin;

final class DocumentArtifactTest extends TestCase
{
    use EngineFixtures;

    public function testItCarriesTheDocumentAsBytesWithItsPageCount(): void
    {
        $artifact = $this->rendered();

        self::assertStringStartsWith('%PDF-', $artifact->bytes());
        self::assertSame(strlen($artifact->bytes()), $artifact->size());
        self::assertSame(1, $artifact->pageCount());
    }

    public function testItWritesTheDocumentByteForByte(): void
    {
        $this->inTempDir(function (string $dir): void {
            $path = $this->rendered()->write($dir.'/receipt.pdf');

            self::assertSame($dir.'/receipt.pdf', $path);
            self::assertSame($this->rendered()->bytes(), file_get_contents($path));
        });
    }

    public function testAnUnwritablePathIsProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/could not write/');
        // A directory that does not exist, not a chmod: the gate container
        // runs as root and would happily write into a read-only directory.
        $this->rendered()->write('/nonexistent-directory/receipt.pdf');
    }

    public function testTheOriginDefaultsToTheLeastPrivilegedValue(): void
    {
        // Every internal path states the origin explicitly, so the default
        // only ever applies to an artifact somebody built by hand — which is
        // bytes handed over whole, and must not become signable under a
        // lockdown by omission.
        $artifact = new DocumentArtifact(bytes: 'x', diagnostics: [], client: $this->client());

        self::assertSame(Origin::Loaded, $artifact->origin());
        self::assertTrue($artifact->loaded());
        self::assertNull($artifact->pageCount());
    }

    public function testARenderedArtifactIsNotLoaded(): void
    {
        self::assertFalse($this->rendered()->loaded());
        self::assertSame(Origin::Rendered, $this->rendered()->origin());
    }

    public function testAnArtifactCarriesTheDiagnosticsOfTheRenderThatMadeIt(): void
    {
        $artifact = $this->client()->generate('warns', [])->artifact();

        self::assertNotNull($artifact);
        self::assertCount(1, $artifact->diagnostics());
    }

    public function testSignAndVerifyReachTheClientThatProducedIt(): void
    {
        $artifact = $this->rendered();

        self::assertTrue($artifact->sign($this->signer())->success());
        self::assertTrue($artifact->verify(anchors: $this->keyPath('rsa2048.cert.pem'))->failed());
    }
}

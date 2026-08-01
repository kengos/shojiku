<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Client;
use Shojiku\Exception\UsageException;
use Shojiku\Origin;
use Shojiku\Step;

final class ClientTest extends TestCase
{
    use EngineFixtures;

    public function testGenerateRendersATemplateFromTheRoot(): void
    {
        $result = $this->client()->generate('receipt', ['customer' => ['name' => 'Yamada Shoji K.K.']]);

        self::assertTrue($result->success());
        $artifact = $result->artifact();
        self::assertNotNull($artifact);
        self::assertStringStartsWith('%PDF-', $artifact->bytes());
        self::assertSame(1, $artifact->pageCount());
        self::assertSame(Origin::Rendered, $artifact->origin());
        self::assertSame([], $result->diagnostics());
    }

    public function testGenerateAcceptsParamsAsSourceTextVerbatim(): void
    {
        // A string crosses untouched: the engine parses JSON or YAML, so
        // re-encoding it here would only be a chance to change it.
        $result = $this->client()->generate('receipt', "customer:\n  name: Yamada Shoji K.K.\n");

        self::assertTrue($result->success());
    }

    public function testASuccessfulRenderCarriesItsWarnings(): void
    {
        $result = $this->client()->generate('warns', []);

        self::assertTrue($result->success());
        self::assertCount(1, $result->warnings());
        self::assertSame('text_overflow', $result->warnings()[0]->code());
        self::assertSame([], $result->errors());
    }

    public function testARefusedDocumentIsAFailedResultCarryingTheEnginesDiagnostics(): void
    {
        $result = $this->client()->generate('broken', []);

        self::assertTrue($result->failed());
        $failure = $result->failure();
        self::assertNotNull($failure);
        // The SDK's own lifecycle step, never the engine's internal `render`.
        self::assertSame(Step::Generate, $failure->step());
        self::assertSame('document', $failure->kind());
        self::assertCount(1, $result->errors());
        self::assertSame('image_source_missing', $result->errors()[0]->code());
    }

    public function testDiagnosticsPassThroughWithCodeAndArgsUntranslated(): void
    {
        $warning = $this->client()->generate('warns', [])->warnings()[0];

        self::assertSame('warning', $warning->severity());
        self::assertSame('layout', $warning->category());
        self::assertSame('sections.body.items[0]', $warning->path());
        self::assertSame(['avail' => 24.0, 'content' => 25.2], $warning->args());
    }

    public function testGenerateWithoutATemplateRootIsProgrammerMisuse(): void
    {
        $client = new Client(binary: $this->engineBinary(), env: false);

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/no template root/');
        $client->generate('receipt', []);
    }

    public function testEngineInfoReturnsThePayloadUnmodelled(): void
    {
        $info = $this->client()->engineInfo();

        self::assertIsString($info['version']);
        self::assertIsArray($info['capabilities']);
        self::assertContains('cli.report', $info['capabilities']);
        self::assertIsArray($info['builtinLocales']);
    }

    public function testAPerCallLangBeatsTheClientWideOne(): void
    {
        // The precedence is the contract; that php spells it as an argument
        // rather than as a derived client is ecosystem idiom, settled by the
        // python mirror.
        $client = $this->client(['lang' => 'nonexistent-locale']);

        self::assertTrue($client->generate('receipt', [], lang: 'en-US')->success());
        self::assertTrue($client->generate('receipt', [])->failed());
    }

    public function testArtifactReEntersArchivedBytesAsLoaded(): void
    {
        $artifact = $this->client()->artifact($this->rendered()->bytes());

        self::assertSame(Origin::Loaded, $artifact->origin());
        self::assertTrue($artifact->loaded());
        self::assertNull($artifact->pageCount());
        self::assertSame([], $artifact->diagnostics());
    }

    public function testParamsThatCannotBeSerializedAreProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/could not be serialized/');
        // Invalid UTF-8 has no JSON representation, and the engine's surface
        // is UTF-8 by contract, so there is nothing to render.
        $this->client()->generate('receipt', ['customer' => ['name' => "\xB1\x31"]]);
    }
}

<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Origin;
use Shojiku\Sources;

/**
 * The bytes-first entrance: templates the application already holds.
 *
 * Fetching them stays the application's act — nothing here opens a socket —
 * and root containment does not apply, because there is no root to be
 * contained by.
 */
final class SourceGenerateTest extends TestCase
{
    use EngineFixtures;

    public function testSourceTextRendersWithoutATemplateRootAtAll(): void
    {
        $client = $this->client(['templates' => null]);

        $result = $client->generateSource(
            template: $this->sourceTemplate($this->textItem('customer.name')),
            params: ['customer' => ['name' => 'Yamada Shoji K.K.']],
        );

        self::assertTrue($result->success());
        $artifact = $result->artifact();
        self::assertNotNull($artifact);
        self::assertSame(Origin::Source, $artifact->origin());
        self::assertSame(1, $artifact->pageCount());
    }

    public function testAPathShapedTemplateArgumentIsAParseFailureNotAFileThatWasOpened(): void
    {
        // An SDK that "helpfully" opened it would make every containment rule
        // bypassable by spelling the same thing differently.
        $result = $this->client()->generateSource(
            template: $this->fixtureTemplates().'/receipt/templates.yml',
        );

        self::assertTrue($result->failed());
        // `parse`, not the `io` kind an opened file would have produced: the
        // path was handed to the YAML parser as the template it claimed to
        // be. The real file behind that path renders perfectly.
        self::assertSame('parse', $result->failure()?->kind());
        self::assertNull($result->artifact());
    }

    public function testDefinitionsRideAlongWhenTheApplicationHasThem(): void
    {
        $result = $this->client()->generateSource(
            template: $this->sourceTemplate($this->textItem('customer.name')),
            definitions: (string) file_get_contents($this->fixtureTemplates().'/receipt/definitions.yml'),
            params: ['customer' => ['name' => 'Yamada Shoji K.K.']],
        );

        self::assertTrue($result->success());
    }

    public function testDefinitionsThatContradictTheParamsAreDiagnosed(): void
    {
        // Which proves the definitions actually crossed: without them the
        // engine has no schema to compare the params against and says
        // nothing.
        $result = $this->client()->generateSource(
            template: $this->sourceTemplate($this->textItem('customer.name')),
            definitions: (string) file_get_contents($this->fixtureTemplates().'/receipt/definitions.yml'),
            params: ['customer' => ['name' => 42]],
        );

        self::assertTrue($result->success());
        self::assertSame('params_type_mismatch', $result->warnings()[0]->code());
    }

    public function testBundledAssetsResolveAgainstThePerCallDirectory(): void
    {
        $items = <<<'YAML'
            - id: logo
              type: image
              box: { x: 0, y: 0, w: 40, h: 40 }
              src: assets/logo.svg
            YAML;

        $result = $this->client()->generateSource(
            template: $this->sourceTemplate($items),
            assetsDir: $this->sourceAssets(),
        );

        self::assertTrue($result->success(), (string) $result->failure());
    }

    public function testWithoutAnAssetsDirectoryABundledSourceHasNowhereToResolve(): void
    {
        // Inline sources have no directory of their own, so bundled image
        // sources are simply unavailable rather than resolved against
        // something arbitrary.
        $items = <<<'YAML'
            - id: logo
              type: image
              box: { x: 0, y: 0, w: 40, h: 40 }
              src: assets/logo.svg
            YAML;

        $result = $this->client()->generateSource(template: $this->sourceTemplate($items));

        self::assertTrue($result->failed());
    }

    public function testAPerCallLangAppliesToTheBytesEntranceToo(): void
    {
        $result = $this->client()->generateSource(
            template: $this->sourceTemplate($this->textItem('customer.name')),
            params: ['customer' => ['name' => 'x']],
            lang: 'en-US',
        );

        self::assertTrue($result->success());
    }

    public function testSourcesFromBytesAreWrittenIntoTheWorkspaceRatherThanRead(): void
    {
        \Shojiku\Workspace::in(function (\Shojiku\Workspace $workspace): void {
            $sources = Sources::fromBytes($workspace, 'template bytes', 'definition bytes', '/assets');

            self::assertSame('template bytes', file_get_contents($sources->template));
            self::assertSame('definition bytes', file_get_contents((string) $sources->definitions));
            self::assertSame('/assets', $sources->assetsDir);
        });
    }

    public function testAbsentDefinitionsStayAbsentThroughTheWorkspace(): void
    {
        \Shojiku\Workspace::in(static function (\Shojiku\Workspace $workspace): void {
            $sources = Sources::fromBytes($workspace, 'template bytes', null, null);

            self::assertNull($sources->definitions);
            self::assertNull($sources->assetsDir);
        });
    }
}

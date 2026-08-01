<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Client;
use Shojiku\Configuration;
use Shojiku\Exception\UsageException;
use Shojiku\Lockdown;

/**
 * The lockdown, one clause at a time.
 *
 * A lockdown tested as a whole reports "something was refused" and stops
 * proving which rule did it, so each clause gets its own test.
 */
final class LockdownTest extends TestCase
{
    use EngineFixtures;

    public function testAStrictClientRefusesTheBytesEntrance(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/`generateSource` is disabled/');
        $this->client(['strict' => true])->generateSource(template: "version: 0.1.0\nname: x\n");
    }

    public function testAStrictClientRefusesToSignADocumentItDidNotRender(): void
    {
        $strict = $this->client(['strict' => true, 'providers' => ['default' => $this->signer()]]);
        $loaded = $strict->artifact($this->rendered()->bytes());

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/only a document rendered from its own template root.*loaded/s');
        $strict->sign($loaded, 'default');
    }

    public function testAStrictClientStillSignsWhatItRenderedItself(): void
    {
        $strict = $this->client(['strict' => true, 'providers' => ['default' => $this->signer()]]);
        $result = $strict->generate('receipt', []);
        $artifact = $result->artifact();
        self::assertNotNull($artifact);

        self::assertTrue($strict->sign($artifact, 'default')->success());
    }

    public function testAStrictClientRefusesAProviderObjectInFavourOfARegisteredName(): void
    {
        $strict = $this->client(['strict' => true, 'providers' => ['default' => $this->signer()]]);

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/sign with the name of a provider registered/');
        $strict->sign($this->rendered(), $this->signer());
    }

    public function testAnUnknownProviderNameIsRefusedWithoutEchoingAnythingUnbounded(): void
    {
        $client = $this->client(['providers' => ['default' => $this->signer()]]);

        try {
            $client->sign($this->rendered(), str_repeat('n', 500)."\x00");
            self::fail('the unknown provider was not refused');
        } catch (UsageException $e) {
            self::assertStringContainsString('no signing provider named', $e->getMessage());
            self::assertLessThan(150, strlen($e->getMessage()));
            self::assertStringNotContainsString("\x00", $e->getMessage());
        }
    }

    public function testConfiguredStrictnessSurvivesACallSiteAskingForStrictFalse(): void
    {
        // The ONE place configuration beats a call site: a restriction an
        // operator declared must not be liftable by application code.
        Configuration::configure(['strict' => true]);

        $client = new Client(
            templates: $this->fixtureTemplates(),
            binary: $this->engineBinary(),
            strict: false,
            env: false,
        );

        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/`generateSource` is disabled/');
        $client->generateSource(template: "version: 0.1.0\nname: x\n");
    }

    public function testANamedProviderIsAcceptedOutsideStrictModeToo(): void
    {
        // Naming providers is good practice everywhere; only the REFUSAL of
        // the alternative belongs to strict.
        $client = $this->client(['providers' => ['default' => $this->signer()]]);

        self::assertTrue($client->sign($this->rendered(), 'default')->success());
    }

    public function testANonStrictClientAcceptsAProviderObject(): void
    {
        self::assertTrue($this->client()->sign($this->rendered(), $this->signer())->success());
    }

    public function testTheLockdownReportsWhetherItIsInForce(): void
    {
        self::assertTrue((new Lockdown(strict: true))->strict());
        self::assertFalse((new Lockdown(strict: false))->strict());
    }
}

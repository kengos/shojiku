<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Binary;
use Shojiku\Env;
use Shojiku\Exception\BinaryNotFoundException;
use Shojiku\Version;

/**
 * No SDK downloads anything, ever.
 *
 * An SDK that fetches an executable at install or run time is a supply-chain
 * surface this product's trust story cannot afford — a signing library that
 * pulls its own signer off the network has given the game away. Installation
 * is the user's explicit act, and the not-found error's job is to say how.
 */
final class NoDownloadTest extends TestCase
{
    use EngineFixtures;

    public function testNothingInThePackageOpensASocket(): void
    {
        $offenders = [];
        foreach (self::sources() as $file => $source) {
            if (preg_match('/\b(curl_init|fsockopen|file_get_contents\(\s*.https?:|stream_socket_client)\b/', $source) === 1) {
                $offenders[] = $file;
            }
        }

        self::assertSame([], $offenders);
    }

    public function testTheNotFoundErrorNamesTheInstallChannelsInsteadOfOfferingToFetch(): void
    {
        try {
            new Binary(null, new Env(enabled: true, source: ['PATH' => '/nowhere']));
            self::fail('a missing binary was not refused');
        } catch (BinaryNotFoundException $e) {
            $message = $e->getMessage();
            self::assertStringContainsString('never downloads the engine', $message);
            self::assertStringContainsString('build it from a repository clone', $message);
            self::assertStringContainsString('SHOJIKU_BIN', $message);
            self::assertStringContainsString('Shojiku\\Client(binary:', $message);
            self::assertStringNotContainsString('http', $message);
        }
    }

    public function testThePackageDeclaresNoRuntimeDependencies(): void
    {
        // EXACTLY none, and this is what pins it: the transport is
        // `proc_open`, which is the language itself.
        $manifest = json_decode((string) file_get_contents(dirname(__DIR__).'/composer.json'), true);

        self::assertIsArray($manifest);
        self::assertIsArray($manifest['require']);
        self::assertSame(['php'], array_keys($manifest['require']));
        self::assertArrayNotHasKey('require-dev', $manifest);
    }

    public function testTheVersionMovesInLockstepWithTheEngine(): void
    {
        // Pre-1.0, every SDK carries the engine workspace's version and all
        // seven publish together. `composer.json` has no `version` field —
        // a registry derives that from the tag — so this constant is the
        // only place the claim can be checked.
        $manifest = (string) file_get_contents(dirname(__DIR__, 3).'/engine/Cargo.toml');
        $found = [];
        preg_match('/^version = "([^"]+)"$/m', $manifest, $found);
        self::assertCount(2, $found, 'engine/Cargo.toml carries no workspace version');
        self::assertSame($found[1] ?? '', Version::VERSION);
    }

    /**
     * @return array<string, string>
     */
    private static function sources(): array
    {
        $sources = [];
        /** @var iterable<string, \SplFileInfo> $files */
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(dirname(__DIR__).'/src'));
        foreach ($files as $path => $file) {
            if ($file->isFile() && str_ends_with($path, '.php')) {
                $sources[basename($path)] = (string) file_get_contents($path);
            }
        }
        self::assertGreaterThan(20, count($sources), 'the source sweep matched almost nothing');

        return $sources;
    }
}

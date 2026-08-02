<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Binary;
use Shojiku\Env;
use Shojiku\Exception\BinaryNotFoundException;

/**
 * Finding the engine, at all three lookup positions.
 *
 * The order is the REVERSE of the template root's, and deliberately: where
 * the engine lives is an operator's decision that has to be able to win over
 * application code, while which templates an application renders is the
 * application's own.
 */
final class BinaryTest extends TestCase
{
    use EngineFixtures;
    use StubBinary;

    public function testTheEnvironmentBeatsExplicitConfiguration(): void
    {
        $this->inTempDir(function (string $dir): void {
            $fromEnv = $this->stubBinary($dir, 'exit 0');
            $env = new Env(enabled: true, source: ['SHOJIKU_BIN' => $fromEnv]);

            $binary = new Binary('/configured/shojiku', $env);

            self::assertSame($fromEnv, $binary->path);
            self::assertSame('environment', $binary->source);
        });
    }

    public function testExplicitConfigurationBeatsThePath(): void
    {
        $this->inTempDir(function (string $dir): void {
            $configured = $this->stubBinary($dir, 'exit 0');
            $onPath = $dir.'/path-copy';
            copy($configured, $onPath);
            chmod($onPath, 0o755);
            $env = new Env(enabled: true, source: ['PATH' => $dir]);

            $binary = new Binary($configured, $env);

            self::assertSame($configured, $binary->path);
            self::assertSame('configuration', $binary->source);
        });
    }

    public function testThePathIsSearchedWhenNothingElseNamesOne(): void
    {
        $this->inTempDir(function (string $dir): void {
            $onPath = $dir.'/shojiku';
            copy($this->engineBinary(), $onPath);
            chmod($onPath, 0o755);
            $env = new Env(enabled: true, source: ['PATH' => '/nowhere'.PATH_SEPARATOR.$dir]);

            $binary = new Binary(null, $env);

            self::assertSame($onPath, $binary->path);
            self::assertSame('path', $binary->source);
        });
    }

    public function testTheWindowsSpellingIsTriedAtEveryPathEntry(): void
    {
        // Windows is a first-class target, and a lookup that only tried the
        // bare name would fail there alone — the platform least likely to be
        // in front of whoever writes the lookup.
        $this->inTempDir(function (string $dir): void {
            $onPath = $dir.'/shojiku.exe';
            file_put_contents($onPath, "#!/bin/sh\nexit 0\n");
            chmod($onPath, 0o755);
            $env = new Env(enabled: true, source: ['PATH' => $dir]);

            self::assertSame($onPath, (new Binary(null, $env))->path);
        });
    }

    public function testAnEmptyPathEntryIsSkippedRatherThanSearchedAsTheCwd(): void
    {
        $env = new Env(enabled: true, source: ['PATH' => PATH_SEPARATOR]);

        self::assertSame([null, 'path'], Binary::discover(null, $env));
    }

    public function testNoBinaryAnywhereNamesTheInstallChannels(): void
    {
        $env = new Env(enabled: true, source: ['PATH' => '/nowhere']);

        try {
            new Binary(null, $env);
            self::fail('a missing binary was not refused');
        } catch (BinaryNotFoundException $e) {
            self::assertStringContainsString('never downloads the engine', $e->getMessage());
            self::assertStringContainsString('SHOJIKU_BIN', $e->getMessage());
            self::assertStringContainsString('Docker image', $e->getMessage());
        }
    }

    public function testAPathThatIsNotExecutableIsRefusedByName(): void
    {
        $this->inTempDir(function (string $dir): void {
            // A DIRECTORY where the binary belongs, not a chmod: the gate
            // container runs as root, so permission bits prove nothing.
            mkdir($dir.'/shojiku');
            $env = new Env(enabled: true, source: []);

            $this->expectException(BinaryNotFoundException::class);
            $this->expectExceptionMessageMatches('/is not an executable file/');
            new Binary($dir.'/shojiku', $env);
        });
    }

    public function testDiscoveryDefaultsToTheProcessEnvironment(): void
    {
        // The image sets SHOJIKU_BIN, which is also how every other test in
        // this suite reaches the engine.
        self::assertSame($this->engineBinary(), (new Binary())->path);
    }
}

<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Shojiku\Client;
use Shojiku\Configuration;
use Shojiku\Exception\UsageException;
use Shojiku\Step;
use Shojiku\TemplateRoot;

/**
 * The hardening, one test per claim.
 *
 * The rejection rules are the UNION across platforms, so every one of these
 * is refused on this machine too — a template name that is valid on one
 * machine has to be valid on all of them, which is the only way the same
 * application deploys to both.
 *
 * Hostile control characters are written as PHP ESCAPES, never as raw bytes:
 * a raw one makes the whole file binary-classified and silently absent from
 * every `grep`.
 */
final class TemplateRootTest extends TestCase
{
    use EngineFixtures;

    /**
     * @return array<string, array{string}>
     */
    public static function refusedNames(): array
    {
        return [
            'empty' => [''],
            'blank' => ['   '],
            'absolute posix' => ['/etc/passwd'],
            'traversal' => ['../receipt'],
            'nested' => ['business/receipt'],
            'backslash separator' => ['business\\receipt'],
            'windows absolute' => ['\\\\host\\share'],
            'drive relative' => ['C:receipt'],
            'nul byte' => ["recei\x00pt"],
            'escape byte' => ["recei\x1bpt"],
            'del byte' => ["recei\x7fpt"],
            'reserved device' => ['CON'],
            'reserved device lowercase' => ['nul'],
            'reserved device with extension' => ['CON.yml'],
            'reserved device with trailing dot' => ['CON.'],
            'reserved device with trailing space' => ['CON '],
            'reserved port device' => ['COM1'],
        ];
    }

    #[DataProvider('refusedNames')]
    public function testAHostileNameIsARefusedRequestRatherThanAnException(string $name): void
    {
        $result = $this->client()->generate($name, []);

        self::assertTrue($result->failed(), sprintf('`%s` was not refused', addcslashes($name, "\0..\37")));
        $failure = $result->failure();
        self::assertNotNull($failure);
        self::assertSame('template_name', $failure->kind());
        self::assertSame(Step::Generate, $failure->step());
    }

    public function testAMissingNameIsRefusedAsNotFound(): void
    {
        $result = $this->client()->generate('no-such-template', []);

        $failure = $result->failure();
        self::assertNotNull($failure);
        self::assertSame('template_not_found', $failure->kind());
    }

    public function testADirectoryWithoutATemplateFileIsRefusedAsUnreadable(): void
    {
        $this->inTempDir(function (string $root): void {
            mkdir($root.'/empty');
            // A directory where `templates.yml` belongs, not a chmod: the gate
            // container runs as ROOT, and root ignores permission bits, so a
            // `chmod 000` fixture would pass for the wrong reason.
            mkdir($root.'/empty/templates.yml');

            $failure = $this->client(['templates' => $root])->generate('empty', [])->failure();

            self::assertNotNull($failure);
            self::assertSame('template_unreadable', $failure->kind());
            self::assertNotNull($failure->cause());
            self::assertSame('io', $failure->cause()?->kind());
        });
    }

    public function testASymlinkOutOfTheRootIsRefusedAfterCanonicalization(): void
    {
        $this->inTempDir(function (string $dir): void {
            mkdir($dir.'/root');
            mkdir($dir.'/outside');
            file_put_contents($dir.'/outside/templates.yml', "version: 0.1.0\nname: x\n");
            symlink($dir.'/outside', $dir.'/root/escape');

            $failure = $this->client(['templates' => $dir.'/root'])->generate('escape', [])->failure();

            self::assertNotNull($failure);
            self::assertSame('template_escapes_root', $failure->kind());
        });
    }

    public function testASiblingDirectorySharingTheRootsPrefixIsNotInsideIt(): void
    {
        // A prefix compare would accept `<root>-evil`; the containment test is
        // structural for exactly this case.
        $this->inTempDir(function (string $dir): void {
            mkdir($dir.'/root');
            mkdir($dir.'/root-evil');
            file_put_contents($dir.'/root-evil/templates.yml', "version: 0.1.0\nname: x\n");
            symlink($dir.'/root-evil', $dir.'/root/evil');

            $failure = $this->client(['templates' => $dir.'/root'])->generate('evil', [])->failure();

            self::assertNotNull($failure);
            self::assertSame('template_escapes_root', $failure->kind());
        });
    }

    public function testAMissingRootIsRefusedRatherThanCompared(): void
    {
        // `realpath()` returns FALSE for a path that does not exist rather
        // than raising; a containment check that skipped that branch would
        // compare a false against a string.
        $failure = $this->client(['templates' => '/nonexistent-root'])->generate('receipt', [])->failure();

        self::assertNotNull($failure);
        self::assertSame('template_not_found', $failure->kind());
    }

    public function testANameThatIsNotAStringIsProgrammerMisuse(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/must be a string; got int/');
        $this->client()->generate(42, []);
    }

    public function testTheRejectionMessageBoundsWhatItEchoes(): void
    {
        $failure = $this->client()->generate(str_repeat('a', 500).'/x', [])->failure();

        self::assertNotNull($failure);
        // Bounded to the echo limit plus the message around it — what matters
        // is that a hostile name cannot make the message unbounded.
        self::assertLessThan(300, strlen($failure->message()));
    }

    public function testTheRootIsResolvedThroughTheConfiguredValueFirst(): void
    {
        $root = new TemplateRoot($this->fixtureTemplates());

        self::assertSame($this->fixtureTemplates(), $root->path());
        $sources = $root->resolve('receipt');
        self::assertStringEndsWith('receipt/templates.yml', $sources->template);
        self::assertStringEndsWith('receipt/definitions.yml', (string) $sources->definitions);
        self::assertStringEndsWith('receipt', (string) $sources->assetsDir);
    }

    public function testAnOptionalDefinitionsFileIsAbsentRatherThanEmpty(): void
    {
        $sources = (new TemplateRoot($this->fixtureTemplates()))->resolve('warns');

        self::assertNull($sources->definitions);
    }

    public function testAnExplicitRootBeatsConfigurationWhichBeatsTheEnvironment(): void
    {
        putenv('SHOJIKU_TEMPLATE_ROOT=/from-environment');

        try {
            // The environment supplies it when nothing else does…
            self::assertSame('/from-environment', (new Client())->templateRoot()?->path());
            // …configuration beats the environment…
            Configuration::configure(['templates' => '/configured']);
            self::assertSame('/configured', (new Client())->templateRoot()?->path());
            // …an explicit argument beats both…
            self::assertSame('/explicit', (new Client(templates: '/explicit'))->templateRoot()?->path());
            // …and one flag turns every `SHOJIKU_*` lookup off at once. The
            // binary is passed explicitly for the same reason: with lookups
            // off, `SHOJIKU_BIN` is not read either, and a client cannot be
            // built over an engine it cannot find.
            Configuration::reset();
            self::assertNull((new Client(binary: $this->engineBinary(), env: false))->templateRoot());
        } finally {
            putenv('SHOJIKU_TEMPLATE_ROOT');
        }
    }
}

<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Configuration;
use Shojiku\Exception\UsageException;
use Shojiku\Settings;

final class ConfigurationTest extends TestCase
{
    use EngineFixtures;

    public function testAnUnknownSettingIsANamedErrorRatherThanIgnored(): void
    {
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/unknown client setting `template`/');
        Configuration::configure(['template' => 'app/templates']);
    }

    public function testAnUnknownSettingNameIsBoundedBeforeItIsEchoed(): void
    {
        try {
            Configuration::configure([str_repeat('k', 500) => 'x']);
            self::fail('the unknown setting was not refused');
        } catch (UsageException $e) {
            self::assertLessThan(150, strlen($e->getMessage()));
        }
    }

    public function testConfiguredDefaultsReachEveryClientBuiltAfterwards(): void
    {
        Configuration::configure(['templates' => '/configured', 'lang' => 'ja-JP']);

        self::assertSame('/configured', Configuration::global()->templates);
        self::assertSame('ja-JP', Configuration::global()->lang);
    }

    public function testResetDropsEveryConfiguredDefault(): void
    {
        Configuration::configure(['templates' => '/configured']);
        Configuration::reset();

        self::assertNull(Configuration::global()->templates);
        self::assertFalse(Configuration::global()->strict);
        self::assertTrue(Configuration::global()->env);
    }

    public function testANullOverrideMeansNotGivenRatherThanCleared(): void
    {
        $base = new Configuration(templates: '/configured', lang: 'ja-JP');

        $merged = $base->merge(['templates' => null, 'lang' => 'en-US']);

        self::assertSame('/configured', $merged->templates);
        self::assertSame('en-US', $merged->lang);
    }

    public function testStrictIsOrEdRatherThanOverridden(): void
    {
        $declared = new Configuration(strict: true);

        self::assertTrue($declared->merge(['strict' => false])->strict);
        self::assertTrue((new Configuration())->merge(['strict' => true])->strict);
        self::assertFalse((new Configuration())->merge([])->strict);
    }

    public function testProvidersReplaceRatherThanMerge(): void
    {
        // A client that declares its own registry is stating the whole set it
        // may sign with; quietly adding globally-registered keys to that set
        // would defeat the point.
        $signer = $this->signer();
        $base = new Configuration(providers: ['global' => $signer]);

        $merged = $base->merge(['providers' => ['local' => $signer]]);

        self::assertSame(['local'], array_keys((array) $merged->providers));
    }

    public function testEveryOtherSettingCrossesTheMerge(): void
    {
        $logger = new RecordingLogger();
        $signer = $this->signer();

        $merged = (new Configuration())->merge([
            'templates' => '/root',
            'fontDirs' => ['/fonts'],
            'localeDirs' => ['/locale'],
            'lang' => 'ja-JP',
            'binary' => '/bin/shojiku',
            'logger' => $logger,
            'providers' => ['default' => $signer],
            'env' => false,
        ]);

        self::assertSame('/root', $merged->templates);
        self::assertSame(['/fonts'], $merged->fontDirs);
        self::assertSame(['/locale'], $merged->localeDirs);
        self::assertSame('ja-JP', $merged->lang);
        self::assertSame('/bin/shojiku', $merged->binary);
        self::assertSame($logger, $merged->logger);
        self::assertSame(['default' => $signer], $merged->providers);
        self::assertFalse($merged->env);
    }

    public function testTheConfiguredPackDirectoriesBeatTheEnvironment(): void
    {
        // The precedence claim is about the root AND the pack directories;
        // the root half is proved in TemplateRootTest, and this is the other
        // half. Read through Settings, which is where the rule lives.
        putenv('SHOJIKU_FONT_DIR=/from-environment');

        try {
            $binary = ['binary' => $this->engineBinary()];
            // The environment supplies them when nothing else does…
            self::assertSame(['/from-environment'], (new Settings($binary))->fontDirs());
            // …configuration beats the environment…
            Configuration::configure(['fontDirs' => ['/configured']]);
            self::assertSame(['/configured'], (new Settings($binary))->fontDirs());
            // …an explicit argument beats both…
            self::assertSame(
                ['/explicit'],
                (new Settings([...$binary, 'fontDirs' => ['/explicit']]))->fontDirs(),
            );
            // …and the opt-out turns the lookup off.
            Configuration::reset();
            self::assertSame([], (new Settings([...$binary, 'env' => false]))->fontDirs());
        } finally {
            putenv('SHOJIKU_FONT_DIR');
        }
    }

    /**
     * @return array<string, array{array<string, mixed>, string}>
     */
    public static function wrongTypes(): array
    {
        return [
            'templates' => [['templates' => 42], 'takes a string'],
            'fontDirs not a list' => [['fontDirs' => 'packs/fonts'], 'takes a list of directories'],
            'fontDirs of non-strings' => [['localeDirs' => [42]], 'takes a list of directories'],
            'env' => [['env' => 'no'], 'takes a boolean'],
            'logger' => [['logger' => 'monolog'], 'takes an object'],
            'providers not a map' => [['providers' => 'default'], 'takes a map of name to provider'],
            'provider not a LocalPem' => [['providers' => ['default' => 'key.pem']], 'must be a LocalPem'],
        ];
    }

    /**
     * @param array<string, mixed> $overrides
     */
    #[\PHPUnit\Framework\Attributes\DataProvider('wrongTypes')]
    public function testAWrongTypeIsProgrammerMisuseRatherThanASilentlyInheritedDefault(
        array $overrides,
        string $expected,
    ): void {
        // Silently inheriting the default would render with a configuration
        // the caller believes they replaced.
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/'.preg_quote($expected, '/').'/');
        (new Configuration())->merge($overrides);
    }
}

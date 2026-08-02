<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Env;

final class EnvTest extends TestCase
{
    use EngineFixtures;

    public function testOneFlagGovernsEveryLookup(): void
    {
        $source = [
            'SHOJIKU_TEMPLATE_ROOT' => '/root',
            'SHOJIKU_FONT_DIR' => '/fonts',
            'SHOJIKU_BIN' => '/bin/shojiku',
        ];

        $on = new Env(enabled: true, source: $source);
        self::assertSame('/root', $on->get('SHOJIKU_TEMPLATE_ROOT'));
        self::assertSame(['/fonts'], $on->paths('SHOJIKU_FONT_DIR'));
        self::assertSame('/bin/shojiku', $on->get('SHOJIKU_BIN'));

        $off = new Env(enabled: false, source: $source);
        self::assertNull($off->get('SHOJIKU_TEMPLATE_ROOT'));
        self::assertSame([], $off->paths('SHOJIKU_FONT_DIR'));
        self::assertNull($off->get('SHOJIKU_BIN'));
    }

    public function testABlankVariableReadsAsUnset(): void
    {
        $env = new Env(enabled: true, source: ['SHOJIKU_LANG' => '']);

        self::assertNull($env->get('SHOJIKU_LANG'));
        self::assertNull($env->get('SHOJIKU_MISSING'));
    }

    public function testSeveralPathsInOneVariableSplitOnThePathSeparator(): void
    {
        $env = new Env(enabled: true, source: [
            'SHOJIKU_LOCALE_DIR' => '/a'.PATH_SEPARATOR.PATH_SEPARATOR.'/b',
        ]);

        self::assertSame(['/a', '/b'], $env->paths('SHOJIKU_LOCALE_DIR'));
    }

    public function testTheProcessEnvironmentIsTheDefaultSource(): void
    {
        putenv('SHOJIKU_TEMPLATE_ROOT=/from-process');

        try {
            self::assertSame('/from-process', (new Env(enabled: true))->get('SHOJIKU_TEMPLATE_ROOT'));
        } finally {
            putenv('SHOJIKU_TEMPLATE_ROOT');
        }
    }

    public function testTheChildInheritsTheEnvironmentWhenLookupsAreOn(): void
    {
        $env = new Env(enabled: true, source: ['PATH' => '/usr/bin', 'SHOJIKU_FONT_DIR' => '/fonts']);

        self::assertSame(['PATH' => '/usr/bin', 'SHOJIKU_FONT_DIR' => '/fonts'], $env->childEnvironment());
    }

    public function testTheChildLosesEverySHOJIKUVariableWhenLookupsAreOff(): void
    {
        // The clause a subprocess SDK owes that the in-process ones do not:
        // the engine is a CHILD PROCESS that reads SHOJIKU_FONT_DIR and
        // SHOJIKU_LOCALE_DIR itself, so a client that stopped reading them and
        // still let the child inherit them would only have moved the lookup
        // one process away.
        $env = new Env(enabled: false, source: [
            'PATH' => '/usr/bin',
            'SHOJIKU_FONT_DIR' => '/fonts',
            'SHOJIKU_TEMPLATE_ROOT' => '/root',
        ]);

        self::assertSame(['PATH' => '/usr/bin'], $env->childEnvironment());
    }

    public function testAHermeticClientDoesNotLetTheEngineReadTheEnvironmentEither(): void
    {
        // The same claim, end to end: a font directory the engine would
        // otherwise find in its own environment does not reach it. The
        // fixture template names `noto-sans`, so a render with no font
        // directory at all fails — which is what proves the variable did not
        // cross.
        putenv('SHOJIKU_FONT_DIR='.$this->fontDirs()[0]);

        try {
            $hermetic = $this->client(['fontDirs' => [], 'localeDirs' => [], 'env' => false]);
            self::assertTrue($hermetic->generate('receipt', [])->failed());

            $inheriting = $this->client(['fontDirs' => [], 'env' => true]);
            self::assertTrue($inheriting->generate('receipt', [])->success());
        } finally {
            putenv('SHOJIKU_FONT_DIR');
        }
    }
}

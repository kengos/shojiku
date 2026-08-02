<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Text;

/**
 * The boundary rule, checked against the source rather than argued for.
 *
 * "Port the layout algorithm to language X" is never an acceptable answer: it
 * guarantees drift between the SDKs, the GUI and the CLI, and it breaks the
 * promise that the same params produce the same bytes everywhere. The same
 * rule applies downward — this package does not re-format numbers or dates,
 * does not measure text, and does not construct PDF objects.
 */
final class BoundaryTest extends TestCase
{
    use EngineFixtures;

    public function testEngineInfoIsPassedThroughUnmodelled(): void
    {
        // An append-only wire this package does not model, exactly as a
        // diagnostic's typed args are: a typed value object would owe a new
        // field in seven languages every time the engine adds one.
        $info = $this->client()->engineInfo();

        self::assertSame(['version', 'capabilities', 'builtinLocales'], array_keys($info));
    }

    public function testNothingInThePackageReimplementsEngineBehaviour(): void
    {
        $offenders = [];
        foreach (self::sources() as $file => $source) {
            // A layout/format/PDF verb in this package would be the boundary
            // being crossed. `Text::bounded` is the one deliberate string
            // operation, and it echoes rather than formats.
            if (preg_match('/\b(number_format|strftime|IntlDateFormatter|imagecreate)\b/', $source) === 1) {
                $offenders[] = $file;
            }
        }

        self::assertSame([], $offenders);
    }

    public function testThePdfIsNeverInspectedOnlyCarried(): void
    {
        $offenders = [];
        foreach (self::sources() as $file => $source) {
            if (str_contains($source, '%PDF')) {
                $offenders[] = $file;
            }
        }

        self::assertSame([], $offenders, 'the package must not interpret document bytes');
    }

    public function testDiagnosticsAreNeverTranslatedOrReclassified(): void
    {
        // A render that warns still succeeded, and a render that failed says
        // why in these — so a diagnostic never becomes an exception.
        $result = $this->client()->generate('warns', []);

        self::assertTrue($result->success());
        self::assertSame(
            'text overflows the box height (25.2pt content vs 24pt available)',
            $result->warnings()[0]->message(),
        );
    }

    public function testTheEchoHelperStripsControlCharactersAndCapsLength(): void
    {
        self::assertSame('receipt', Text::bounded("recei\x00pt"));
        self::assertSame(str_repeat('a', Text::LIMIT), Text::bounded(str_repeat('a', 500)));
        // Capped in CHARACTERS, so a multi-byte name is not cut mid-sequence.
        self::assertSame(str_repeat('あ', Text::LIMIT), Text::bounded(str_repeat('あ', 200)));
        self::assertSame('', Text::bounded(''));
    }

    public function testInvalidUtf8StillLosesItsControlBytes(): void
    {
        // A `/u` pattern reports invalid UTF-8 by returning null rather than
        // by raising, so the fallback is what keeps the control bytes this
        // method exists to remove from being echoed anyway.
        $bounded = Text::bounded("\xB1\x31\x00\x1b");

        self::assertStringNotContainsString("\x00", $bounded);
        self::assertStringNotContainsString("\x1b", $bounded);
    }

    /**
     * @return array<string, string>
     */
    private static function sources(): array
    {
        $sources = [];
        $dir = new \RecursiveDirectoryIterator(dirname(__DIR__).'/src');
        /** @var iterable<string, \SplFileInfo> $files */
        $files = new \RecursiveIteratorIterator($dir);
        foreach ($files as $path => $file) {
            if ($file->isFile() && str_ends_with($path, '.php')) {
                $sources[basename($path)] = (string) file_get_contents($path);
            }
        }
        self::assertGreaterThan(20, count($sources), 'the source sweep matched almost nothing');

        return $sources;
    }
}

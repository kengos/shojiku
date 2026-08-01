<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Diagnostic;

final class DiagnosticTest extends TestCase
{
    use EngineFixtures;

    public function testItReadsTheItemsObjectTheEngineEmits(): void
    {
        // `{"items": [...]}`, not a bare array: that is the shape every host
        // publishes, and it is what the other SDKs already parse.
        $diagnostics = Diagnostic::parse([
            'items' => [[
                'severity' => 'warning',
                'code' => 'text_overflow',
                'category' => 'layout',
                'message' => 'text overflows the box height',
                'path' => 'sections.body.items[0]',
                'args' => ['avail' => 24.0, 'content' => 25.2],
                'origin' => 'layout/src/engine/text/height.rs:48',
            ]],
        ]);

        self::assertCount(1, $diagnostics);
        $diagnostic = $diagnostics[0];
        self::assertSame('warning', $diagnostic->severity());
        self::assertSame('text_overflow', $diagnostic->code());
        self::assertSame('layout', $diagnostic->category());
        self::assertSame('text overflows the box height', $diagnostic->message());
        self::assertSame('sections.body.items[0]', $diagnostic->path());
        self::assertSame(['avail' => 24.0, 'content' => 25.2], $diagnostic->args());
        self::assertSame('layout/src/engine/text/height.rs:48', $diagnostic->origin());
    }

    public function testTheSeverityPredicatesFollowTheNounRule(): void
    {
        [$error, $warning] = Diagnostic::parse([
            'items' => [['severity' => 'error'], ['severity' => 'warning']],
        ]);

        self::assertTrue($error->isError());
        self::assertFalse($error->isWarning());
        self::assertTrue($warning->isWarning());
        self::assertFalse($warning->isError());
    }

    public function testAnythingThatIsNotTheEnvelopeYieldsNoDiagnostics(): void
    {
        self::assertSame([], Diagnostic::parse(null));
        self::assertSame([], Diagnostic::parse('items'));
        self::assertSame([], Diagnostic::parse(['items' => 'not a list']));
        self::assertSame([], Diagnostic::parse([]));
    }

    public function testAnItemThatIsNotAnObjectIsSkippedRatherThanGuessedAt(): void
    {
        $diagnostics = Diagnostic::parse(['items' => ['a string', ['severity' => 'error']]]);

        self::assertCount(1, $diagnostics);
        self::assertTrue($diagnostics[0]->isError());
    }

    public function testMissingFieldsAreAbsentRatherThanEmptyStrings(): void
    {
        $diagnostic = Diagnostic::parse(['items' => [['severity' => 42]]])[0];

        self::assertNull($diagnostic->severity());
        self::assertNull($diagnostic->code());
        self::assertNull($diagnostic->path());
        self::assertSame([], $diagnostic->args());
    }

    public function testItPrintsAsItsPathAndMessage(): void
    {
        $withPath = Diagnostic::parse(['items' => [['path' => 'sections.body', 'message' => 'too small']]])[0];
        $without = Diagnostic::parse(['items' => [['message' => 'too small']]])[0];

        self::assertSame('sections.body: too small', (string) $withPath);
        self::assertSame('too small', (string) $without);
    }

    public function testTheEnginesTypedArgsPassThroughUntranslated(): void
    {
        // `code` and `args` are the engine's frozen contract — a translating
        // consumer renders its own message from them, so this class parses
        // the wire and stops.
        $warning = $this->client()->generate('warns', [])->warnings()[0];

        self::assertSame('text_overflow', $warning->code());
        self::assertSame(['avail' => 24.0, 'content' => 25.2], $warning->args());
    }
}

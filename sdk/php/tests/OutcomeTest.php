<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Exception\UsageException;
use Shojiku\Origin;
use Shojiku\Outcome;
use Shojiku\Report;
use Shojiku\Step;

/**
 * The two failure levels, kept apart.
 *
 * `class: usage` is the CALLER's mistake and throws; everything a DOCUMENT can
 * do wrong comes back as a failed result with the engine's diagnostics
 * attached. An SDK that raised for the second class would have broken the
 * contract, not chosen an idiom.
 *
 * These build the envelope directly for the cases the real engine cannot be
 * asked to produce on demand — every OTHER test in the suite drives the same
 * code through the real binary.
 */
final class OutcomeTest extends TestCase
{
    use EngineFixtures;

    public function testACallerErrorThrowsRatherThanReturningAFailedResult(): void
    {
        $report = Report::parse((string) json_encode([
            'ok' => false,
            'diagnostics' => ['items' => []],
            'failure' => [
                'class' => 'usage',
                'step' => 'sign',
                'kind' => 'passphrase_variable',
                'message' => 'the environment variable `X` is not set',
            ],
        ]));

        self::assertTrue($report->isUsage());
        $this->expectException(UsageException::class);
        $this->expectExceptionMessageMatches('/the engine refused the call.*is not set/');
        Outcome::verdict($report);
    }

    public function testARefusedDocumentIsAFailedResultCarryingItsDiagnostics(): void
    {
        $report = Report::parse((string) json_encode([
            'ok' => false,
            'diagnostics' => ['items' => [['severity' => 'error', 'code' => 'image_source_missing']]],
            'failure' => [
                'class' => 'document',
                'step' => 'render',
                'kind' => 'document',
                'message' => 'validation failed with errors',
            ],
        ]));

        $result = Outcome::document($report, '', Step::Generate, $this->client(), Origin::Rendered);

        self::assertTrue($result->failed());
        self::assertSame(Step::Generate, $result->failure()?->step());
        self::assertSame('document', $result->failure()?->kind());
        self::assertCount(1, $result->errors());
    }

    public function testASuccessWithDiagnosticsIsStillASuccess(): void
    {
        $report = Report::parse((string) json_encode([
            'ok' => true,
            'diagnostics' => ['items' => [['severity' => 'warning', 'code' => 'text_overflow']]],
            'pageCount' => 3,
        ]));

        $result = Outcome::document($report, '%PDF-x', Step::Generate, $this->client(), Origin::Source);

        self::assertTrue($result->success());
        self::assertCount(1, $result->warnings());
        self::assertSame(3, $result->artifact()?->pageCount());
        self::assertSame(Origin::Source, $result->artifact()?->origin());
    }

    public function testAFailureBlockThatIsMalformedReportsUnknownRatherThanGuessing(): void
    {
        $report = Report::parse('{"ok":false,"failure":{"class":"document"}}');

        $result = Outcome::verdict($report);

        self::assertTrue($result->failed());
        self::assertSame('unknown', $result->failure()?->kind());
        self::assertSame('', $result->failure()?->message());
    }

    public function testAFailureBlockThatIsNotAnObjectIsTreatedAsAbsent(): void
    {
        // `ok` already says which way the operation went; inventing a kind an
        // SDK branches on would be worse than reporting none.
        $report = Report::parse('{"ok":true,"failure":"nope"}');

        self::assertFalse($report->isUsage());
        self::assertTrue(Outcome::verdict($report)->success());
    }

    public function testAVerdictWithNoVerificationBlockHasNoReport(): void
    {
        $report = Report::parse('{"ok":false,"failure":{"class":"document","kind":"verify","message":"none"}}');

        $result = Outcome::verdict($report);

        self::assertTrue($result->failed());
        self::assertNull($result->report());
    }

    public function testAPageCountThatIsNotAnIntegerIsAbsentRatherThanCast(): void
    {
        $report = Report::parse('{"ok":true,"pageCount":"three"}');

        self::assertNull($report->pageCount);
    }
}

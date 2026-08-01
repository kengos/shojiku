<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Log;
use Shojiku\Result;
use Shojiku\Step;

/**
 * The host-side log channel.
 *
 * It reports what the BINDING did and never what the document contained.
 * Params, rendered bytes, diagnostics and key material are outside this
 * channel BY RULE — a log line is the easiest way for a secret to leave a
 * process, and a diagnostic belongs to the result the caller already has.
 */
final class LogTest extends TestCase
{
    use EngineFixtures;

    public function testTheChannelIsSilentUntilAnApplicationSuppliesALogger(): void
    {
        $log = new Log();
        $log->event('binary_found', ['path' => '/bin/shojiku']);

        // Nothing to assert but that nothing happened; the point is that a
        // silent log costs a null check rather than string formatting.
        self::expectNotToPerformAssertions();
    }

    public function testItRecordsWhichBinaryRanAndWhichLookupPositionWonIt(): void
    {
        $logger = new RecordingLogger();

        $this->client(['logger' => $logger])->generate('receipt', []);

        self::assertStringContainsString('shojiku binary_found', $logger->joined());
        self::assertStringContainsString('source=configuration', $logger->joined());
        self::assertStringContainsString($this->engineBinary(), $logger->joined());
    }

    public function testItRecordsTheLifecycleStepItsDurationAndItsVerdict(): void
    {
        $logger = new RecordingLogger();

        $this->client(['logger' => $logger])->generate('receipt', []);

        self::assertMatchesRegularExpression('/shojiku generate .*ms=[0-9.]+ ok=true/', $logger->joined());
    }

    public function testAFailedOperationIsRecordedAsSuch(): void
    {
        $logger = new RecordingLogger();

        $this->client(['logger' => $logger])->generate('broken', []);

        self::assertStringContainsString('ok=false', $logger->joined());
    }

    public function testItNeverRecordsParamsDiagnosticsOrKeyMaterial(): void
    {
        $logger = new RecordingLogger();
        $client = $this->client(['logger' => $logger]);

        $client->generate('warns', ['customer' => ['name' => 'SECRET CUSTOMER']]);
        $result = $client->generate('receipt', []);
        $artifact = $result->artifact();
        self::assertNotNull($artifact);
        $artifact->sign($this->signer(key: 'rsa2048.enc.pem', passphrase: $this->passphrase()));

        $written = $logger->joined();
        self::assertStringNotContainsString('SECRET CUSTOMER', $written);
        self::assertStringNotContainsString('text_overflow', $written);
        self::assertStringNotContainsString($this->passphrase(), $written);
        self::assertStringNotContainsString('%PDF', $written);
    }

    public function testWhatDoesCrossIsBoundedFirst(): void
    {
        $logger = new RecordingLogger();

        // A hostile template name reaches the channel as the thing that was
        // asked for; it is stripped and capped exactly as the engine bounds
        // its own echoed values.
        $this->client(['logger' => $logger])->generate(str_repeat('x', 500), []);

        foreach ($logger->lines as $line) {
            self::assertLessThan(200, strlen($line));
        }
    }

    public function testADuckTypedPsr3LoggerIsAcceptedWithoutADependency(): void
    {
        // Every PSR-3 logger exposes `debug()`, so an application passes one
        // unwrapped and this package still depends on nothing.
        $logger = new class () {
            /** @var list<string> */
            public array $lines = [];

            /** @param array<string, mixed> $context */
            public function debug(string $message, array $context = []): void
            {
                $this->lines[] = $message;
            }
        };

        (new Log($logger))->event('probe', ['ok' => true]);

        self::assertSame(['shojiku probe ok=true'], $logger->lines);
    }

    public function testAnObjectWithNoDebugMethodIsSimplyNotALogger(): void
    {
        $log = new Log(new \stdClass());
        $log->event('probe');

        self::expectNotToPerformAssertions();
    }

    public function testTimingReturnsWhatTheOperationReturned(): void
    {
        $expected = Result::succeeded(null, []);

        $actual = (new Log())->timed(Step::Verify, static fn () => $expected);

        self::assertSame($expected, $actual);
    }
}

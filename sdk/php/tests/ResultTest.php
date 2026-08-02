<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Diagnostic;
use Shojiku\Exception\UnwrapException;
use Shojiku\Failure;
use Shojiku\Result;
use Shojiku\Step;

final class ResultTest extends TestCase
{
    use EngineFixtures;

    public function testASuccessCarriesItsValueAndItsDiagnostics(): void
    {
        $result = $this->client()->generate('warns', []);

        self::assertTrue($result->success());
        self::assertFalse($result->failed());
        self::assertNull($result->failure());
        self::assertSame($result->value(), $result->artifact());
        // Diagnostics ride a SUCCESS: a caller that only looks at failures
        // never sees the warning.
        self::assertCount(1, $result->diagnostics());
    }

    public function testTheSeveritySlicesSplitTheSameList(): void
    {
        $diagnostics = self::diagnostics(['warning', 'error', 'warning']);
        $result = Result::succeeded(null, $diagnostics);

        self::assertCount(2, $result->warnings());
        self::assertCount(1, $result->errors());
        self::assertCount(3, $result->diagnostics());
    }

    public function testTheAliasesNameWhatTheOperationProduced(): void
    {
        $rendered = $this->client()->generate('receipt', []);
        $verified = $this->signed()->verify(anchors: $this->keyPath('rsa2048.cert.pem'));

        self::assertNotNull($rendered->artifact());
        self::assertNull($rendered->report());
        self::assertNotNull($verified->report());
        self::assertNull($verified->artifact());
    }

    public function testUnwrappingASuccessReturnsItsValue(): void
    {
        $result = $this->client()->generate('receipt', []);

        self::assertSame($result->artifact(), $result->unwrap());
    }

    public function testUnwrappingAFailedResultIsProgrammerMisuse(): void
    {
        // The one place this API throws for something other than a misused
        // argument: a caller who has not checked success() is asserting the
        // operation worked. The failure travels on the exception.
        $failure = new Failure(Step::Generate, 'document', 'validation failed with errors');
        $result = Result::fromFailure($failure);

        try {
            $result->unwrap();
            self::fail('unwrap did not throw');
        } catch (UnwrapException $e) {
            self::assertSame($failure, $e->failure());
            self::assertSame('generate/document: validation failed with errors', $e->getMessage());
        }
    }

    public function testAFailedResultInheritsTheFailuresDiagnostics(): void
    {
        $failure = new Failure(Step::Generate, 'document', 'refused', self::diagnostics(['error']));

        self::assertCount(1, Result::fromFailure($failure)->errors());
    }

    /**
     * @param list<string> $severities
     *
     * @return list<Diagnostic>
     */
    private static function diagnostics(array $severities): array
    {
        return Diagnostic::parse([
            'items' => array_map(
                static fn (string $severity) => ['severity' => $severity, 'code' => 'probe'],
                $severities,
            ),
        ]);
    }
}

<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Failure;
use Shojiku\Step;

final class FailureTest extends TestCase
{
    use EngineFixtures;

    public function testTheStepIsAlwaysThisPackagesOwnLifecycleStep(): void
    {
        // The engine's report names an INTERNAL stage in its own `step` field
        // — `render` for a refused document — and reading it here would make
        // the trace's step mean different things depending on which layer
        // refused.
        $failure = $this->client()->generate('broken', [])->failure();

        self::assertNotNull($failure);
        self::assertSame(Step::Generate, $failure->step());
        // What the engine said specifically is the kind.
        self::assertSame('document', $failure->kind());
    }

    public function testACauseChainFlattensOutermostFirst(): void
    {
        $inner = new Failure(Step::Sign, 'io', 'no such file');
        $outer = new Failure(Step::Sign, 'key', 'the key could not be loaded', [], $inner);

        self::assertSame([$outer, $inner], $outer->causes());
        self::assertSame($inner, $outer->cause());
        self::assertSame([$inner], $inner->causes());
    }

    public function testARejectedTemplateNameCarriesTheUnderlyingDetailAsItsCause(): void
    {
        $this->inTempDir(function (string $root): void {
            mkdir($root.'/empty');
            mkdir($root.'/empty/templates.yml');

            $failure = $this->client(['templates' => $root])->generate('empty', [])->failure();

            self::assertNotNull($failure);
            self::assertCount(2, $failure->causes());
            self::assertSame('io', $failure->causes()[1]->kind());
        });
    }

    public function testAFailurePrintsAsStepKindAndMessage(): void
    {
        $failure = new Failure(Step::Verify, 'signature', 'verification failed');

        self::assertSame('verify/signature: verification failed', (string) $failure);
        self::assertSame('verification failed', $failure->message());
        self::assertSame([], $failure->diagnostics());
    }
}

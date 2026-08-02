<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use PHPUnit\Framework\TestCase;
use Shojiku\Engine;
use Shojiku\Exception\EngineFailureException;
use Shojiku\Exception\IncompatibleEngineException;
use Shojiku\Report;

/**
 * The transport's own failure modes.
 *
 * The contract has two failure levels — caller error, and something a
 * document did — and both arrive in the report. None of these is either: the
 * process died, wrote nothing, or wrote something that is not the envelope.
 * Manufacturing a document failure out of that would tell the caller
 * something about their document that nobody determined.
 */
final class SubprocessTest extends TestCase
{
    use EngineFixtures;
    use StubBinary;

    public function testANonZeroExitWithNoReportIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, 'echo "something went very wrong" >&2'."\n".'exit 3');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/wrote no report.*something went very wrong/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testAReportThatIsNotJsonIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, 'printf "not json at all" > "$report"');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/is not JSON/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testJsonThatIsNotTheEnvelopeIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            // Valid JSON, wrong shape: `ok` is what every branch downstream
            // reads, so a payload without it is not a report.
            $stub = $this->stubBinary($dir, 'printf \'{"ok":"yes"}\' > "$report"');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/not a report envelope/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testAReportPastTheReadCapIsRefusedRatherThanLoaded(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, sprintf(
                'head -c %d /dev/zero | tr "\\0" "x" > "$report"',
                Report::MAX_BYTES + 1,
            ));

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/past this package/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testABinaryThatWritesNothingAtAllIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, 'exit 0');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/wrote no report$/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testAnEngineWithoutTheReportCapabilityIsRefusedByName(): void
    {
        $this->inTempDir(function (string $dir): void {
            $old = '{"version":"0.0.1","capabilities":["render.pdf"],"builtinLocales":["en-US"]}';
            $stub = $this->stubBinary($dir, 'exit 0', $old);

            $this->expectException(IncompatibleEngineException::class);
            $this->expectExceptionMessageMatches('/does not advertise `cli.report`/');
            $this->client(['binary' => $stub])->generate('receipt', []);
        });
    }

    public function testACapabilityPayloadThatIsNotJsonIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, 'exit 0', 'not json');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/capability payload is not JSON/');
            $this->client(['binary' => $stub])->engineInfo();
        });
    }

    public function testACapabilityPayloadThatIsNotAnObjectIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $stub = $this->stubBinary($dir, 'exit 0', '"just a string"');

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/capability payload is not an object/');
            $this->client(['binary' => $stub])->engineInfo();
        });
    }

    public function testAFailingCapabilitiesCallIsAHostFailure(): void
    {
        $this->inTempDir(function (string $dir): void {
            $path = $dir.'/broken';
            file_put_contents($path, "#!/bin/sh\necho 'no such subcommand' >&2\nexit 2\n");
            chmod($path, 0o755);

            $this->expectException(EngineFailureException::class);
            $this->expectExceptionMessageMatches('/exited 2.*no such subcommand/');
            $this->client(['binary' => $path])->engineInfo();
        });
    }

    public function testStderrOnASuccessfulRunIsIgnoredRatherThanParsed(): void
    {
        // The engine prints its diagnostics to stderr as prose as well as
        // into the report. Prose is not a contract, so nothing here reads it:
        // a run whose stderr is noise still succeeds, and the diagnostics the
        // caller gets are the report's.
        $result = $this->client()->generate('warns', []);

        self::assertTrue($result->success());
        self::assertCount(1, $result->warnings());
    }

    public function testAnArgumentCarryingShellMetacharactersIsPassedThroughLiterally(): void
    {
        // `proc_open` gets an ARRAY, so no shell is involved and there is
        // nothing to quote for. A name that would be a command substitution
        // in a shell is refused as a template NAME — by the name rules, not
        // by anything having executed it.
        $marker = sys_get_temp_dir().'/shojiku-php-injection-'.bin2hex(random_bytes(6));
        $result = $this->client()->generate('$(touch '.$marker.')', []);

        self::assertTrue($result->failed());
        self::assertFileDoesNotExist($marker);
    }

    public function testAnEngineInfoCallCrossesTheSameWayAsALifecycleCall(): void
    {
        $info = $this->client()->engineInfo();

        self::assertArrayHasKey('version', $info);
    }

    public function testAProcessThatCannotBeStartedAtAllIsAHostFailure(): void
    {
        // {@see Binary} has already proved the path is an executable file, so
        // a running system cannot produce this — which is exactly why the
        // guard is exercised directly rather than left unproven.
        $this->expectException(EngineFailureException::class);
        $this->expectExceptionMessageMatches('/could not run `\/bin\/nothing`/');
        Engine::started(false, '/bin/nothing');
    }

    public function testAStartedProcessIsHandedBackUntouched(): void
    {
        $handle = fopen('php://memory', 'r+');
        self::assertNotFalse($handle);

        self::assertSame($handle, Engine::started($handle, '/bin/shojiku'));
        fclose($handle);
    }

    public function testTheCapabilityProbeRunsOncePerEngine(): void
    {
        // The check a linked SDK spends on an ABI revision costs a whole
        // process here, so it is asked once and remembered — two renders
        // through one client is one probe.
        $this->inTempDir(function (string $dir): void {
            $counter = $dir.'/probes';
            $stub = $this->stubBinary($dir, 'printf \'{"ok":true,"diagnostics":{"items":[]}}\' > "$report"');
            $script = (string) file_get_contents($stub);
            $script = str_replace(
                'if [ "$1" = "capabilities" ]; then',
                'if [ "$1" = "capabilities" ]; then'."\n"
                    .'    echo probe >> '.escapeshellarg($counter),
                $script,
            );
            file_put_contents($stub, $script);

            $client = $this->client(['binary' => $stub]);
            $client->generate('receipt', []);
            $client->generate('receipt', []);

            self::assertSame(1, count(file($counter) ?: []));
        });
    }
}

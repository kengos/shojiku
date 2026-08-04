<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\EngineFailureException;
use Shojiku\Exception\IncompatibleEngineException;

/**
 * The ONE place a call crosses out of PHP.
 *
 * Everything about the subprocess transport that could be got wrong lives
 * here, so it can be read as one piece:
 *
 * * the command is an ARRAY, so `proc_open` execs the binary directly and no
 *   shell is involved — there is no quoting or injection story to get right
 *   because there is nothing to quote for;
 * * stdout and stderr are drained TOGETHER, by POLLING both in non-blocking
 *   mode; reading one to completion first deadlocks the moment the other
 *   fills its pipe, which for a document of any size is immediately, and
 *   `stream_select` does not work on `proc_open` pipes on Windows at all
 *   (see {@see self::drain()});
 * * stdout is binary (it carries the PDF) and stderr is prose that is never
 *   parsed — only quoted, bounded, when there is no report to explain a
 *   failure;
 * * the child's environment is the one {@see Env} composed, which is how
 *   `env: false` reaches a process that would otherwise read `SHOJIKU_*`
 *   itself.
 *
 * There is deliberately no wall-clock timeout. How long a render may take is
 * a property of the document, not of the transport, and none of the six other
 * SDKs offers a cap — one here would be a contract surface this stage is not
 * entitled to invent.
 */
final class Engine
{
    /** The capability key the subprocess contract needs to exist at all. */
    public const REPORT_CAPABILITY = 'cli.report';

    /** The key the two-step signing verbs advertise. */
    public const EXTERNAL_CAPABILITY = 'cli.sign.external';

    /**
     * Which capabilities have been asked for, and answered.
     *
     * @var array<string, bool>
     */
    private array $supported = [];

    public function __construct(
        private readonly Binary $binary,
        private readonly Env $env,
        private readonly Log $log,
    ) {
        $this->log->event('binary_found', ['path' => $binary->path, 'source' => $binary->source]);
    }

    /**
     * What this build of the engine can do — its version, capability keys and
     * builtin locales, exactly as the engine emitted them.
     *
     * @return array<string, mixed>
     *
     * @throws EngineFailureException when the binary does not answer with the payload
     */
    public function engineInfo(): array
    {
        [$status, $stdout, $stderr] = $this->spawn(['capabilities'], []);
        if ($status !== 0) {
            throw new EngineFailureException(sprintf(
                '`%s capabilities` exited %d (it said: %s)',
                Text::bounded($this->binary->path),
                $status,
                Text::bounded(trim($stderr)),
            ));
        }

        try {
            $payload = json_decode($stdout, true, Report::MAX_DEPTH, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new EngineFailureException('the engine\'s capability payload is not JSON: '.$e->getMessage());
        }
        if (!is_array($payload)) {
            throw new EngineFailureException('the engine\'s capability payload is not an object');
        }

        /** @var array<string, mixed> $payload */
        return $payload;
    }

    /**
     * Refuses a binary that cannot serve the contract.
     *
     * The FFI SDKs ask for an ABI revision before their first call; this is
     * the same check in the shape a subprocess has. An engine without
     * `cli.report` leaves prose on stderr as the only output, and saying so
     * by name is better than parsing it.
     *
     * @throws IncompatibleEngineException
     */
    public function requireReport(): void
    {
        $this->require(self::REPORT_CAPABILITY, 'report what an operation did');
    }

    /**
     * Refuses a binary without the two-step signing verbs, which is what an
     * {@see ExternalSigner} drives.
     *
     * @throws IncompatibleEngineException
     */
    public function requireExternal(): void
    {
        $this->require(self::EXTERNAL_CAPABILITY, 'sign with a key it never sees');
    }

    /**
     * Refuses a binary that does not advertise `$key`.
     *
     * Each key is asked for once per binary. `$what` completes the sentence
     * "so it cannot …", because an operator reading the refusal needs to know
     * which capability is missing AND what it was going to be used for.
     *
     * @throws IncompatibleEngineException
     */
    private function require(string $key, string $what): void
    {
        if (($this->supported[$key] ?? false) === true) {
            return;
        }
        $info = $this->engineInfo();
        $keys = isset($info['capabilities']) && is_array($info['capabilities']) ? $info['capabilities'] : [];
        $this->supported[$key] = in_array($key, $keys, true);
        $this->log->event('engine_checked', [
            'version' => is_string($info['version'] ?? null) ? $info['version'] : null,
            'capability' => $key,
            'supported' => $this->supported[$key] ? 'true' : 'false',
        ]);
        if ($this->supported[$key]) {
            return;
        }

        throw new IncompatibleEngineException(sprintf(
            '`%s` does not advertise `%s`, so it cannot %s. '
            .'Install an engine from this release or newer.',
            Text::bounded($this->binary->path),
            $key,
            $what,
        ));
    }

    /**
     * Runs one lifecycle command and reads its report.
     *
     * @param list<string> $argv the command and its flags, without `--report`
     * @param array<string, string> $extraEnv variables only this call needs
     *
     * @return array{Report, string} the report, and whatever came back on stdout
     *
     * @throws EngineFailureException when there is no readable report
     * @throws IncompatibleEngineException when the binary predates `--report`
     */
    public function execute(array $argv, Workspace $workspace, array $extraEnv = []): array
    {
        $this->requireReport();
        $reportPath = $workspace->reserveReport();
        [, $stdout, $stderr] = $this->spawn([...$argv, '--report', $reportPath], $extraEnv);

        return [Report::read($reportPath, $stderr), $stdout];
    }

    /**
     * @param list<string> $argv
     * @param array<string, string> $extraEnv
     *
     * @return array{int, string, string} exit status, stdout, stderr
     *
     * @throws EngineFailureException when the process cannot be started
     */
    private function spawn(array $argv, array $extraEnv): array
    {
        $descriptors = [['pipe', 'r'], ['pipe', 'w'], ['pipe', 'w']];
        $pipes = [];
        $process = self::started(@proc_open(
            [$this->binary->path, ...$argv],
            $descriptors,
            $pipes,
            null,
            [...$this->env->childEnvironment(), ...$extraEnv],
        ), $this->binary->path);
        // Nothing is sent on stdin: every input the engine takes is a path,
        // and closing it means a child that ever asked for one (the
        // passphrase prompt) reads EOF instead of blocking forever.
        fclose($pipes[0]);

        [$stdout, $stderr] = self::drain($pipes[1], $pipes[2]);

        return [proc_close($process), $stdout, $stderr];
    }

    /**
     * The started process, or the refusal.
     *
     * Split out of {@see self::spawn()} and public for one reason: a running
     * system cannot produce this failure on demand — {@see Binary} has
     * already proved the path is an executable file — and a guard nobody can
     * exercise is a guard nobody knows works. Transport plumbing, not
     * lifecycle surface.
     *
     * @param resource|false $process
     *
     * @return resource
     *
     * @throws EngineFailureException
     */
    public static function started(mixed $process, string $path)
    {
        if ($process === false) {
            throw new EngineFailureException(sprintf('could not run `%s`', Text::bounded($path)));
        }

        return $process;
    }

    /**
     * Reads both pipes until both are closed.
     *
     * BOTH, in turn, with the pipes in non-blocking mode — reading one to
     * completion first deadlocks the moment the other fills its own buffer,
     * which for a document of any size is immediately.
     *
     * Deliberately a poll rather than `stream_select`: select does not work
     * on the pipes `proc_open` creates on Windows, which is a first-class
     * target for this family, and a wait that silently reads nothing there
     * would be worse than a millisecond of sleep everywhere.
     *
     * Private, unlike {@see self::started()}: every lifecycle call in the
     * suite drives this — including the idle wait, since a render takes
     * longer than one poll.
     *
     * @param resource $out
     * @param resource $err
     *
     * @return array{string, string}
     */
    private static function drain($out, $err): array
    {
        stream_set_blocking($out, false);
        stream_set_blocking($err, false);
        $buffers = ['out' => '', 'err' => ''];
        $open = ['out' => $out, 'err' => $err];

        while ($open !== []) {
            $read = false;
            foreach ($open as $name => $pipe) {
                $chunk = fread($pipe, 65536);
                if ($chunk !== false && $chunk !== '') {
                    $buffers[$name] .= $chunk;
                    $read = true;

                    continue;
                }
                if (feof($pipe)) {
                    fclose($pipe);
                    unset($open[$name]);
                }
            }
            if (!$read && $open !== []) {
                // Nothing was ready. Yielding beats spinning; the engine is
                // doing the work this process is waiting for.
                usleep(1000);
            }
        }

        return [$buffers['out'], $buffers['err']];
    }
}

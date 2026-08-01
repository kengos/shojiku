<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * Turning one engine {@see Report} into the {@see Result} an application sees.
 *
 * The two levels of failure meet here, and keeping them apart is the whole
 * job: `class: usage` is the CALLER's mistake and throws, while everything a
 * DOCUMENT can do wrong comes back as a failed result with the engine's
 * diagnostics attached. The capi carries that split in a status code out of
 * band; the CLI carries it in the report, because its out-of-band channel —
 * the exit code — already carries the verdict. Same information, each host's
 * own channel.
 */
final class Outcome
{
    /**
     * A `usage` failure is the engine saying the CALLER got it wrong — an
     * unwritable output path, a page past the end, a named environment
     * variable that is not set. That is programmer misuse in PHP terms, so it
     * throws.
     *
     * @throws UsageException
     */
    public static function guard(Report $report): void
    {
        if (!$report->isUsage()) {
            return;
        }

        throw new UsageException(sprintf(
            'the engine refused the call: %s',
            Text::bounded((string) ($report->failure['message'] ?? '')),
        ));
    }

    /**
     * A rendered or signed document. Diagnostics are attached either way: a
     * render that WORKED can still have warned.
     */
    public static function document(
        Report $report,
        string $bytes,
        Step $step,
        Client $client,
        Origin $origin,
    ): Result {
        self::guard($report);
        if (!$report->ok) {
            return Result::fromFailure(self::failure($report, $step));
        }

        return Result::succeeded(
            new DocumentArtifact(
                bytes: $bytes,
                diagnostics: $report->diagnostics,
                client: $client,
                pageCount: $report->pageCount,
                origin: $origin,
            ),
            $report->diagnostics,
        );
    }

    /**
     * A verification verdict.
     *
     * The report is parsed BEFORE the verdict is read, because it rides a
     * FAILED verify too — that is the whole point of carrying `notChecked`. A
     * document that could not be evaluated at all (no signature, an
     * unreadable container) has NO report, which is a different fact from an
     * empty one, so the field is absent rather than defaulted.
     */
    public static function verdict(Report $report): Result
    {
        self::guard($report);
        $verification = $report->verification === null
            ? null
            : VerificationReport::parse($report->verification);
        if ($report->ok) {
            return Result::succeeded($verification, $report->diagnostics);
        }

        return Result::refused($verification, $report->diagnostics, self::failure($report, Step::Verify));
    }

    /**
     * The trace, with this package's own step. The engine's `step` names an
     * internal stage and is deliberately not read.
     */
    private static function failure(Report $report, Step $step): Failure
    {
        return new Failure(
            step: $step,
            kind: $report->failure['kind'] ?? 'unknown',
            message: $report->failure['message'] ?? '',
            diagnostics: $report->diagnostics,
        );
    }
}

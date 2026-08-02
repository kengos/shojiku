<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UnwrapException;

/**
 * What every lifecycle operation returns.
 *
 * Nothing in the normal flow throws. A template that will not render, a key
 * that will not sign, a signature that does not verify are all data you query
 * — `success()`, the value, the engine's diagnostics either way, and on
 * failure the {@see Failure} trace.
 *
 * Diagnostics ride on a SUCCESS too. A render that worked can still have
 * warned about an overflowing box, and a caller that only looks at failures
 * never sees them.
 */
final class Result
{
    /**
     * @param list<Diagnostic> $diagnostics
     */
    private function __construct(
        private readonly DocumentArtifact|VerificationReport|null $value,
        private readonly array $diagnostics,
        private readonly ?Failure $failure,
    ) {
    }

    /**
     * @param list<Diagnostic> $diagnostics
     */
    public static function succeeded(
        DocumentArtifact|VerificationReport|null $value,
        array $diagnostics,
    ): self {
        return new self($value, $diagnostics, null);
    }

    /**
     * `fromFailure` rather than the reference's `failed`, because a static
     * constructor and an instance predicate share one namespace in PHP and
     * the PREDICATE is the one that carries the contract's name. Python
     * settled the same collision the same way, and this mirrors its spelling
     * rather than inventing a third.
     */
    public static function fromFailure(Failure $failure): self
    {
        return new self(null, $failure->diagnostics(), $failure);
    }

    /**
     * A verdict that FAILED but still carries its report — the whole reason
     * `notChecked` exists. Nothing else produces a failed result with a
     * value.
     *
     * @param list<Diagnostic> $diagnostics
     */
    public static function refused(
        ?VerificationReport $report,
        array $diagnostics,
        Failure $failure,
    ): self {
        return new self($report, $diagnostics, $failure);
    }

    public function success(): bool
    {
        return $this->failure === null;
    }

    public function failed(): bool
    {
        return $this->failure !== null;
    }

    public function value(): DocumentArtifact|VerificationReport|null
    {
        return $this->value;
    }

    /**
     * The value under the name of what the operation produced. The same
     * object; the aliases exist so calling code reads as what it is doing,
     * and neither throws — {@see self::unwrap()} is the one that does.
     */
    public function artifact(): ?DocumentArtifact
    {
        return $this->value instanceof DocumentArtifact ? $this->value : null;
    }

    public function report(): ?VerificationReport
    {
        return $this->value instanceof VerificationReport ? $this->value : null;
    }

    /**
     * The value, or a thrown {@see UnwrapException} when the operation failed.
     *
     * The opt-in bridge for a script that wants a stack trace rather than a
     * branch, and the ONE place this API throws for something other than a
     * misused argument. The ruling is frozen for every Shojiku SDK: calling
     * unwrap on a failed result is programmer misuse — a caller who has not
     * checked `success()` is asserting the operation worked. Application code
     * that handles failure keeps using `success()` and `failure()`; nothing
     * in this package calls this.
     *
     * @throws UnwrapException
     */
    public function unwrap(): DocumentArtifact|VerificationReport|null
    {
        if ($this->failure !== null) {
            throw new UnwrapException($this->failure);
        }

        return $this->value;
    }

    public function failure(): ?Failure
    {
        return $this->failure;
    }

    /**
     * @return list<Diagnostic>
     */
    public function diagnostics(): array
    {
        return $this->diagnostics;
    }

    /**
     * Only the diagnostics that are errors — the ones that explain a refusal.
     *
     * @return list<Diagnostic>
     */
    public function errors(): array
    {
        return array_values(array_filter($this->diagnostics, static fn (Diagnostic $d) => $d->isError()));
    }

    /**
     * Only the warnings, which a SUCCESSFUL result can carry.
     *
     * @return list<Diagnostic>
     */
    public function warnings(): array
    {
        return array_values(array_filter($this->diagnostics, static fn (Diagnostic $d) => $d->isWarning()));
    }
}

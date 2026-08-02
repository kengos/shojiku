<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * Why a lifecycle operation did not produce what was asked for.
 *
 * A VALUE, not an exception. The shape takes effect-ts's `Cause` as its
 * conceptual reference: which step failed, what class of thing went wrong,
 * and — when one failure happened because of another — the chain underneath
 * it, all inspectable rather than unwound. No effect framework is involved;
 * only the idea that a failure is data.
 */
final class Failure
{
    /**
     * @param list<Diagnostic> $diagnostics
     */
    public function __construct(
        private readonly Step $step,
        private readonly string $kind,
        private readonly string $message,
        private readonly array $diagnostics = [],
        private readonly ?self $cause = null,
    ) {
    }

    /**
     * The lifecycle step, which is always this package's own.
     *
     * The engine's report names an INTERNAL stage in its own `step` field
     * (`render`, `validate`); reading it here would make this field mean
     * different things depending on which layer refused. What the engine said
     * specifically is {@see self::kind()}.
     */
    public function step(): Step
    {
        return $this->step;
    }

    /**
     * A stable machine-readable class. Engine-side kinds come straight off
     * the report; host-side ones are this package's own (`template_name`,
     * `key_unreadable`, …).
     */
    public function kind(): string
    {
        return $this->kind;
    }

    public function message(): string
    {
        return $this->message;
    }

    /**
     * @return list<Diagnostic>
     */
    public function diagnostics(): array
    {
        return $this->diagnostics;
    }

    public function cause(): ?self
    {
        return $this->cause;
    }

    /**
     * This failure and everything under it, outermost first. What you log
     * when you want the whole story rather than only its headline.
     *
     * @return list<self>
     */
    public function causes(): array
    {
        $chain = [$this];
        $cause = $this->cause;
        while ($cause !== null) {
            $chain[] = $cause;
            $cause = $cause->cause;
        }

        return $chain;
    }

    public function __toString(): string
    {
        return sprintf('%s/%s: %s', $this->step->value, $this->kind, $this->message);
    }
}

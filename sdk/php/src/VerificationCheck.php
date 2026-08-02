<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * The outcome of one verification check: passed, or failed with the reason.
 *
 * Its own file because PSR-4 gives every class one; the reference gem nests
 * this inside the report class, and nothing but the file layout differs.
 */
final class VerificationCheck
{
    public function __construct(
        private readonly ?string $status,
        private readonly ?string $reason,
    ) {
    }

    /**
     * @param mixed $item the decoded check object
     */
    public static function parse(mixed $item): self
    {
        if (!is_array($item)) {
            return new self(null, null);
        }
        $status = isset($item['status']) && is_string($item['status']) ? $item['status'] : null;
        $reason = isset($item['reason']) && is_string($item['reason']) ? $item['reason'] : null;

        return new self($status, $reason);
    }

    public function status(): ?string
    {
        return $this->status;
    }

    public function reason(): ?string
    {
        return $this->reason;
    }

    public function passed(): bool
    {
        return $this->status === 'passed';
    }

    public function __toString(): string
    {
        if ($this->reason !== null) {
            return sprintf('%s: %s', (string) $this->status, $this->reason);
        }

        return (string) $this->status;
    }
}

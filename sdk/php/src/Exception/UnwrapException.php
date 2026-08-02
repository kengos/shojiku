<?php

declare(strict_types=1);

namespace Shojiku\Exception;

use Shojiku\Failure;

/**
 * Unwrapping a {@see \Shojiku\Result} that failed.
 *
 * `unwrap()` is the opt-in bridge to exception-style control flow. Calling it
 * on a failed result is programmer misuse — the ruling is explicit and frozen
 * for every Shojiku SDK, because an accessor that throws is the one place
 * this API could drift back into exceptions by accident. The failure travels
 * on the exception, so nothing is lost by taking the short road.
 */
final class UnwrapException extends \LogicException implements ShojikuException
{
    public function __construct(private readonly Failure $failure)
    {
        parent::__construct((string) $failure);
    }

    public function failure(): Failure
    {
        return $this->failure;
    }
}

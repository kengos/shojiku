<?php

declare(strict_types=1);

namespace Shojiku\Tests;

use Shojiku\Logger;

/**
 * A logger that keeps what it was told, so a test can assert on the channel's
 * CONTENT rather than only on the fact that something was written.
 */
final class RecordingLogger implements Logger
{
    /** @var list<string> */
    public array $lines = [];

    public function debug(string $message): void
    {
        $this->lines[] = $message;
    }

    public function joined(): string
    {
        return implode("\n", $this->lines);
    }
}

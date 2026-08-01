<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\ShojikuException;

/**
 * A refused template name, or a template that could not be read.
 *
 * Internal: {@see Client::generate()} catches it and returns a failed
 * {@see Result}, because a hostile template name is a fact about the request
 * rather than a bug in the calling program. It carries the machine-readable
 * `kind` the failure trace reports, and the underlying detail as the trace's
 * cause when there is one.
 */
final class TemplateRejected extends \RuntimeException implements ShojikuException
{
    public function __construct(
        private readonly string $kind,
        string $message,
        private readonly ?string $causeMessage = null,
    ) {
        parent::__construct($message);
    }

    public function kind(): string
    {
        return $this->kind;
    }

    public function causeMessage(): ?string
    {
        return $this->causeMessage;
    }
}

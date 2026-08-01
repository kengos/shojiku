<?php

declare(strict_types=1);

namespace Shojiku\Exception;

/**
 * The transport got no answer at all.
 *
 * The contract has two failure levels — caller error, and something a
 * document did — and both arrive in the `--report` sidecar. This is neither:
 * the process died, wrote no report, wrote something that is not the
 * envelope, or is not the binary we think it is. Manufacturing a document
 * failure out of that would tell the caller something about their document
 * that nobody actually determined, and a failed result is something a
 * `success()` check can swallow.
 *
 * The in-process SDKs have no counterpart because a linked library cannot
 * fail this way; it is the price of a subprocess, and it is named rather than
 * hidden.
 */
final class EngineFailureException extends \RuntimeException implements ShojikuException
{
}

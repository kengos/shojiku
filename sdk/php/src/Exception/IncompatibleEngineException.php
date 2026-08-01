<?php

declare(strict_types=1);

namespace Shojiku\Exception;

/**
 * The binary runs, but cannot serve this package's contract.
 *
 * The FFI SDKs ask the library for its ABI revision; a subprocess SDK asks
 * the binary for its capability list, and the key that matters is
 * `cli.report`. Without it there is no machine-readable result at all — only
 * prose on stderr, which carries no diagnostic `code`, no typed `args`, no
 * page count, and no way to tell caller error from a refused document. An
 * older binary is therefore refused by NAME rather than worked around by
 * parsing prose.
 */
final class IncompatibleEngineException extends \RuntimeException implements ShojikuException
{
}

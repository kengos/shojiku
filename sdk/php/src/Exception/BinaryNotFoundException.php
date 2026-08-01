<?php

declare(strict_types=1);

namespace Shojiku\Exception;

/**
 * The `shojiku` binary could not be found, or is not executable.
 *
 * The message names the install channels, because the fix is always an
 * installation step and a bare "command not found" names none of them.
 * Nothing in this package downloads the binary: an SDK that fetches an
 * executable is a supply-chain surface this product does not take on.
 *
 * This is the subprocess transport's counterpart to the FFI SDKs' "the engine
 * library was not found" — same position in the contract, different artifact.
 */
final class BinaryNotFoundException extends \RuntimeException implements ShojikuException
{
}

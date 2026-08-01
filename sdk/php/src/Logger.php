<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * The log channel's interface: one method, so this package has no logging
 * dependency.
 *
 * A PSR-3 logger does NOT have to implement this — {@see Log} also accepts
 * any object exposing `debug(string)`, which every PSR-3 implementation does.
 * The interface exists for applications that have no logger of their own and
 * want a typed one to implement, exactly as the JVM SDK's does.
 */
interface Logger
{
    public function debug(string $message): void;
}

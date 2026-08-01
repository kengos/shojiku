<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * This package's version.
 *
 * Tracks the engine workspace version. All seven SDKs move together while
 * everything is pre-1.0 and publish together at the first public release —
 * `composer.json` carries no `version` field, because a registry derives that
 * from the release tag, so this constant is where an application reads it.
 * A test pins it against `engine/Cargo.toml`, which is what makes "in
 * lockstep" a checked claim rather than an intention.
 */
final class Version
{
    public const VERSION = '0.1.0';
}

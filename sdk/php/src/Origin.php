<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * Where a document came from, which is what a strict client signs on.
 *
 * Only {@see self::Rendered} is signable under a lockdown: in the other two
 * the provenance of what gets signed is the application's rather than the
 * deployment's, which is the distinction strict exists to draw. Signing
 * INHERITS the origin of what it signed — appending a revision does not
 * launder where a document came from. Verification is never restricted.
 *
 * A boolean "was it loaded" would not be enough: an artifact from another
 * client's bytes-first render has engine-laid-out bytes and a caller's
 * template, which is a third thing.
 */
enum Origin: string
{
    /** Laid out from a template the configured root resolved. */
    case Rendered = 'rendered';
    /** Laid out from template bytes the application supplied. */
    case Source = 'source';
    /** Bytes the application supplied whole. */
    case Loaded = 'loaded';
}

<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * The lifecycle step a {@see Failure} belongs to.
 *
 * Always one of these three — the SDK's OWN vocabulary. The engine's report
 * carries a step of its own naming an INTERNAL stage (`render`, `validate`),
 * and passing that through would make the trace's step mean different things
 * depending on which layer refused. What the engine said specifically is the
 * failure's `kind`.
 */
enum Step: string
{
    case Generate = 'generate';
    case Sign = 'sign';
    case Verify = 'verify';
}

<?php

declare(strict_types=1);

namespace Shojiku\Exception;

/**
 * The caller passed something this API cannot accept.
 *
 * A template name that is not a string, both forms of the same material at
 * once, an unknown client setting, or an entrance this client's lockdown
 * disables. Programmer misuse, so it throws — and it extends
 * `\LogicException`, which is exactly what PHP reserves that base for.
 *
 * A BLANK template name is deliberately not in that list: an empty string can
 * arrive straight from a form field, so it comes back as a refused request
 * like every other bad name.
 */
final class UsageException extends \LogicException implements ShojikuException
{
}

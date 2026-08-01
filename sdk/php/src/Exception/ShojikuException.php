<?php

declare(strict_types=1);

namespace Shojiku\Exception;

/**
 * The marker every exception this package throws implements.
 *
 * An INTERFACE rather than a base class, because PHP already has the right
 * bases and they carry meaning: `\LogicException` is what the language
 * reserves for a mistake in the calling program, `\RuntimeException` for a
 * condition only the environment can produce. Inheriting from one shared
 * base would throw that distinction away, so each exception here extends the
 * SPL class its meaning belongs to and implements this instead — a caller
 * that wants "anything Shojiku threw" catches this, and a caller that wants
 * "a bug in my own code" catches `\LogicException`.
 *
 * Throwing is deliberately rare. A template that will not render, a key that
 * will not sign, a signature that does not verify are OUTCOMES — they come
 * back as {@see \Shojiku\Result} objects you query, never as exceptions you
 * catch.
 */
interface ShojikuException extends \Throwable
{
}

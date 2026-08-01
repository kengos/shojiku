<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * Echoing caller-supplied text back in a message or a log line.
 *
 * Template names and provider names reach exception reporters and log files,
 * so they are stripped of control characters and bounded before they are
 * quoted — the same discipline the engine applies to the values it echoes,
 * and the same cap the CLI's report applies to its own messages. One place
 * for it, because every path that echoes owes the same thing.
 *
 * (The reference gem calls this `Echo`. `echo` is a reserved word in PHP, so
 * the class is renamed and the method keeps the name that says what it does.)
 */
final class Text
{
    public const LIMIT = 80;

    /**
     * The text with control characters removed and the length capped.
     *
     * Capped in CHARACTERS, not bytes: cutting UTF-8 at a byte offset can
     * split a multi-byte sequence, and a broken sequence in a log file is a
     * different problem from a long line. The cut goes through PCRE's `/u`
     * mode rather than `mb_substr` deliberately — `preg_*` is always
     * available, while mbstring is an extension this package would otherwise
     * have to require for one line.
     */
    public static function bounded(string $text): string
    {
        $stripped = preg_replace('/[\x00-\x1f\x7f]/u', '', $text);
        if ($stripped === null) {
            // Not valid UTF-8, which `/u` reports by returning null. Strip
            // byte-wise and cut at a byte offset: there is no character
            // sequence left to preserve, and the alternative is echoing the
            // control bytes this method exists to remove.
            $bytes = (string) preg_replace('/[\x00-\x1f\x7f]/', '', $text);

            return substr($bytes, 0, self::LIMIT);
        }

        $chars = preg_split('//u', $stripped, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return implode('', array_slice($chars, 0, self::LIMIT));
    }
}

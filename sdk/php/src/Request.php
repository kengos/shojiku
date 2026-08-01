<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * The one place a call's arguments are assembled.
 *
 * The reference gem builds a JSON envelope here because its transport takes
 * one; this transport takes an argument VECTOR, so that is what this builds —
 * same position in the package, same job (nothing else in the codebase knows
 * the engine's flag names), different wire.
 *
 * Every element is passed to the child literally: `proc_open` receives an
 * array, so a value carrying spaces, quotes, `$(…)` or a newline is one
 * argument containing those characters and nothing interprets it.
 */
final class Request
{
    /**
     * @param list<string> $fontDirs
     * @param list<string> $localeDirs
     *
     * @return list<string>
     */
    public static function render(
        Sources $sources,
        string $paramsPath,
        ?string $lang,
        array $fontDirs,
        array $localeDirs,
    ): array {
        $argv = ['render', '--templates', $sources->template, '--params', $paramsPath];
        if ($sources->definitions !== null) {
            $argv[] = '--definitions';
            $argv[] = $sources->definitions;
        }
        if ($sources->assetsDir !== null) {
            $argv[] = '--assets-dir';
            $argv[] = $sources->assetsDir;
        }
        if ($lang !== null) {
            $argv[] = '--lang';
            $argv[] = $lang;
        }
        foreach ($fontDirs as $dir) {
            $argv[] = '--font-dir';
            $argv[] = $dir;
        }
        foreach ($localeDirs as $dir) {
            $argv[] = '--locale-dir';
            $argv[] = $dir;
        }
        // `-` is the CLI's spelling of stdout, and it is what keeps a
        // rendered document out of the filesystem entirely.
        $argv[] = '--output';
        $argv[] = '-';

        return $argv;
    }

    /**
     * @return list<string>
     */
    public static function sign(
        string $pdfPath,
        string $keyPath,
        string $certPath,
        ?string $passphraseVariable,
    ): array {
        $argv = [
            'sign',
            '--input', $pdfPath,
            '--key', $keyPath,
            '--cert', $certPath,
            '--output', '-',
        ];
        if ($passphraseVariable !== null) {
            // The NAME of a variable, never the passphrase: `argv` is
            // readable by other processes on most systems and lands in shell
            // history, which is why the CLI offers no flag that takes one.
            $argv[] = '--passphrase-env';
            $argv[] = $passphraseVariable;
        }

        return $argv;
    }

    /**
     * @param list<string> $anchorPaths
     *
     * @return list<string>
     */
    public static function verify(string $pdfPath, array $anchorPaths): array
    {
        $argv = ['verify', '--input', $pdfPath];
        foreach ($anchorPaths as $anchor) {
            $argv[] = '--anchor';
            $argv[] = $anchor;
        }

        return $argv;
    }

    /**
     * Params as the source text the engine will parse.
     *
     * A string is the caller's own source text, passed through VERBATIM: the
     * engine parses JSON or YAML (YAML is a superset), so re-encoding it here
     * would only be a chance to change it. Anything else is serialized as
     * JSON.
     *
     * There is deliberately no per-format method family — format dispatch is
     * the engine's, and an SDK that offered `generateYaml` would be claiming
     * a distinction the engine does not make.
     *
     * @throws UsageException when the value cannot be serialized as UTF-8 JSON
     */
    public static function params(mixed $params): string
    {
        if (is_string($params)) {
            return $params;
        }

        try {
            return json_encode($params, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } catch (\JsonException $e) {
            throw new UsageException('params could not be serialized as UTF-8 JSON: '.$e->getMessage());
        }
    }
}

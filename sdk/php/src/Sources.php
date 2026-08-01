<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * What a render is given, in the one form the CLI can take: paths.
 *
 * Produced either by the template root (paths it resolved and proved
 * contained) or from caller-supplied bytes (which {@see Workspace}
 * materializes first). That is what keeps the second entrance from being a
 * second code path — by the time anything reaches the transport there is one
 * shape.
 *
 * The materialization is NOT the file-read the contract forbids. Writing
 * bytes the caller handed over is a different act from opening a path the
 * caller handed over: a path-shaped `template` argument is still source text
 * that fails to parse, never a file that gets read.
 */
final class Sources
{
    private function __construct(
        public readonly string $template,
        public readonly ?string $definitions,
        public readonly ?string $assetsDir,
    ) {
    }

    /**
     * Sources that already exist on disk — the template root's answer.
     */
    public static function atPaths(string $template, ?string $definitions, ?string $assetsDir): self
    {
        return new self($template, $definitions, $assetsDir);
    }

    /**
     * Sources the application handed over as bytes, written into `$workspace`.
     *
     * `assetsDir` is the caller's own directory when they named one: bundled
     * assets belong to a template, and there is no root here to resolve them
     * against. Without it, bundled image sources are simply unavailable —
     * inline sources have no directory of their own.
     */
    public static function fromBytes(
        Workspace $workspace,
        string $template,
        ?string $definitions,
        ?string $assetsDir,
    ): self {
        return new self(
            $workspace->write('templates.yml', $template),
            $definitions === null ? null : $workspace->write('definitions.yml', $definitions),
            $assetsDir,
        );
    }
}

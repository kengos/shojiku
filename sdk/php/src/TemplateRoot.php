<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * Resolving a template NAME to the sources behind it.
 *
 * A name is an identifier, never a path. A bundle format will take this
 * lookup over later, so nothing outside this class may assume a directory is
 * how names resolve — callers ask for `"receipt_ja"` and get sources back.
 *
 * **The rejection rules are the union across platforms, not the host's.**
 * Windows is a first-class target (it is what the .NET SDK's market runs on),
 * so a backslash is a separator, `C:name` is drive-relative, `\\host\share`
 * is a UNC path and `CON`/`NUL` are reserved devices — every one of them
 * refused on EVERY platform. A template name that is valid on one machine is
 * valid on all of them, which is the only way the same application deploys to
 * both.
 *
 * **This transport resolves to PATHS, not bytes.** The CLI reads files, so
 * reading the template here only to hand the child a copy of it would add a
 * rewrite between the operator's file and the render for no gain. What does
 * NOT change is that the name never becomes a path outside this class, and
 * that containment is proved after canonicalization rather than by the shape
 * of the string alone.
 */
final class TemplateRoot
{
    /**
     * Reserved DOS device names. Windows resolves these no matter what
     * directory you are in and no matter what extension you append.
     */
    public const DEVICES = [
        'CON', 'PRN', 'AUX', 'NUL',
        'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
        'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
    ];

    public const TEMPLATE_FILE = 'templates.yml';
    public const DEFINITIONS_FILE = 'definitions.yml';

    /**
     * Each rule, and what a caller is told when it fires.
     */
    private const RULES = [
        'separator' => 'a name is one segment, so `/` and `\\` are never part of it '
            .'(which is also what makes `..` traversal impossible)',
        'control' => 'it contains a control character',
        'driveRelative' => 'it is drive-relative, which Windows resolves against '
            .'that drive\'s current directory',
        'device' => 'it is a reserved device name on Windows',
    ];

    public function __construct(private readonly string $path)
    {
    }

    public function path(): string
    {
        return $this->path;
    }

    /**
     * Resolves `$name`, or throws {@see TemplateRejected} naming why it will
     * not.
     *
     * Rejection is an exception INSIDE this class and a failed Result outside
     * it (see {@see Client::generate()}) — a hostile template name is a fact
     * about the request, not a bug in the calling program.
     *
     * @throws TemplateRejected
     * @throws UsageException when the name is not a string at all
     */
    public function resolve(mixed $name): Sources
    {
        $this->identifier($name);
        $this->reject($name);
        $real = $this->contained($this->path.DIRECTORY_SEPARATOR.$name);
        $template = $real.DIRECTORY_SEPARATOR.self::TEMPLATE_FILE;
        $this->readable($template);
        $definitions = $real.DIRECTORY_SEPARATOR.self::DEFINITIONS_FILE;

        return Sources::atPaths(
            template: $template,
            definitions: is_file($definitions) ? $definitions : null,
            assetsDir: $real,
        );
    }

    /**
     * A name is an IDENTIFIER, so anything that is not a string is a bug in
     * the calling program rather than a hostile request.
     *
     * A BLANK string is the other case and stays a refused request: it can
     * arrive straight from a form field.
     *
     * @phpstan-assert string $name
     */
    private function identifier(mixed $name): void
    {
        if (is_string($name)) {
            return;
        }

        throw new UsageException(sprintf(
            'a template name must be a string; got %s. Sources you already hold go to `generateSource`.',
            get_debug_type($name),
        ));
    }

    /**
     * @throws TemplateRejected
     */
    private function reject(string $name): void
    {
        if (trim($name) === '') {
            throw new TemplateRejected('template_name', 'a template name must not be empty');
        }

        foreach (array_keys(self::RULES) as $rule) {
            if (self::breaks($rule, $name)) {
                throw new TemplateRejected('template_name', sprintf(
                    '`%s` is not a template name: %s',
                    Text::bounded($name),
                    self::RULES[$rule],
                ));
            }
        }
    }

    private static function breaks(string $rule, string $name): bool
    {
        return match ($rule) {
            'separator' => preg_match('#[/\\\\]#', $name) === 1,
            'control' => preg_match('/[\x00-\x1f\x7f]/', $name) === 1,
            'driveRelative' => preg_match('/\A[A-Za-z]:/', $name) === 1,
            default => self::device($name),
        };
    }

    /**
     * Trailing dots and spaces are STRIPPED by Windows before it resolves a
     * name, so `CON.` and `"CON "` are the CON device just as `CON` is.
     * Without that strip they slip past this rule and are refused later, by
     * containment — still refused, but with a message about a missing
     * template rather than about a reserved name.
     */
    private static function device(string $name): bool
    {
        $stem = explode('.', $name)[0];
        $stem = rtrim($stem, ". \t\n\r\0\x0b");

        return in_array(strtoupper($stem), self::DEVICES, true);
    }

    /**
     * The check a name-shape rule cannot make: after following whatever the
     * filesystem has there, is the answer still inside the root? A symlink is
     * what this exists for — it passes every rule above and still points out.
     *
     * `realpath()` returns FALSE for a path that does not exist rather than
     * raising, which is the php form of a trap every mirror has met: a
     * containment check that skipped that branch would compare a false
     * against a string and refuse for the wrong reason.
     *
     * @throws TemplateRejected
     */
    private function contained(string $dir): string
    {
        $root = realpath($this->path);
        $real = realpath($dir);
        if ($root === false || $real === false) {
            throw new TemplateRejected('template_not_found', 'no template by that name');
        }
        // STRUCTURAL, not a prefix compare: a sibling directory named
        // `<root>-evil` starts with the root's own path.
        if ($real !== $root && !str_starts_with($real, $root.DIRECTORY_SEPARATOR)) {
            throw new TemplateRejected(
                'template_escapes_root',
                'the template resolves outside the template root',
            );
        }

        return $real;
    }

    /**
     * @throws TemplateRejected
     */
    private function readable(string $path): void
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new TemplateRejected(
                'template_unreadable',
                'the template could not be read',
                sprintf('%s is not a readable file', Text::bounded($path)),
            );
        }
    }
}

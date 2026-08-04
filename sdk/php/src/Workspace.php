<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\EngineFailureException;

/**
 * The private directory one operation borrows, and gives back.
 *
 * The engine here is a child process that READS FILES, so anything the caller
 * holds in memory — params, a bytes-first template, PEM material, the PDF a
 * signature or a verification is about — has to exist on disk for the length
 * of one call. This class is the only place in the package that writes
 * anything, which is what makes the rules provable in one file:
 *
 * * one directory per call, named from `random_bytes` — never a predictable
 *   name another process could create first,
 * * created 0700 and refused if it already exists, so a pre-created
 *   directory (or a symlink standing where it would go) cannot be borrowed,
 * * every file written 0600 BEFORE its content, so a secret is never
 *   world-readable even briefly,
 * * removed on every path, including the failing ones — which is why callers
 *   use {@see self::in()} rather than constructing one.
 *
 * The rendered document deliberately does NOT come through here: it comes
 * back over the child's stdout, so a PDF never lands in a temporary file at
 * all.
 */
final class Workspace
{
    /** @var list<string> */
    private array $written = [];

    /**
     * How many reports this workspace has handed out — see
     * {@see self::reserveReport()}.
     */
    private int $reports = 0;

    private function __construct(private readonly string $dir)
    {
    }

    /**
     * Runs `$operation` with a fresh workspace, removing it afterwards
     * whatever happens.
     *
     * @template T
     *
     * @param callable(self): T $operation
     *
     * @return T
     */
    public static function in(callable $operation, ?string $parent = null)
    {
        $workspace = self::create($parent ?? sys_get_temp_dir());

        try {
            return $operation($workspace);
        } finally {
            $workspace->remove();
        }
    }

    /**
     * @throws EngineFailureException when the directory cannot be created
     */
    private static function create(string $parent): self
    {
        $dir = $parent.DIRECTORY_SEPARATOR.'shojiku-'.bin2hex(random_bytes(12));
        // `mkdir` with an existing path returns false rather than adopting
        // it, which is exactly the check this needs: the name is unguessable,
        // so a collision means something else put it there.
        if (!@mkdir($dir, 0o700)) {
            throw new EngineFailureException(sprintf(
                'could not create the temporary directory `%s`',
                Text::bounded($dir),
            ));
        }

        return new self($dir);
    }

    /**
     * Writes one file into the workspace and returns its path.
     *
     * @throws EngineFailureException when the file cannot be written
     */
    public function write(string $name, string $content): string
    {
        $path = $this->dir.DIRECTORY_SEPARATOR.$name;
        $handle = @fopen($path, 'xb');
        if ($handle === false) {
            throw new EngineFailureException(sprintf(
                'could not write into the temporary directory `%s`',
                Text::bounded($this->dir),
            ));
        }
        // The mode is set on the empty file, before a byte of content is in
        // it. Writing first and chmod-ing after leaves a window in which a
        // private key is readable by everything on the machine.
        @chmod($path, 0o600);
        fwrite($handle, $content);
        fclose($handle);
        $this->written[] = $path;

        return $path;
    }

    /**
     * The path a file WOULD have, for outputs the child writes itself (the
     * `--report` sidecar). Registered for removal even though nothing here
     * creates it.
     */
    /**
     * A fresh path for one child's `--report` sidecar.
     *
     * Fresh per call, never shared: an operation can run the engine more than
     * once (external signing is two calls), and a shared report path would let
     * the SECOND call read the FIRST one's file when it dies without writing —
     * reporting success over a leg that never ran.
     */
    public function reserveReport(): string
    {
        return $this->reserve(sprintf('report-%d.json', ++$this->reports));
    }

    public function reserve(string $name): string
    {
        $path = $this->dir.DIRECTORY_SEPARATOR.$name;
        $this->written[] = $path;

        return $path;
    }

    public function path(): string
    {
        return $this->dir;
    }

    /**
     * Removes exactly what this workspace named, then the directory.
     *
     * A tracked list rather than a recursive delete: this code runs in
     * applications, and a recursive remove driven by a path is the shape that
     * deletes the wrong tree the day the path is not what it was assumed to
     * be.
     */
    private function remove(): void
    {
        foreach ($this->written as $path) {
            @unlink($path);
        }
        @rmdir($this->dir);
    }
}

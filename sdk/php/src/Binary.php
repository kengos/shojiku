<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\BinaryNotFoundException;

/**
 * Finding the engine's command-line binary.
 *
 * Resolution order, and the deliberate asymmetry with the template root:
 * `SHOJIKU_BIN` beats explicit configuration, which beats whatever is on
 * `PATH`. That is the reverse of how the template root resolves, and on
 * purpose — WHERE THE ENGINE LIVES is an operator/deployment decision that
 * has to be able to win over application code, exactly as `SHOJIKU_LIBRARY`
 * does for the SDKs that load a shared library. WHICH TEMPLATES an
 * application renders is the application's own decision, so there the
 * explicit value wins.
 *
 * Nothing here downloads anything. A binary that is not present is a named
 * error listing the install channels.
 */
final class Binary
{
    public const COMMAND = 'shojiku';

    /**
     * Which position the path came from — worth reporting, because "which
     * engine did this process actually run, and why that one" is the question
     * a deployment asks at 3am.
     */
    public readonly string $source;

    public readonly string $path;

    /**
     * @throws BinaryNotFoundException when no usable binary is found
     */
    public function __construct(?string $configured = null, ?Env $env = null)
    {
        $env ??= new Env(enabled: true);
        [$path, $source] = self::discover($configured, $env);
        if ($path === null) {
            throw new BinaryNotFoundException(self::installHint('no `shojiku` binary was found'));
        }
        if (!is_file($path) || !is_executable($path)) {
            throw new BinaryNotFoundException(self::installHint(sprintf(
                '`%s` is not an executable file',
                Text::bounded($path),
            )));
        }
        $this->path = $path;
        $this->source = $source;
    }

    /**
     * The three lookup positions, in order.
     *
     * Split out from the constructor so each position is provable on its own:
     * a client cannot be built over a binary that does not exist, and "the
     * environment wins" is exactly the claim that needs proving without one.
     *
     * @return array{0: string|null, 1: string}
     */
    public static function discover(?string $configured, Env $env): array
    {
        $fromEnv = $env->get('SHOJIKU_BIN');
        if ($fromEnv !== null) {
            return [$fromEnv, 'environment'];
        }
        if ($configured !== null) {
            return [$configured, 'configuration'];
        }

        return [self::onPath($env), 'path'];
    }

    /**
     * `PATH` searched by hand rather than handed to the shell.
     *
     * No shell ever runs in this package (see {@see Engine}), so there is no
     * `which` to ask — and asking one would mean spawning a shell purely to
     * locate a program, which is the habit that makes a quoting bug possible
     * in the first place. Both the bare name and the Windows `.exe` spelling
     * are tried at every entry, so the same lookup works on the platform this
     * family's market actually runs on.
     */
    private static function onPath(Env $env): ?string
    {
        // `unguarded`, because `PATH` is the operating system's variable
        // rather than one of this engine's settings — see the note there.
        $path = $env->unguarded('PATH') ?? '';
        foreach (explode(PATH_SEPARATOR, $path) as $dir) {
            if ($dir === '') {
                continue;
            }
            foreach ([self::COMMAND, self::COMMAND.'.exe'] as $name) {
                $candidate = $dir.DIRECTORY_SEPARATOR.$name;
                if (is_file($candidate) && is_executable($candidate)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private static function installHint(string $reason): string
    {
        return $reason.".\n\n"
            ."This package never downloads the engine. Install it one of these ways:\n"
            ."  * build it from a repository clone, or run the Docker image\n"
            ."  * point SHOJIKU_BIN at a `shojiku` binary you installed\n"
            .'  * pass new Shojiku\\Client(binary: "/path/to/shojiku")';
    }
}

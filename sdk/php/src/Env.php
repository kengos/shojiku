<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * The one place this package reads the environment.
 *
 * A client is constructed with `env: true` (the default) or `env: false`, and
 * that single flag governs EVERY `SHOJIKU_*` lookup — the template root, the
 * font and locale directories, and the binary path. One flag rather than one
 * per variable is the reference decision the other six SDKs mirror: an
 * application that wants a hermetic configuration wants all of it off, and a
 * per-variable set of knobs is a shape nobody can keep consistent across
 * seven languages. Disabled lookups behave exactly as unset variables do, so
 * calling code has no second branch to get wrong.
 *
 * **A subprocess SDK owes that flag one thing the in-process ones do not.**
 * The engine here is a CHILD PROCESS that reads `SHOJIKU_FONT_DIR` and
 * `SHOJIKU_LOCALE_DIR` itself, so a client that stopped reading them and
 * still let the child inherit them would not be hermetic — it would only have
 * moved the lookup one process away. {@see self::childEnvironment()} is what
 * closes that, and it is the first thing the go SDK must mirror.
 */
final class Env
{
    /** Every variable name the engine family uses, on either side. */
    public const PREFIX = 'SHOJIKU_';

    /**
     * @param array<string, string>|null $source the environment to read, or
     *                                           null for the process's own
     */
    public function __construct(
        private readonly bool $enabled,
        private readonly ?array $source = null,
    ) {
    }

    /**
     * The variable's value, or null when it is unset, blank, or lookups are
     * off.
     */
    public function get(string $name): ?string
    {
        if (!$this->enabled) {
            return null;
        }

        $value = $this->all()[$name] ?? null;

        return $value === null || $value === '' ? null : $value;
    }

    /**
     * A variable that is NOT this engine's configuration, read whatever the
     * flag says.
     *
     * `PATH` is the operating system's, not Shojiku's: `env: false` declares
     * that the application configures the engine itself, which is a different
     * statement from "this process may not find programs the way every
     * process finds programs". Gating it here would make a hermetic client
     * unable to run an installed `shojiku` at all, for a reason its own
     * documentation does not give.
     */
    public function unguarded(string $name): ?string
    {
        $value = $this->all()[$name] ?? null;

        return $value === null || $value === '' ? null : $value;
    }

    /**
     * A `PATH_SEPARATOR`-separated variable as a list of directories, which
     * is how every other tool in this family spells "several paths in one
     * variable".
     *
     * @return list<string>
     */
    public function paths(string $name): array
    {
        $value = $this->get($name);
        if ($value === null) {
            return [];
        }

        return array_values(array_filter(explode(PATH_SEPARATOR, $value), static fn (string $p) => $p !== ''));
    }

    /**
     * The environment the engine child process gets.
     *
     * With lookups enabled this is the parent's own environment, unchanged —
     * the child is entitled to the same deployment settings this process
     * reads. With them disabled every `SHOJIKU_*` variable is REMOVED, which
     * is the only way `env: false` means the same thing here as it does in an
     * SDK that links the engine.
     *
     * @return array<string, string>
     */
    public function childEnvironment(): array
    {
        $environment = $this->all();
        if ($this->enabled) {
            return $environment;
        }

        return array_filter(
            $environment,
            static fn (string $name) => !str_starts_with($name, self::PREFIX),
            ARRAY_FILTER_USE_KEY,
        );
    }

    /**
     * @return array<string, string>
     */
    private function all(): array
    {
        // `getenv()` with no argument, rather than `$_ENV`: the superglobal
        // is populated only when `variables_order` includes `E`, which the
        // CLI SAPI's shipped php.ini-production does not.
        return $this->source ?? getenv();
    }
}

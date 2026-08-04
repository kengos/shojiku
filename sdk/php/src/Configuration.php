<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * Process-wide defaults for every {@see Client} built after they are set.
 *
 * The ecosystem idiom (an options array applied once during bootstrap) OVER
 * the frozen constructor, never a third precedence layer: what
 * {@see self::configure()} sets stands exactly where an explicit constructor
 * argument stands against the environment. So the order is
 *
 *     explicit argument > Configuration::configure() > SHOJIKU_*
 *
 * for the template root and the pack directories, and the deliberate reverse
 * for the engine binary — `SHOJIKU_BIN` still wins over both, because where
 * the engine lives is a deployment decision that has to be able to win over
 * application code.
 *
 * **`strict` is the one exception, and it is the only place `configure()`
 * beats a call site.** Strictness is a restriction rather than a default: an
 * operator who declared a lockdown must not have it lifted by application
 * code passing `strict: false`. Every SDK mirrors that asymmetry.
 *
 * An ARRAY rather than a mutable object handed to a closure, because that is
 * what lets a misspelled key be a named error: assigning an undeclared
 * property is only a deprecation notice in PHP, so the object form would
 * silently ignore `config->template = …` and render nothing.
 */
final class Configuration
{
    /**
     * Every setting a client can take, which is also what
     * {@see self::configure()} accepts — so a misspelled key is a named error
     * rather than a silently ignored one.
     */
    public const SETTINGS = [
        'templates', 'fontDirs', 'localeDirs', 'lang', 'binary', 'logger', 'strict', 'providers', 'env',
    ];

    private static ?self $global = null;

    /**
     * @param list<string>|null $fontDirs
     * @param list<string>|null $localeDirs
     * @param array<string, SigningProvider>|null $providers
     */
    public function __construct(
        public readonly ?string $templates = null,
        public readonly ?array $fontDirs = null,
        public readonly ?array $localeDirs = null,
        public readonly ?string $lang = null,
        public readonly ?string $binary = null,
        public readonly ?object $logger = null,
        public readonly bool $strict = false,
        public readonly ?array $providers = null,
        public readonly bool $env = true,
    ) {
    }

    /**
     * The process-wide defaults, read by every {@see Client} at construction.
     */
    public static function global(): self
    {
        return self::$global ??= new self();
    }

    /**
     * Sets the process-wide defaults.
     *
     * ```php
     * Shojiku\Configuration::configure(['templates' => 'app/templates', 'lang' => 'ja-JP']);
     * ```
     *
     * @param array<string, mixed> $options
     *
     * @throws UsageException on an unknown setting name
     */
    public static function configure(array $options): self
    {
        return self::$global = self::global()->merge($options);
    }

    /**
     * Drops every configured default.
     *
     * Public because a global that cannot be reset makes every test suite
     * invent its own teardown — and get it wrong. Applications call it at
     * most once, if at all.
     */
    public static function reset(): void
    {
        self::$global = null;
    }

    /**
     * A copy with `$overrides` applied — one client's resolution step.
     *
     * A null override means "not given", so an explicit constructor argument
     * beats a configured default and an absent one inherits it. `strict` is
     * the exception documented above: it is OR-ed rather than overridden.
     *
     * `providers` REPLACES rather than merges. A client that declares its own
     * registry is stating the whole set it may sign with, and quietly adding
     * globally-registered keys to that set would defeat the point.
     *
     * @param array<string, mixed> $overrides
     *
     * @throws UsageException on an unknown setting name
     */
    public function merge(array $overrides): self
    {
        foreach (array_keys($overrides) as $key) {
            if (!in_array($key, self::SETTINGS, true)) {
                throw new UsageException(sprintf('unknown client setting `%s`', Text::bounded($key)));
            }
        }

        return new self(
            templates: self::asString($overrides, 'templates') ?? $this->templates,
            fontDirs: self::asStrings($overrides, 'fontDirs') ?? $this->fontDirs,
            localeDirs: self::asStrings($overrides, 'localeDirs') ?? $this->localeDirs,
            lang: self::asString($overrides, 'lang') ?? $this->lang,
            binary: self::asString($overrides, 'binary') ?? $this->binary,
            logger: self::asLogger($overrides) ?? $this->logger,
            // OR-ed, not overridden: a declared lockdown cannot be lifted.
            strict: $this->strict || (self::asBool($overrides, 'strict') ?? false),
            providers: self::asProviders($overrides) ?? $this->providers,
            env: self::asBool($overrides, 'env') ?? $this->env,
        );
    }

    /**
     * A wrong TYPE is programmer misuse, not a value to ignore: silently
     * inheriting the default would render with a configuration the caller
     * believes they replaced.
     *
     * @param array<string, mixed> $overrides
     */
    private static function asString(array $overrides, string $key): ?string
    {
        $value = $overrides[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            throw new UsageException(sprintf('`%s` takes a string', $key));
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return list<string>|null
     */
    private static function asStrings(array $overrides, string $key): ?array
    {
        $value = $overrides[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_array($value)) {
            throw new UsageException(sprintf('`%s` takes a list of directories', $key));
        }

        $dirs = [];
        foreach ($value as $dir) {
            if (!is_string($dir)) {
                throw new UsageException(sprintf('`%s` takes a list of directories', $key));
            }
            $dirs[] = $dir;
        }

        return $dirs;
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private static function asBool(array $overrides, string $key): ?bool
    {
        $value = $overrides[$key] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_bool($value)) {
            throw new UsageException(sprintf('`%s` takes a boolean', $key));
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private static function asLogger(array $overrides): ?object
    {
        $value = $overrides['logger'] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_object($value)) {
            throw new UsageException('`logger` takes an object with a `debug` method');
        }

        return $value;
    }

    /**
     * @param array<string, mixed> $overrides
     *
     * @return array<string, SigningProvider>|null
     */
    private static function asProviders(array $overrides): ?array
    {
        $value = $overrides['providers'] ?? null;
        if ($value === null) {
            return null;
        }
        if (!is_array($value)) {
            throw new UsageException('`providers` takes a map of name to provider');
        }

        $providers = [];
        foreach ($value as $name => $provider) {
            if (!$provider instanceof SigningProvider) {
                throw new UsageException(
                    'a registered signing provider must be a LocalPem or an ExternalSigner',
                );
            }
            $providers[(string) $name] = $provider;
        }

        return $providers;
    }
}

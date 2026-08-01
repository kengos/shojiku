<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * The optional host-side log channel.
 *
 * Silent unless an application supplies a logger, and deliberately narrow: it
 * reports what the BINDING did — which binary it found and which lookup
 * position won, which lifecycle step ran and for how long, and whether it
 * worked — and never what the document contained. Params, rendered bytes,
 * diagnostics and key material are all outside this channel BY RULE, because
 * a log line is the easiest way for a secret to leave a process, and because
 * a diagnostic belongs to the {@see Result} the caller already has.
 *
 * What does cross is bounded first ({@see Text::bounded()}), so a hostile
 * template name cannot smuggle control characters into a log file.
 */
final class Log
{
    private readonly ?\Closure $sink;

    /**
     * Accepts this package's own {@see Logger}, or any object with a
     * `debug(string)` method — which is every PSR-3 logger, so an application
     * passes `$container->get(LoggerInterface::class)` unwrapped and this
     * package still depends on nothing.
     */
    public function __construct(?object $logger = null)
    {
        if ($logger instanceof Logger) {
            $this->sink = static fn (string $message) => $logger->debug($message);

            return;
        }
        if ($logger !== null && is_callable([$logger, 'debug'])) {
            /** @var callable(string): mixed $debug */
            $debug = [$logger, 'debug'];
            $this->sink = static function (string $message) use ($debug): void {
                $debug($message);
            };

            return;
        }
        $this->sink = null;
    }

    /**
     * Records one host event. The message is built only when someone is
     * listening: a silent log costs a null check, not string formatting.
     *
     * @param array<string, scalar|null> $fields
     */
    public function event(string $name, array $fields = []): void
    {
        if ($this->sink === null) {
            return;
        }

        ($this->sink)(sprintf('shojiku %s%s', $name, self::render($fields)));
    }

    /**
     * Times one lifecycle operation and returns what the callable returned.
     *
     * The callable is expected to produce a {@see Result}, whose verdict is
     * recorded as `ok` — the one thing worth knowing about an operation that
     * is not its content.
     *
     * @param callable(): Result $operation
     * @param array<string, scalar|null> $fields
     */
    public function timed(Step $step, callable $operation, array $fields = []): Result
    {
        $started = hrtime(true);
        $result = $operation();
        $fields['ms'] = round((hrtime(true) - $started) / 1_000_000, 1);
        $fields['ok'] = $result->success() ? 'true' : 'false';
        $this->event($step->value, $fields);

        return $result;
    }

    /**
     * @param array<string, scalar|null> $fields
     */
    private static function render(array $fields): string
    {
        $rendered = '';
        foreach ($fields as $key => $value) {
            $rendered .= sprintf(' %s=%s', $key, is_bool($value) ? ($value ? 'true' : 'false') : (string) $value);
        }

        return $rendered;
    }
}

<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * One thing the engine noticed about a document.
 *
 * Passed through, never interpreted. `code` and `args` are the engine's
 * frozen contract — a translating consumer renders its own message from them
 * — so this class reads the wire and stops. It does not translate, it does
 * not re-classify, and it never becomes an exception: a render that warns
 * still succeeded, and a render that failed says why in these.
 */
final class Diagnostic
{
    /**
     * @param array<string, mixed> $args
     */
    public function __construct(
        private readonly ?string $severity,
        private readonly ?string $code,
        private readonly ?string $category,
        private readonly ?string $message,
        private readonly ?string $path,
        private readonly array $args,
        private readonly ?string $origin,
    ) {
    }

    /**
     * Reads the `{"items": [...]}` object the engine emits.
     *
     * The object rather than a bare array is the shape every host publishes,
     * so this is the same parse the other SDKs do — anything that is not that
     * shape yields no diagnostics rather than a guess.
     *
     * @param mixed $payload the decoded `diagnostics` value
     *
     * @return list<self>
     */
    public static function parse(mixed $payload): array
    {
        if (!is_array($payload) || !isset($payload['items']) || !is_array($payload['items'])) {
            return [];
        }

        $items = [];
        foreach ($payload['items'] as $item) {
            if (is_array($item)) {
                $items[] = self::fromItem($item);
            }
        }

        return $items;
    }

    /**
     * @param array<mixed> $item
     */
    private static function fromItem(array $item): self
    {
        /** @var array<string, mixed> $args */
        $args = isset($item['args']) && is_array($item['args']) ? $item['args'] : [];

        return new self(
            self::text($item, 'severity'),
            self::text($item, 'code'),
            self::text($item, 'category'),
            self::text($item, 'message'),
            self::text($item, 'path'),
            $args,
            self::text($item, 'origin'),
        );
    }

    /**
     * @param array<mixed> $item
     */
    private static function text(array $item, string $key): ?string
    {
        return isset($item[$key]) && is_string($item[$key]) ? $item[$key] : null;
    }

    public function severity(): ?string
    {
        return $this->severity;
    }

    public function code(): ?string
    {
        return $this->code;
    }

    public function category(): ?string
    {
        return $this->category;
    }

    public function message(): ?string
    {
        return $this->message;
    }

    public function path(): ?string
    {
        return $this->path;
    }

    /**
     * The engine's typed arguments, untouched.
     *
     * An append-only wire this package does not model, exactly as
     * `engineInfo()` is: a typed value object would owe a new field in seven
     * languages every time the engine adds one.
     *
     * @return array<string, mixed>
     */
    public function args(): array
    {
        return $this->args;
    }

    public function origin(): ?string
    {
        return $this->origin;
    }

    public function isError(): bool
    {
        return $this->severity === 'error';
    }

    public function isWarning(): bool
    {
        return $this->severity === 'warning';
    }

    public function __toString(): string
    {
        $parts = array_filter([$this->path, $this->message], static fn (?string $p) => $p !== null);

        return implode(': ', $parts);
    }
}

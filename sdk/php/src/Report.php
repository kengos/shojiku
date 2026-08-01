<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\EngineFailureException;

/**
 * The `--report <path>` sidecar, read.
 *
 * This is the ONLY result channel. `shojiku: warning[…] …` on stderr is
 * prose: it carries no diagnostic `code`, no typed `args`, no page count, and
 * no way to tell caller error from a refused document — so this package never
 * parses it, and the CLI grew the sidecar precisely so it would not have to.
 *
 * Everything here is defensive about a file it did not write. The engine is
 * trusted to be the engine, but a stale binary, a truncated write or a
 * different program under the same name all produce something that is not
 * this envelope, and the honest answer to that is
 * {@see EngineFailureException} — never a document failure nobody determined.
 */
final class Report
{
    /**
     * The most report this package will read.
     *
     * Diagnostics scale with the document, so this is generous rather than
     * tight; what it rules out is an unbounded read of a file that is not
     * what we think it is.
     */
    public const MAX_BYTES = 8 * 1024 * 1024;

    /**
     * Nesting depth for the decode. The envelope is three levels deep at its
     * deepest (`diagnostics.items[].args`), so this is far above what the
     * wire needs and still bounded.
     */
    public const MAX_DEPTH = 32;

    /**
     * @param list<Diagnostic> $diagnostics
     * @param array{class: string, step: string, kind: string, message: string}|null $failure
     * @param array<mixed>|null $verification
     */
    private function __construct(
        public readonly bool $ok,
        public readonly array $diagnostics,
        public readonly ?int $pageCount,
        public readonly ?array $verification,
        public readonly ?array $failure,
    ) {
    }

    /**
     * Reads the sidecar the child was told to write.
     *
     * @param string $path where `--report` pointed
     * @param string $stderr what the child said, for the message when there
     *                       is no report to explain the failure
     *
     * @throws EngineFailureException when there is no readable envelope
     */
    public static function read(string $path, string $stderr): self
    {
        // One byte past the cap is read deliberately: that is what tells a
        // report AT the cap from one past it, without ever holding more than
        // the cap plus a byte of a file this package did not write.
        $json = @file_get_contents($path, false, null, 0, self::MAX_BYTES + 1);
        if ($json === false) {
            throw new EngineFailureException(self::noReport('the engine wrote no report', $stderr));
        }
        if (strlen($json) > self::MAX_BYTES) {
            throw new EngineFailureException(sprintf(
                'the engine wrote a report past this package\'s %d-byte cap',
                self::MAX_BYTES,
            ));
        }

        return self::parse($json, $stderr);
    }

    /**
     * @throws EngineFailureException when the JSON is not this envelope
     */
    public static function parse(string $json, string $stderr = ''): self
    {
        try {
            $payload = json_decode($json, true, self::MAX_DEPTH, JSON_THROW_ON_ERROR);
        } catch (\JsonException $e) {
            throw new EngineFailureException(
                self::noReport('the engine\'s report is not JSON: '.$e->getMessage(), $stderr),
            );
        }
        if (!is_array($payload) || !isset($payload['ok']) || !is_bool($payload['ok'])) {
            throw new EngineFailureException(
                self::noReport('the engine\'s report is not a report envelope', $stderr),
            );
        }

        return new self(
            $payload['ok'],
            Diagnostic::parse($payload['diagnostics'] ?? null),
            isset($payload['pageCount']) && is_int($payload['pageCount']) ? $payload['pageCount'] : null,
            isset($payload['verification']) && is_array($payload['verification'])
                ? $payload['verification']
                : null,
            self::failure($payload['failure'] ?? null),
        );
    }

    /**
     * The failure block, or null on a successful operation.
     *
     * A `failure` that is present but malformed is treated as absent rather
     * than guessed at — the `ok` flag above already says which way the
     * operation went, and inventing a `kind` an SDK branches on would be
     * worse than reporting `unknown`.
     *
     * @return array{class: string, step: string, kind: string, message: string}|null
     */
    private static function failure(mixed $failure): ?array
    {
        if (!is_array($failure)) {
            return null;
        }

        return [
            'class' => self::text($failure, 'class', 'document'),
            'step' => self::text($failure, 'step', ''),
            'kind' => self::text($failure, 'kind', 'unknown'),
            'message' => self::text($failure, 'message', ''),
        ];
    }

    /**
     * @param array<mixed> $block
     */
    private static function text(array $block, string $key, string $fallback): string
    {
        return isset($block[$key]) && is_string($block[$key]) ? $block[$key] : $fallback;
    }

    /**
     * The engine's stderr is quoted ONLY here, and bounded: it is the one
     * place where a caller has nothing else to go on, and it stays out of the
     * result objects for the same reason it stays out of the log — prose is
     * not a contract.
     */
    private static function noReport(string $reason, string $stderr): string
    {
        $said = trim($stderr);
        if ($said === '') {
            return $reason;
        }

        return sprintf('%s (it said: %s)', $reason, Text::bounded($said));
    }

    /**
     * Whether the failure is the CALLER's, which is the split the capi
     * carries in its status code and the CLI carries in this field.
     */
    public function isUsage(): bool
    {
        return ($this->failure['class'] ?? null) === 'usage';
    }
}

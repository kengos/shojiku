<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * A rendered (and possibly signed) document.
 *
 * The application sees bytes and metadata — never a layout-engine internal.
 * Where the FFI SDKs say "and never a handle it has to free", this transport
 * says "and never a temporary file it has to clean up": the bytes come back
 * over the child's stdout and the workspace is gone before this object
 * exists.
 */
final class DocumentArtifact
{
    /**
     * @param list<Diagnostic> $diagnostics
     */
    public function __construct(
        private readonly string $bytes,
        private readonly array $diagnostics,
        private readonly Client $client,
        private readonly ?int $pageCount = null,
        private readonly Origin $origin = Origin::Loaded,
    ) {
    }

    /**
     * The PDF, as binary. A PHP string is a byte string, so nothing here has
     * an encoding to be corrupted by.
     */
    public function bytes(): string
    {
        return $this->bytes;
    }

    /**
     * How many pages the engine laid out. `null` for an artifact that was
     * signed rather than rendered — signing appends a revision to bytes it
     * never measured, and a zero there would read as "a document with no
     * pages".
     */
    public function pageCount(): ?int
    {
        return $this->pageCount;
    }

    /**
     * @return list<Diagnostic>
     */
    public function diagnostics(): array
    {
        return $this->diagnostics;
    }

    /**
     * Where this document came from — the provenance a strict client signs
     * on. `origin` defaults to the LEAST privileged value, not the most:
     * every internal path states it explicitly, so the default only ever
     * applies to an artifact somebody built by hand, which is bytes handed
     * over whole and must not become signable under a lockdown by omission.
     */
    public function origin(): Origin
    {
        return $this->origin;
    }

    /**
     * Whether these bytes were handed over whole rather than laid out here.
     */
    public function loaded(): bool
    {
        return $this->origin === Origin::Loaded;
    }

    /**
     * Writes the document, returning the path.
     *
     * @throws UsageException when the path cannot be written
     */
    public function write(string $path): string
    {
        $written = @file_put_contents($path, $this->bytes);
        if ($written === false) {
            throw new UsageException(sprintf('could not write `%s`', Text::bounded($path)));
        }

        return $path;
    }

    public function size(): int
    {
        return strlen($this->bytes);
    }

    /**
     * Signs this document, returning a {@see Result} carrying the signed
     * artifact. The signed bytes begin with these bytes byte for byte:
     * signing appends a revision, it never rewrites what was there.
     */
    public function sign(LocalPem|string $provider): Result
    {
        return $this->client->sign($this, $provider);
    }

    /**
     * Verifies this document against caller-supplied trust anchors.
     *
     * @param list<string>|string|null $anchors path(s) to PEM anchor files
     * @param string|null $anchorsPem anchor PEM bytes
     */
    public function verify(array|string|null $anchors = null, ?string $anchorsPem = null): Result
    {
        return $this->client->verify($this, $anchors, $anchorsPem);
    }
}

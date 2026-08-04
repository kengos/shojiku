<?php

declare(strict_types=1);

namespace Shojiku;

use Shojiku\Exception\UsageException;

/**
 * The input ceiling an operator can declare, and the named signing providers
 * that go with it.
 *
 * Once signing is in the loop, template input is a security boundary: whoever
 * controls the bytes controls what gets signed. A strict client therefore
 * narrows where signable input may come from.
 *
 * * The bytes-first entrance ({@see Client::generateSource()}) is refused, so
 *   every document this client signs came from the configured template root,
 *   with its containment rules.
 * * An artifact this client did not render ({@see Client::artifact()}) may
 *   not be signed — those bytes are the caller's, exactly like a bytes-first
 *   template.
 * * Signing material must be a provider REGISTERED in configuration and named
 *   at the call site, so a key path never appears in request-handling code
 *   and the material is loaded by one object rather than rebuilt per request.
 *
 * **Verification is never restricted.** Verifying bytes of unknown provenance
 * is the entire point of verify, and a locked-down deployment is precisely
 * the one that needs to check an archived document it did not produce.
 *
 * Refusals throw {@see UsageException} rather than returning a failed
 * {@see Result}: strict disables an ENTRANCE, so calling it is the program
 * contradicting its own deployment's configuration — not a fact about a
 * document — and a failed result is something an `if ($result->success())`
 * can swallow.
 *
 * The six other SDKs mirror this with identical semantics. It is contract,
 * not ecosystem idiom.
 */
final class Lockdown
{
    /**
     * @param array<string, SigningProvider> $providers
     */
    public function __construct(
        private readonly bool $strict,
        private readonly array $providers = [],
    ) {
    }

    public function strict(): bool
    {
        return $this->strict;
    }

    /**
     * The bytes-first entrance.
     */
    public function sourceEntrance(): void
    {
        if (!$this->strict) {
            return;
        }

        throw new UsageException(
            'this client is strict: templates must come from the template root, so '
            .'`generateSource` is disabled. Use `generate($name, $params)`.',
        );
    }

    /**
     * An artifact about to be signed. Only a document laid out from a
     * template the ROOT resolved qualifies — bytes handed over whole, and
     * bytes laid out from a caller's own template, are the same trust class
     * here. That closes the gap a boolean "was it loaded" would leave open:
     * an artifact from another client's bytes-first render is not this
     * deployment's document either.
     */
    public function signable(DocumentArtifact $artifact): void
    {
        if (!$this->strict || $artifact->origin() === Origin::Rendered) {
            return;
        }

        throw new UsageException(sprintf(
            'this client is strict: only a document rendered from its own template root '
            .'may be signed (this one is %s). It can still be verified.',
            $artifact->origin()->value,
        ));
    }

    /**
     * The provider to sign with.
     *
     * A string is a registered name, in strict mode and out of it — naming
     * providers is good practice everywhere, and only the REFUSAL of the
     * alternative is strict's. A provider object is accepted only when this
     * client is not strict.
     */
    public function provider(SigningProvider|string $provider): SigningProvider
    {
        if (is_string($provider)) {
            return $this->providers[$provider]
                ?? throw new UsageException(sprintf(
                    'no signing provider named `%s` is registered',
                    Text::bounded($provider),
                ));
        }
        if (!$this->strict) {
            return $provider;
        }

        throw new UsageException(
            'this client is strict: sign with the name of a provider registered in '
            .'configuration, not with a provider object.',
        );
    }
}

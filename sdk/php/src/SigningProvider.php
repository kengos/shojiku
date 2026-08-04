<?php

declare(strict_types=1);

namespace Shojiku;

/**
 * What a client needs from anything it can sign with.
 *
 * The polymorphic hook, so {@see Client::sign()} branches on nothing: what
 * differs between a key held in this process and one held in a cloud service
 * is HOW a signature is produced, which is exactly what this method is.
 *
 * A provider is a CLASS rather than a set of arguments on `sign` — which is
 * what let the second one ({@see ExternalSigner}) arrive as a class rather
 * than as a signature change in seven SDKs.
 */
interface SigningProvider
{
    /**
     * Produces the signed document, however this provider produces one.
     *
     * Returns the engine's report and the signed bytes, which the client
     * turns into a {@see Result}. A provider that could not get as far as a
     * signature returns the FAILED report and no bytes — an unusable
     * certificate is a fact about the inputs, and the client reports it the
     * same way it reports any other refused document.
     *
     * @return array{Report, string}
     */
    public function signWith(Engine $engine, Workspace $workspace, DocumentArtifact $artifact): array;
}

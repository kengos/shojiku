/**
 * The input ceiling an operator can declare, and its named signing providers.
 *
 * Once signing is in the loop, template input is a security boundary: whoever
 * controls the bytes controls what gets signed. A strict client therefore
 * narrows where signable input may come from.
 *
 * - The bytes-first entrance is refused, so every document this client signs
 *   came from the configured template root, with its containment rules.
 * - An artifact this client did not render may not be signed — those bytes are
 *   the caller's, exactly like a bytes-first template.
 * - Signing material must be a provider REGISTERED in configuration and named
 *   at the call site, so a key path never appears in request-handling code and
 *   the material is loaded by one object rather than rebuilt per request.
 *
 * **Verification is never restricted.** Verifying bytes of unknown provenance
 * is the entire point of verify, and a locked-down deployment is precisely the
 * one that needs to check an archived document it did not produce.
 *
 * Refusals throw `UsageError` rather than returning a failed result: strict
 * disables an ENTRANCE, so calling it is the program contradicting its own
 * deployment's configuration — not a fact about a document — and a failed
 * result is something `if (result.success)` can swallow.
 *
 * The six other SDKs mirror this with identical semantics. It is contract, not
 * ecosystem idiom.
 */

import type { DocumentArtifact } from './artifact.js';
import { Origin } from './artifact.js';
import { bounded, UsageError } from './errors.js';

/** One client's ceiling: which entrances are open, and which providers exist. */
export class Lockdown {
  readonly strict: boolean;
  // A Map, not an object: a provider name can come from a request, and an
  // object lookup of `constructor` or `toString` would return an INHERITED
  // function that reads as a registered provider.
  private readonly providers: Map<string, unknown>;

  constructor(strict: boolean, providers: Record<string, unknown> = {}) {
    this.strict = strict;
    this.providers = new Map(Object.entries(providers));
  }

  /** The bytes-first entrance. */
  sourceEntrance(): void {
    if (!this.strict) {
      return;
    }

    throw new UsageError(
      'this client is strict: templates must come from the template root, so ' +
        '`generateSource` is disabled. Use `generate(name, params)`.',
    );
  }

  /**
   * An artifact about to be signed.
   *
   * Only a document laid out from a template the ROOT resolved qualifies —
   * bytes handed over whole, and bytes laid out from a caller's own template,
   * are the same trust class here. That closes the gap a boolean "was it
   * loaded" would leave open: an artifact from another client's bytes-first
   * render is not this deployment's document either.
   */
  signable(artifact: DocumentArtifact): void {
    if (!this.strict || artifact.origin === Origin.RENDERED) {
      return;
    }

    throw new UsageError(
      'this client is strict: only a document rendered from its own template ' +
        `root may be signed (this one is ${artifact.origin}). It can still be verified.`,
    );
  }

  /**
   * The provider to sign with.
   *
   * A string is a registered name, in strict mode and out of it — naming
   * providers is good practice everywhere, and only the REFUSAL of the
   * alternative is strict's. A provider object is accepted only when this
   * client is not strict.
   */
  provider(provider: unknown): unknown {
    if (typeof provider === 'string') {
      return this.registered(provider);
    }
    if (!this.strict) {
      return provider;
    }

    throw new UsageError(
      'this client is strict: sign with the name of a provider registered in ' +
        'configuration, not with a provider object.',
    );
  }

  private registered(name: string): unknown {
    const provider = this.providers.get(name);
    if (provider === undefined) {
      throw new UsageError(`no signing provider named \`${bounded(name)}\` is registered`);
    }
    return provider;
  }
}

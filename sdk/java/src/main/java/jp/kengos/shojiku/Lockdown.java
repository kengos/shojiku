package jp.kengos.shojiku;

import java.util.Map;

/**
 * The input ceiling an operator can declare, and its named signing providers.
 *
 * <p>Once signing is in the loop, template input is a security boundary: whoever controls the bytes
 * controls what gets signed. A strict client therefore narrows where signable input may come from.
 *
 * <ul>
 *   <li>The text entrance is refused, so every document this client signs came from the configured
 *       template root, with its containment rules.
 *   <li>An artifact this client did not render may not be signed — those bytes are the caller's,
 *       exactly like a caller-supplied template.
 *   <li>Signing material must be a provider REGISTERED in configuration and named at the call site,
 *       so a key path never appears in request-handling code and the material is loaded by one
 *       object rather than rebuilt per request.
 * </ul>
 *
 * <p><b>Verification is never restricted.</b> Verifying bytes of unknown provenance is the entire
 * point of verify, and a locked-down deployment is precisely the one that needs to check an
 * archived document it did not produce.
 *
 * <p>Refusals throw {@link UsageException} rather than returning a failed result: strict disables
 * an ENTRANCE, so calling it is the program contradicting its own deployment's configuration — not
 * a fact about a document — and a failed result is something {@code if (result.success())} can
 * swallow.
 *
 * <p>The six other SDKs mirror this with identical semantics. It is contract, not ecosystem idiom.
 */
final class Lockdown {

  private final boolean strict;
  private final Map<String, SigningProvider> providers;

  Lockdown(boolean strict, Map<String, SigningProvider> providers) {
    this.strict = strict;
    this.providers = providers == null ? Map.of() : Map.copyOf(providers);
  }

  /** The text entrance. */
  void sourceEntrance() {
    if (!strict) {
      return;
    }
    throw new UsageException(
        "this client is strict: templates must come from the template root, so "
            + "`generateSource` is disabled. Use `generate(name, params)`.");
  }

  /**
   * An artifact about to be signed.
   *
   * <p>Only a document laid out from a template the ROOT resolved qualifies — bytes handed over
   * whole, and bytes laid out from a caller's own template, are the same trust class here. That
   * closes the gap a boolean "was it loaded" would leave open: an artifact from another client's
   * text-first render is not this deployment's document either.
   */
  void signable(DocumentArtifact artifact) {
    if (!strict || artifact.origin() == Origin.RENDERED) {
      return;
    }
    throw new UsageException(
        "this client is strict: only a document rendered from its own template root may be signed "
            + "(this one is "
            + artifact.origin()
            + "). It can still be verified.");
  }

  /**
   * The provider to sign with.
   *
   * <p>A String is a registered name, in strict mode and out of it — naming providers is good
   * practice everywhere, and only the REFUSAL of the alternative is strict's. A provider object is
   * accepted only when this client is not strict.
   */
  EngineSigner provider(Object provider) {
    if (provider instanceof String name) {
      return registered(name);
    }
    if (!strict) {
      if (provider instanceof EngineSigner signer) {
        return signer;
      }
      throw new UsageException(
          "a signing provider must implement SigningProvider, or be the name of one registered in "
              + "configuration");
    }
    throw new UsageException(
        "this client is strict: sign with the name of a provider registered in configuration, not "
            + "with a provider object.");
  }

  /**
   * The registered value, when it is one this package can sign with.
   *
   * <p>A registry may only hold providers that CARRY material: {@link SigningProvider} is a public
   * marker, so a value implementing it and nothing else would otherwise reach the transport with no
   * way to produce a signature.
   */
  private static EngineSigner asSigner(SigningProvider provider) {
    return provider instanceof EngineSigner signer ? signer : null;
  }

  private EngineSigner registered(String name) {
    EngineSigner provider = asSigner(providers.get(name));
    if (provider == null) {
      throw new UsageException(
          "no signing provider named `" + Texts.bounded(name) + "` is registered");
    }
    return provider;
  }
}

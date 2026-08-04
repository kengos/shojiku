package jp.kengos.shojiku;

/**
 * What a client actually needs from a provider: a signed document.
 *
 * <p>The polymorphic hook, so {@link ShojikuClient#sign} branches on nothing — what differs between
 * a key held in this process and one held in a cloud service is HOW a signature is produced, which
 * is exactly what this method is.
 */
interface EngineSigner extends SigningProvider {

  /**
   * Produces the signed document, however this provider produces one.
   *
   * @param engine the open engine
   * @param pdf the document to sign
   * @return what the engine said
   */
  Snapshot signWith(Engine engine, byte[] pdf);
}

package jp.kengos.shojiku;

/**
 * Where a document came from, which is what a strict client signs on.
 *
 * <p>Only {@link #RENDERED} is signable under a lockdown: in the other two the provenance of what
 * gets signed is the application's rather than the deployment's, which is the distinction strict
 * exists to draw. Signing inherits the origin of what it signed — appending a revision does not
 * launder where the document came from. Verification is never restricted.
 */
public enum Origin {
  /** Bytes the application supplied whole. */
  LOADED,

  /** Laid out from a template the configured root resolved. */
  RENDERED,

  /** Laid out from template bytes the application supplied. */
  SOURCE;

  /**
   * The lowercase name, which is what a refusal message shows.
   *
   * @return the lowercase name
   */
  @Override
  public String toString() {
    return name().toLowerCase(java.util.Locale.ROOT);
  }
}

package jp.kengos.shojiku;

/**
 * The SDK's own lifecycle vocabulary.
 *
 * <p>Always one of these three. The engine's error object carries a step of its own naming an
 * INTERNAL stage ({@code render}, {@code validate}), and passing that through would make the
 * trace's step mean different things depending on which layer refused. What the engine said
 * specifically is the {@link Failure#kind()}.
 */
public enum Step {
  /** Rendering a document, from a template name or from caller-supplied sources. */
  GENERATE,

  /** Appending a signature revision to a rendered document. */
  SIGN,

  /** Checking a document's signature against caller-supplied trust anchors. */
  VERIFY;

  /**
   * The wire spelling, which is also how a failure prints itself.
   *
   * @return the lowercase name
   */
  @Override
  public String toString() {
    return name().toLowerCase(java.util.Locale.ROOT);
  }
}

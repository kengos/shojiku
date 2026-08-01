package jp.kengos.shojiku;

/**
 * The base of every exception this package throws.
 *
 * <p>Throwing is deliberately rare here. A template that will not render, a key that will not sign,
 * a signature that does not verify are OUTCOMES — they come back as {@link Result} objects you
 * query, never as exceptions you catch. What is left for exceptions is what every Java library
 * reserves them for: programmer misuse, and an environment that cannot host the engine at all.
 *
 * <p>Unchecked, deliberately: none of these is a condition a correct program recovers from at the
 * call site, and a checked exception would push {@code try}/{@code catch} into code whose whole
 * point is that failure arrives as data.
 */
public class ShojikuException extends RuntimeException {

  /**
   * Creates the exception.
   *
   * @param message what went wrong
   */
  public ShojikuException(String message) {
    super(message);
  }

  /**
   * Creates the exception over the one underneath it.
   *
   * @param message what went wrong
   * @param cause the exception this one wraps
   */
  public ShojikuException(String message, Throwable cause) {
    super(message, cause);
  }
}

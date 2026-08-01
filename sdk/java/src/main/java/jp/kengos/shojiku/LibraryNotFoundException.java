package jp.kengos.shojiku;

/**
 * The engine library could not be found or loaded.
 *
 * <p>The message names the install channels, because the fix is always an installation step and a
 * bare loader error names none of them. Nothing here downloads the library: an SDK that fetches an
 * executable is a supply-chain surface this product does not take on.
 */
public class LibraryNotFoundException extends ShojikuException {

  /**
   * Creates the exception.
   *
   * @param message the reason, followed by the install channels
   */
  public LibraryNotFoundException(String message) {
    super(message);
  }

  /**
   * Creates the exception over the loader error underneath it.
   *
   * @param message the reason, followed by the install channels
   * @param cause the loader error
   */
  public LibraryNotFoundException(String message, Throwable cause) {
    super(message, cause);
  }
}

package jp.kengos.shojiku;

/**
 * The library implements a different ABI revision than this package.
 *
 * <p>Loading anyway would mean calling symbols whose meaning has changed.
 */
public class AbiMismatchException extends ShojikuException {

  /**
   * Creates the exception.
   *
   * @param message which revision was found and which was expected
   */
  public AbiMismatchException(String message) {
    super(message);
  }
}

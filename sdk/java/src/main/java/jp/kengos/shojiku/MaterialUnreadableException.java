package jp.kengos.shojiku;

/**
 * Key, certificate or trust-anchor bytes that could not be read.
 *
 * <p>Thrown internally and caught by the client, which turns it into a failed result: an unreadable
 * key is an outcome of the operation, not a bug in the calling program. It carries the
 * machine-readable {@link #kind()} the failure trace reports.
 */
public class MaterialUnreadableException extends ShojikuException {

  private final String kind;

  /**
   * Creates the exception.
   *
   * @param kind the machine-readable class of material
   * @param message why it could not be read
   */
  public MaterialUnreadableException(String kind, String message) {
    super(message);
    this.kind = kind;
  }

  /**
   * The machine-readable class of material that could not be read.
   *
   * @return the kind the failure trace reports
   */
  public String kind() {
    return kind;
  }
}

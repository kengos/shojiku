package jp.kengos.shojiku;

/**
 * The caller passed something this API cannot accept.
 *
 * <p>Both forms of the same material at once, or an entrance this client's lockdown disables.
 * Programmer misuse, so it throws.
 *
 * <p>A BLANK template name is deliberately not in that list: an empty string can arrive straight
 * from a form field, so it comes back as a refused request like every other bad name.
 */
public class UsageException extends ShojikuException {

  /**
   * Creates the exception.
   *
   * @param message what the caller got wrong
   */
  public UsageException(String message) {
    super(message);
  }

  /**
   * Creates the exception over the one underneath it.
   *
   * @param message what the caller got wrong
   * @param cause the exception this one wraps
   */
  public UsageException(String message, Throwable cause) {
    super(message, cause);
  }
}

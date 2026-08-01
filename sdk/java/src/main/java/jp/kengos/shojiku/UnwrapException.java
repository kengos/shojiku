package jp.kengos.shojiku;

/**
 * Unwrapping a result that failed.
 *
 * <p>{@link Result#unwrap()} is the opt-in bridge to exception-style control flow. Calling it on a
 * failed result is programmer misuse — the ruling is explicit and frozen for every Shojiku SDK,
 * because an accessor that throws is the one place this API could drift back into exceptions by
 * accident. The failure travels on the exception, so nothing is lost by taking the short road.
 */
public class UnwrapException extends ShojikuException {

  private final transient Failure failure;

  /**
   * Creates the exception carrying the failure that was unwrapped.
   *
   * @param failure why the operation did not produce what was asked for
   */
  public UnwrapException(Failure failure) {
    super(failure.toString());
    this.failure = failure;
  }

  /**
   * The failure the unwrapped result carried.
   *
   * @return the trace
   */
  public Failure failure() {
    return failure;
  }
}

package jp.kengos.shojiku;

import java.util.Map;

/** The outcome of one check: passed, or failed with the reason. */
public final class Check {

  private final String status;
  private final String reason;

  Check(Object payload) {
    Map<?, ?> item = payload instanceof Map<?, ?> map ? map : Map.of();
    this.status = item.get("status") instanceof String text ? text : null;
    this.reason = item.get("reason") instanceof String text ? text : null;
  }

  /**
   * The engine's verdict for this check.
   *
   * @return the status, or null when the engine reported none
   */
  public String status() {
    return status;
  }

  /**
   * Why, when it did not pass.
   *
   * @return the reason, or null
   */
  public String reason() {
    return reason;
  }

  /**
   * Whether this check passed.
   *
   * @return true when it did
   */
  public boolean passed() {
    return "passed".equals(status);
  }

  @Override
  public String toString() {
    if (reason != null) {
      return status + ": " + reason;
    }
    return status == null ? "" : status;
  }
}

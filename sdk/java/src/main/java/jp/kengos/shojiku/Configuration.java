package jp.kengos.shojiku;

import java.util.function.UnaryOperator;

/**
 * The process-wide defaults, and the entry points that set them.
 *
 * <p>The rule the other six SDKs mirror: an ecosystem-standard configuration idiom feeds the same
 * constructor and never adds a precedence level of its own. The precedence itself is documented on
 * {@link Config}.
 */
public final class Configuration {

  private static volatile Config current = Config.empty();

  private Configuration() {}

  /**
   * The process-wide defaults, read by every client at construction.
   *
   * @return the current defaults
   */
  public static Config current() {
    return current;
  }

  /**
   * Set process-wide defaults.
   *
   * <pre>{@code
   * Shojiku.Configuration.configure(config -> config.withTemplates("app/templates"));
   * }</pre>
   *
   * @param change produces the new defaults from the current ones
   * @return the configured defaults
   */
  public static Config configure(UnaryOperator<Config> change) {
    current = change.apply(current);
    return current;
  }

  /**
   * Drop every configured default.
   *
   * <p>Public because a global that cannot be reset makes every test suite invent its own teardown
   * — and get it wrong in a randomly-ordered run. Applications call it at most once, if at all.
   */
  public static void reset() {
    current = Config.empty();
  }
}

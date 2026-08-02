package jp.kengos.shojiku;

/**
 * Anything that can be told something at debug level.
 *
 * <p>One method, so this package never grows a logging dependency: adapting SLF4J, Log4j or
 * java.util.logging is {@code logger::debug} at the call site.
 */
@FunctionalInterface
public interface ShojikuLogger {

  /**
   * Record one host event.
   *
   * @param message what the binding did. Never document content.
   */
  void debug(String message);
}

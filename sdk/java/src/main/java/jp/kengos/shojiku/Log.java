package jp.kengos.shojiku;

import java.util.function.Supplier;

/**
 * The optional host-side log channel.
 *
 * <p>Silent unless an application supplies a logger, and deliberately narrow: it reports what the
 * BINDING did — which library it loaded, which ABI revision it found, which lifecycle step ran and
 * for how long — and never what the document contained. Params, rendered bytes, diagnostics and key
 * material are all outside this channel BY RULE, because a log line is the easiest way for a secret
 * to leave a process, and because a diagnostic belongs to the result the caller already has.
 *
 * <p>What does cross is bounded first, so a hostile template name cannot smuggle control characters
 * into a log file.
 *
 * <p>The interface is one method, so this package's dependency list stays at exactly one entry
 * (JNA) — wiring it to SLF4J, Log4j or java.util.logging is a lambda at the call site. The
 * cross-language rule the other six mirror: each SDK accepts its ecosystem's standard logger
 * interface, optionally; where a language cannot duck-type, the smallest interface that costs no
 * dependency is that answer.
 */
final class Log {

  private final ShojikuLogger logger;

  Log() {
    this(null);
  }

  Log(ShojikuLogger logger) {
    this.logger = logger;
  }

  /**
   * Record one host event.
   *
   * <p>The message is built only when someone is listening: a silent log costs a null check, not
   * string formatting.
   *
   * @param name the event
   * @param fields alternating key and value
   */
  void event(String name, Object... fields) {
    if (logger == null) {
      return;
    }
    StringBuilder message = new StringBuilder("shojiku ").append(name);
    for (int index = 0; index + 1 < fields.length; index += 2) {
      message.append(' ').append(fields[index]).append('=').append(fields[index + 1]);
    }
    logger.debug(message.toString());
  }

  /**
   * Time one lifecycle operation and return what it returned.
   *
   * <p>The operation is expected to produce a result, whose verdict is recorded as {@code ok} — the
   * one thing worth knowing about an operation that is not its content.
   */
  <T> Result<T> timed(String name, Supplier<Result<T>> operation, Object... fields) {
    long started = System.nanoTime();
    Result<T> result = operation.get();
    if (logger == null) {
      return result;
    }
    double elapsedMs = Math.round((System.nanoTime() - started) / 1_000_00.0) / 10.0;
    Object[] all = new Object[fields.length + 4];
    System.arraycopy(fields, 0, all, 0, fields.length);
    all[fields.length] = "ms";
    all[fields.length + 1] = elapsedMs;
    all[fields.length + 2] = "ok";
    all[fields.length + 3] = result.success();
    event(name, all);
    return result;
  }
}

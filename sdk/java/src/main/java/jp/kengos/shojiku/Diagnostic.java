package jp.kengos.shojiku;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One thing the engine noticed about a document.
 *
 * <p>Passed through, never interpreted. {@link #code()} and {@link #args()} are the engine's frozen
 * contract — a translating consumer renders its own message from them — so this class parses the
 * wire and stops. It does not translate, it does not re-classify, and it never becomes an
 * exception: a render that warns still succeeded, and a render that failed says why in these.
 */
public final class Diagnostic {

  private final Map<String, Object> item;

  private Diagnostic(Map<String, Object> item) {
    this.item = item;
  }

  /**
   * Every diagnostic in a payload, or nothing at all for an empty one.
   *
   * @param payload the diagnostics JSON, possibly empty
   * @return the diagnostics, in the order the engine emitted them
   */
  @SuppressWarnings("unchecked")
  static List<Diagnostic> parse(String payload) {
    Object items = Json.object(payload).get("items");
    if (!(items instanceof List<?> listed)) {
      return List.of();
    }
    List<Diagnostic> parsed = new ArrayList<>(listed.size());
    for (Object entry : listed) {
      parsed.add(new Diagnostic(entry instanceof Map ? (Map<String, Object>) entry : Map.of()));
    }
    return List.copyOf(parsed);
  }

  /**
   * {@code error} or {@code warning}, as the engine classified it.
   *
   * @return the severity, or null when the engine sent none
   */
  public String severity() {
    return text("severity");
  }

  /**
   * The engine's stable, append-only diagnostic code.
   *
   * @return the code, or null
   */
  public String code() {
    return text("code");
  }

  /**
   * The engine's grouping for this code.
   *
   * @return the category, or null
   */
  public String category() {
    return text("category");
  }

  /**
   * The engine's own English message.
   *
   * <p>A translating consumer renders from {@link #code()} and {@link #args()} instead.
   *
   * @return the message, or null
   */
  public String message() {
    return text("message");
  }

  /**
   * Where in the document the engine noticed it.
   *
   * @return the path, or null
   */
  public String path() {
    return text("path");
  }

  /**
   * Which input the diagnostic came from.
   *
   * @return the origin, or null
   */
  public String origin() {
    return text("origin");
  }

  /**
   * The typed arguments behind the message, passed through untranslated.
   *
   * @return the arguments, empty when there are none
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> args() {
    Object args = item.get("args");
    return args instanceof Map
        ? Map.copyOf(new LinkedHashMap<>((Map<String, Object>) args))
        : Map.of();
  }

  /**
   * Whether this diagnostic is an error.
   *
   * @return true when the engine classified it as one
   */
  public boolean isError() {
    return "error".equals(severity());
  }

  /**
   * Whether this diagnostic is a warning.
   *
   * @return true when the engine classified it as one
   */
  public boolean isWarning() {
    return "warning".equals(severity());
  }

  private String text(String key) {
    Object value = item.get(key);
    return value instanceof String string ? string : null;
  }

  @Override
  public String toString() {
    String path = path();
    String message = message();
    if (path == null) {
      return message == null ? "" : message;
    }
    return path + ": " + message;
  }
}

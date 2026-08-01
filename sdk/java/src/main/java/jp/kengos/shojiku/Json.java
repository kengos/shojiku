package jp.kengos.shojiku;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The JSON this binding reads off the wire and writes onto it.
 *
 * <p>Small and hand-written on purpose. The engine's payloads are an append-only wire this SDK does
 * not model — a diagnostic's typed {@code args}, the engine-info map — so what a binding needs is
 * "give me whatever is there", not a mapper. Taking Jackson for that would put a large dependency
 * into every application's classpath to read a handful of flat objects, and the runtime dependency
 * list stays at exactly one entry (JNA) for the same reason the ruby reference has only fiddle.
 *
 * <p>Numbers come back as {@link Long} when they are integral and {@link Double} otherwise, which
 * is what the payloads actually contain: page counts and diagnostic arguments.
 */
final class Json {

  private final String source;
  private int at;

  private Json(String source) {
    this.source = source;
    this.at = 0;
  }

  /**
   * Parses a payload.
   *
   * @param payload the JSON text
   * @return a Map, List, String, Long, Double, Boolean, or null
   */
  static Object parse(String payload) {
    Json reader = new Json(payload);
    reader.skipSpace();
    Object value = reader.readValue();
    reader.skipSpace();
    if (reader.at != payload.length()) {
      throw new IllegalArgumentException("trailing content at " + reader.at);
    }
    return value;
  }

  /**
   * Parses a payload expected to be an object.
   *
   * @param payload the JSON text, possibly empty
   * @return the object's entries, or an empty map when there is nothing to read
   */
  @SuppressWarnings("unchecked")
  static Map<String, Object> object(String payload) {
    if (payload == null || payload.isEmpty()) {
      return Map.of();
    }
    Object parsed = parse(payload);
    return parsed instanceof Map ? (Map<String, Object>) parsed : Map.of();
  }

  /**
   * Writes a value as JSON.
   *
   * <p>Non-ASCII crosses as UTF-8 rather than as {@code \\uXXXX} escapes: the engine's surface is
   * UTF-8 by contract, so escaping would only make the payload bigger.
   *
   * @param value a Map, Iterable, String, Number, Boolean, or null
   * @return the JSON text
   */
  static String write(Object value) {
    StringBuilder out = new StringBuilder();
    writeValue(value, out);
    return out.toString();
  }

  private static void writeValue(Object value, StringBuilder out) {
    switch (value) {
      case null -> out.append("null");
      case String text -> writeString(text, out);
      case Boolean flag -> out.append(flag.booleanValue());
      case Number number -> out.append(number);
      case Map<?, ?> map -> writeMap(map, out);
      case Iterable<?> items -> writeList(items, out);
      default ->
          throw new UsageException(
              "params could not be serialized as UTF-8 JSON: "
                  + value.getClass().getName()
                  + " is not a map, list, string, number or boolean");
    }
  }

  private static void writeMap(Map<?, ?> map, StringBuilder out) {
    out.append('{');
    boolean first = true;
    for (Map.Entry<?, ?> entry : map.entrySet()) {
      if (!first) {
        out.append(',');
      }
      first = false;
      writeString(String.valueOf(entry.getKey()), out);
      out.append(':');
      writeValue(entry.getValue(), out);
    }
    out.append('}');
  }

  private static void writeList(Iterable<?> items, StringBuilder out) {
    out.append('[');
    boolean first = true;
    for (Object item : items) {
      if (!first) {
        out.append(',');
      }
      first = false;
      writeValue(item, out);
    }
    out.append(']');
  }

  private static void writeString(String text, StringBuilder out) {
    out.append('"');
    for (int index = 0; index < text.length(); index++) {
      char character = text.charAt(index);
      switch (character) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        default -> {
          if (character < 0x20) {
            out.append(String.format("\\u%04x", (int) character));
          } else {
            out.append(character);
          }
        }
      }
    }
    out.append('"');
  }

  private Object readValue() {
    char character = peek();
    return switch (character) {
      case '{' -> readObject();
      case '[' -> readArray();
      case '"' -> readString();
      case 't' -> readLiteral("true", Boolean.TRUE);
      case 'f' -> readLiteral("false", Boolean.FALSE);
      case 'n' -> readLiteral("null", null);
      default -> readNumber();
    };
  }

  private Map<String, Object> readObject() {
    Map<String, Object> map = new LinkedHashMap<>();
    at++;
    skipSpace();
    if (peek() == '}') {
      at++;
      return map;
    }
    while (true) {
      skipSpace();
      String key = readString();
      skipSpace();
      expect(':');
      skipSpace();
      map.put(key, readValue());
      skipSpace();
      char next = peek();
      at++;
      if (next == '}') {
        return map;
      }
      if (next != ',') {
        throw new IllegalArgumentException("expected , or } at " + (at - 1));
      }
    }
  }

  private List<Object> readArray() {
    List<Object> items = new ArrayList<>();
    at++;
    skipSpace();
    if (peek() == ']') {
      at++;
      return items;
    }
    while (true) {
      skipSpace();
      items.add(readValue());
      skipSpace();
      char next = peek();
      at++;
      if (next == ']') {
        return items;
      }
      if (next != ',') {
        throw new IllegalArgumentException("expected , or ] at " + (at - 1));
      }
    }
  }

  private String readString() {
    expect('"');
    StringBuilder text = new StringBuilder();
    while (true) {
      char character = next();
      if (character == '"') {
        return text.toString();
      }
      if (character != '\\') {
        text.append(character);
        continue;
      }
      char escape = next();
      switch (escape) {
        case '"', '\\', '/' -> text.append(escape);
        case 'b' -> text.append('\b');
        case 'f' -> text.append('\f');
        case 'n' -> text.append('\n');
        case 'r' -> text.append('\r');
        case 't' -> text.append('\t');
        case 'u' -> {
          text.append((char) Integer.parseInt(source.substring(at, at + 4), 16));
          at += 4;
        }
        default -> throw new IllegalArgumentException("bad escape at " + (at - 1));
      }
    }
  }

  private Object readNumber() {
    int start = at;
    while (at < source.length() && "+-.eE0123456789".indexOf(source.charAt(at)) >= 0) {
      at++;
    }
    String text = source.substring(start, at);
    if (text.isEmpty()) {
      throw new IllegalArgumentException("expected a value at " + start);
    }
    if (text.indexOf('.') < 0 && text.indexOf('e') < 0 && text.indexOf('E') < 0) {
      return Long.valueOf(text);
    }
    return Double.valueOf(text);
  }

  private Object readLiteral(String literal, Object value) {
    if (!source.startsWith(literal, at)) {
      throw new IllegalArgumentException("expected " + literal + " at " + at);
    }
    at += literal.length();
    return value;
  }

  private void skipSpace() {
    while (at < source.length() && Character.isWhitespace(source.charAt(at))) {
      at++;
    }
  }

  private char peek() {
    if (at >= source.length()) {
      throw new IllegalArgumentException("payload ended at " + at);
    }
    return source.charAt(at);
  }

  private char next() {
    char character = peek();
    at++;
    return character;
  }

  private void expect(char character) {
    if (next() != character) {
      throw new IllegalArgumentException("expected " + character + " at " + (at - 1));
    }
  }
}

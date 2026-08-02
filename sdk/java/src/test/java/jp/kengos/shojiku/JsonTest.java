package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The hand-written JSON, which exists so the runtime dependency list stays at one entry.
 *
 * <p>A parser this package owns is a parser this package must prove, including the shapes the
 * engine does not currently emit — a wire that is append-only will emit them eventually.
 */
class JsonTest extends Fixtures {

  @Test
  void readsEveryScalarTheWireCarries() {
    Map<String, Object> parsed =
        Json.object(
            "{\"text\":\"a\",\"whole\":7,\"fraction\":1.5,\"exponent\":1e3,"
                + "\"yes\":true,\"no\":false,\"nothing\":null}");

    assertEquals("a", parsed.get("text"));
    // Integral numbers come back as Long, which is what a page count is.
    assertEquals(7L, parsed.get("whole"));
    assertEquals(1.5, parsed.get("fraction"));
    assertEquals(1000.0, parsed.get("exponent"));
    assertEquals(Boolean.TRUE, parsed.get("yes"));
    assertEquals(Boolean.FALSE, parsed.get("no"));
    assertNull(parsed.get("nothing"));
    assertTrue(parsed.containsKey("nothing"));
  }

  @Test
  void readsNestedObjectsAndArrays() {
    Map<String, Object> parsed =
        Json.object("{\"items\":[{\"a\":1},{\"b\":[2,3]}],\"empty\":[],\"blank\":{}}");

    assertEquals(2, ((List<?>) parsed.get("items")).size());
    assertEquals(List.of(), parsed.get("empty"));
    assertEquals(Map.of(), parsed.get("blank"));
  }

  @Test
  void readsEveryStringEscape() {
    Map<String, Object> parsed =
        Json.object(
            "{\"escapes\":\"q:\\\" b:\\\\ s:\\/ bs:\\b ff:\\f nl:\\n cr:\\r tab:\\t u:\\u00e9\"}");

    assertEquals("q:\" b:\\ s:/ bs:\b ff:\f nl:\n cr:\r tab:\t u:é", parsed.get("escapes"));
  }

  @Test
  void readsNonAsciiVerbatim() {
    assertEquals("商事", Json.object("{\"name\":\"商事\"}").get("name"));
  }

  @Test
  void skipsWhitespaceWhereverItIsAllowed() {
    assertEquals(1L, Json.object("  {  \"a\"  :  1  }  ").get("a"));
  }

  @Test
  void anEmptyOrNonObjectPayloadReadsAsNoEntries() {
    // The wire is append-only and unmodelled, so a shape this SDK did not expect
    // is nothing rather than a crash.
    assertEquals(Map.of(), Json.object(""));
    assertEquals(Map.of(), Json.object(null));
    assertEquals(Map.of(), Json.object("[1,2]"));
    assertEquals(Map.of(), Json.object("7"));
  }

  @Test
  void parsesTopLevelValuesOfEveryKind() {
    assertEquals("a", Json.parse("\"a\""));
    assertEquals(List.of(1L, 2L), Json.parse("[1,2]"));
    assertEquals(Boolean.TRUE, Json.parse("true"));
    assertNull(Json.parse("null"));
  }

  @Test
  void refusesMalformedInputRatherThanGuessing() {
    assertThrows(IllegalArgumentException.class, () -> Json.parse("{"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\" 1}"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("{\"a\":1 \"b\":2}"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("[1 2]"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("tru"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("\"a\"x"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse("\"\\q\""));
    assertThrows(IllegalArgumentException.class, () -> Json.parse(":"));
    assertThrows(IllegalArgumentException.class, () -> Json.parse(""));
  }

  @Test
  void writesEveryValueTheEnvelopeCanCarry() {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("text", "a");
    map.put("whole", 7);
    map.put("fraction", 1.5);
    map.put("flag", true);
    map.put("nothing", null);
    map.put("items", List.of(1, "two"));

    assertEquals(
        "{\"text\":\"a\",\"whole\":7,\"fraction\":1.5,\"flag\":true,"
            + "\"nothing\":null,\"items\":[1,\"two\"]}",
        Json.write(map));
  }

  @Test
  void writesNonAsciiAsUtf8RatherThanEscapes() {
    // The engine's surface is UTF-8 by contract, so escaping would only make the
    // payload bigger.
    assertEquals("{\"name\":\"日本語\"}", Json.write(Map.of("name", "日本語")));
  }

  @Test
  void escapesWhatMustBeEscapedAndNothingElse() {
    assertEquals(
        "\"q:\\\" b:\\\\ nl:\\n cr:\\r tab:\\t low:\\u0007\"",
        Json.write("q:\" b:\\ nl:\n cr:\r tab:\t low:\u0007"));
  }

  @Test
  void writesEmptyContainers() {
    assertEquals("{}", Json.write(Map.of()));
    assertEquals("[]", Json.write(List.of()));
  }

  @Test
  void refusesAValueTheEnvelopeCannotCarry() {
    // Programmer misuse, named as such: there is nothing to render.
    UsageException error =
        assertThrows(UsageException.class, () -> Json.write(new java.util.Date()));

    assertTrue(error.getMessage().contains("not a map, list, string, number or boolean"));
  }
}

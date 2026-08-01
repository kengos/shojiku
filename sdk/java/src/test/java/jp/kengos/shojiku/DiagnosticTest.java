package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** A diagnostic is passed through, never interpreted. */
class DiagnosticTest extends Fixtures {

  @Test
  void aDiagnosticIsReadOffTheWireFieldForField() {
    List<Diagnostic> parsed =
        Diagnostic.parse(
            "{\"items\":[{\"severity\":\"warning\",\"code\":\"L0042\",\"category\":\"layout\","
                + "\"message\":\"box overflows\",\"path\":\"sections.body\","
                + "\"origin\":\"template\",\"args\":{\"overflow\":2.5}}]}");

    Diagnostic diagnostic = parsed.get(0);
    assertEquals(1, parsed.size());
    assertEquals("warning", diagnostic.severity());
    assertEquals("L0042", diagnostic.code());
    assertEquals("layout", diagnostic.category());
    assertEquals("box overflows", diagnostic.message());
    assertEquals("sections.body", diagnostic.path());
    assertEquals("template", diagnostic.origin());
    assertTrue(diagnostic.isWarning());
    assertFalse(diagnostic.isError());
  }

  @Test
  void typedArgsPassThroughUntranslated() {
    // The engine's frozen contract: a translating consumer renders its own message
    // from `code` and `args`, so this class parses and stops.
    Diagnostic diagnostic =
        Diagnostic.parse(
                "{\"items\":[{\"code\":\"L1\",\"args\":{\"limit\":3,\"name\":\"body\",\"ok\":true}}]}")
            .get(0);

    assertEquals(3L, diagnostic.args().get("limit"));
    assertEquals("body", diagnostic.args().get("name"));
    assertEquals(Boolean.TRUE, diagnostic.args().get("ok"));
  }

  @Test
  void anAbsentOrEmptyPayloadIsNoDiagnosticsAtAll() {
    assertEquals(List.of(), Diagnostic.parse(""));
    assertEquals(List.of(), Diagnostic.parse("{}"));
    assertEquals(List.of(), Diagnostic.parse("{\"items\":null}"));
    assertEquals(List.of(), Diagnostic.parse("{\"items\":[]}"));
  }

  @Test
  void missingFieldsAreAbsentRatherThanInvented() {
    Diagnostic diagnostic = Diagnostic.parse("{\"items\":[{}]}").get(0);

    assertNull(diagnostic.severity());
    assertNull(diagnostic.code());
    assertNull(diagnostic.category());
    assertNull(diagnostic.message());
    assertNull(diagnostic.path());
    assertNull(diagnostic.origin());
    assertEquals(java.util.Map.of(), diagnostic.args());
    assertFalse(diagnostic.isError());
    assertFalse(diagnostic.isWarning());
  }

  @Test
  void anEntryThatIsNotAnObjectIsEmptyRatherThanACrash() {
    // The wire is append-only and unmodelled, so a shape this SDK did not expect
    // is nothing rather than a crash.
    assertNull(Diagnostic.parse("{\"items\":[7]}").get(0).severity());
  }

  @Test
  void aDiagnosticPrintsItsPathAndMessage() {
    assertEquals(
        "sections.body: too wide",
        Diagnostic.parse("{\"items\":[{\"path\":\"sections.body\",\"message\":\"too wide\"}]}")
            .get(0)
            .toString());
    assertEquals(
        "too wide", Diagnostic.parse("{\"items\":[{\"message\":\"too wide\"}]}").get(0).toString());
    assertEquals("", Diagnostic.parse("{\"items\":[{}]}").get(0).toString());
  }

  @Test
  void aRealRenderCarriesRealDiagnostics() {
    Result<DocumentArtifact> result = client().build().generate("warns", null);

    assertEquals(1, result.warnings().size());
    assertNotNull(result.warnings().get(0).code());
    assertTrue(result.warnings().get(0).isWarning());
  }
}

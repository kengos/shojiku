package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The host-side log channel: what it says, and everything it must never say. */
class LogTest extends Fixtures {

  @Test
  void silentUnlessAnApplicationSuppliesALogger() {
    // A silent log costs a null check, not string formatting.
    Log log = new Log();

    log.event("library_loaded", "path", "/x");

    assertTrue(log.timed("generate", () -> Result.succeeded(null, List.of())).success());
  }

  @Test
  void anEventNamesWhatTheBindingDid() {
    List<String> lines = new ArrayList<>();

    new Log(lines::add).event("library_loaded", "path", "/x", "source", "configuration");

    assertEquals("shojiku library_loaded path=/x source=configuration", lines.get(0));
  }

  @Test
  void aTimedOperationRecordsItsVerdictAndReturnsWhatItReturned() {
    List<String> lines = new ArrayList<>();
    Result<DocumentArtifact> expected = Result.fromFailure(new Failure(Step.SIGN, "io", "no"));

    Result<DocumentArtifact> actual = new Log(lines::add).timed("sign", () -> expected);

    assertSame(expected, actual);
    assertTrue(lines.get(0).startsWith("shojiku sign"));
    assertTrue(lines.get(0).contains("ok=false"));
    assertTrue(lines.get(0).contains("ms="));
  }

  @Test
  void theLifecycleReportsWhichStepRanAndWhetherItWorked() {
    List<String> lines = new ArrayList<>();

    client().logger(lines::add).build().generate("receipt", null);

    assertTrue(
        lines.stream()
            .anyMatch(line -> line.startsWith("shojiku generate") && line.contains("ok=true")));
  }

  @Test
  void aTemplateNameCrossesBoundedRatherThanRaw() {
    // Whatever does cross is bounded and stripped exactly as the engine bounds its
    // own echoed values, so a hostile name cannot smuggle control characters into a
    // log file.
    List<String> lines = new ArrayList<>();

    client().logger(lines::add).build().generate("receipt", null);

    assertTrue(lines.stream().anyMatch(line -> line.contains("template=receipt")));
  }

  @Test
  void neitherParamsNorDocumentBytesNorDiagnosticsEverCross() {
    // BY RULE: a log line is the easiest way for a secret to leave a process, and
    // the diagnostics belong to the result the caller already holds.
    List<String> lines = new ArrayList<>();
    ShojikuClient client = client().logger(lines::add).build();

    client.generate("warns", null);
    client.generate("receipt", Map.of("customer", Map.of("name", "Yamada Shoji K.K.")));
    client.generate("broken", null);

    String log = String.join("\n", lines);
    assertFalse(lines.isEmpty());
    assertFalse(log.contains("Yamada"));
    assertFalse(log.contains("%PDF"));
    // The `warns` render emits a real diagnostic; none of its text is here.
    assertFalse(log.toLowerCase(java.util.Locale.ROOT).contains("box"));
  }

  @Test
  void anyLambdaIsALoggerSoThePackageNeedsNoLoggingDependency() {
    // Wiring this to SLF4J, Log4j or java.util.logging is `logger::debug` at the
    // call site; the dependency list stays at one entry.
    List<String> seen = new ArrayList<>();

    client()
        .logger(message -> seen.add(message.toUpperCase(java.util.Locale.ROOT)))
        .build()
        .generate("receipt", null);

    assertTrue(seen.stream().anyMatch(line -> line.startsWith("SHOJIKU ")));
  }

  @Test
  void aTimedOperationIsStillReturnedWhenNobodyIsListening() {
    Result<DocumentArtifact> expected = Result.succeeded(null, List.of());

    assertSame(expected, new Log().timed("sign", () -> expected, "template", "x"));
  }
}

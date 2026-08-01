package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The lifecycle, against the real engine. */
class ClientTest extends Fixtures {

  @Test
  void engineInfoReportsWhatThisBuildCanDo() {
    Map<String, Object> info = client().build().engineInfo();

    assertFalse(info.isEmpty());
    assertTrue(info.containsKey("version"));
  }

  @Test
  void generateRendersATemplateFromTheRoot() {
    Result<DocumentArtifact> result =
        client()
            .build()
            .generate("receipt", Map.of("customer", Map.of("name", "Yamada Shoji K.K.")));

    assertTrue(result.success());
    assertEquals(1, result.artifact().pageCount());
    assertEquals(Origin.RENDERED, result.artifact().origin());
    assertEquals(
        "%PDF", new String(Arrays.copyOf(result.artifact().bytes(), 4), StandardCharsets.US_ASCII));
  }

  @Test
  void paramsAreTakenAsSourceTextVerbatim() {
    // A String params is the caller's own source, passed through untouched: the
    // engine parses JSON or YAML, and re-encoding here would only be a chance to
    // change it. No per-format method family exists.
    Result<DocumentArtifact> result =
        client().build().generate("receipt", "customer:\n  name: Yamada Shoji K.K.\n");

    assertTrue(result.success());
  }

  @Test
  void generateWithNoParamsStillRenders() {
    assertTrue(client().build().generate("receipt", null).success());
  }

  @Test
  void generateCarriesWarningsOnASuccess() {
    // The case a caller who only inspects failures would miss.
    Result<DocumentArtifact> result = client().build().generate("warns", null);

    assertTrue(result.success());
    assertFalse(result.warnings().isEmpty());
    assertTrue(result.errors().isEmpty());
  }

  @Test
  void generateFailsWithTheEnginesDiagnosticsAttached() {
    Result<DocumentArtifact> result = client().build().generate("broken", null);

    assertTrue(result.failed());
    assertFalse(result.errors().isEmpty());
    assertFalse(result.failure().diagnostics().isEmpty());
  }

  @Test
  void aFailedRenderTracesTheSdksOwnStepNotTheEngines() {
    // The engine's error object names an INTERNAL stage; forwarding it would make
    // this field mean different things depending on which layer refused.
    Result<DocumentArtifact> result = client().build().generate("broken", null);

    assertEquals(Step.GENERATE, result.failure().step());
    assertNotEquals("unknown", result.failure().kind());
  }

  @Test
  void aPerCallLocaleBeatsTheClientWideOne() {
    ShojikuClient client = client().lang("en-US").build();

    assertTrue(
        client.generate("receipt", Map.of("customer", Map.of("name", "Y")), "ja-JP").success());
  }

  @Test
  void generateWithNoTemplateRootIsProgrammerMisuse() {
    UsageException error =
        assertThrows(UsageException.class, () -> rootless().build().generate("receipt", null));

    assertTrue(error.getMessage().contains("generateSource"));
  }

  @Test
  void paramsThatCannotBeSerializedAreProgrammerMisuse() {
    // Not a document problem: there is nothing to render, so it throws rather
    // than coming back as a failed result.
    assertThrows(
        UsageException.class, () -> client().build().generate("receipt", new java.util.Date()));
  }

  @Test
  void artifactReEntersArchivedBytesAsLoaded() {
    ShojikuClient client = client().build();
    byte[] archived = rendered(client).bytes();

    DocumentArtifact artifact = client.artifact(archived);

    assertEquals(Origin.LOADED, artifact.origin());
    assertTrue(artifact.loaded());
    // Honestly absent: nothing here laid anything out.
    assertNull(artifact.pageCount());
    org.junit.jupiter.api.Assertions.assertArrayEquals(archived, artifact.bytes());
  }

  @Test
  void theTemplateRootIsExposedForDiagnosis() {
    assertEquals(TEMPLATES, client().build().templateRootOrNull().path());
  }
}

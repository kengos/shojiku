package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The two levels of failure the C surface defines, and keeping them apart.
 *
 * <p>A non-zero status is the CALLER's mistake and throws; everything a DOCUMENT can do wrong comes
 * back as a failed result with the engine's diagnostics attached. An SDK that threw on the second
 * class would have broken the contract, not chosen an idiom.
 */
class OutcomeTest extends Fixtures {

  private static Snapshot snapshot(
      int status, boolean success, byte[] pdf, String json, String diagnostics, String error) {
    return new Snapshot(status, success, pdf, json, diagnostics, error);
  }

  private static Snapshot ok() {
    return snapshot(0, true, new byte[0], "", "", "");
  }

  @Test
  void aNonZeroStatusIsProgrammerMisuse() {
    UsageException error =
        assertThrows(
            UsageException.class,
            () -> Outcome.guard(snapshot(3, false, new byte[0], "", "", "{\"kind\":\"bad\"}")));

    assertTrue(error.getMessage().contains("status 3"));
  }

  @Test
  void aZeroStatusPassesThrough() {
    Outcome.guard(ok());
  }

  @Test
  void aDocumentFailureIsAFailedResultRatherThanAnException() {
    Result<DocumentArtifact> result =
        Outcome.document(
            snapshot(
                0,
                false,
                new byte[0],
                "",
                "{\"items\":[{\"severity\":\"error\",\"message\":\"boom\"}]}",
                "{\"kind\":\"render_failed\",\"message\":\"no\"}"),
            Step.GENERATE,
            null,
            Origin.RENDERED);

    assertTrue(result.failed());
    assertEquals("render_failed", result.failure().kind());
    assertEquals(1, result.errors().size());
  }

  @Test
  void aSuccessCarriesItsDiagnosticsToo() {
    // A render that WORKED can still have warned, and a caller that only looks at
    // failures never sees it.
    Result<DocumentArtifact> result =
        Outcome.document(
            snapshot(
                0,
                true,
                new byte[] {1, 2, 3},
                "{\"pageCount\":2}",
                "{\"items\":[{\"severity\":\"warning\",\"message\":\"cramped\"}]}",
                ""),
            Step.GENERATE,
            null,
            Origin.SOURCE);

    assertTrue(result.success());
    assertEquals(2, result.artifact().pageCount());
    assertEquals(Origin.SOURCE, result.artifact().origin());
    assertEquals(1, result.warnings().size());
  }

  @Test
  void aPageCountIsAbsentRatherThanZeroWhenNothingLaidAnythingOut() {
    // Signing appends a revision to bytes it never measured, and the surface
    // returns no JSON payload for it at all.
    Result<DocumentArtifact> signed =
        Outcome.document(
            snapshot(0, true, new byte[] {1}, "", "", ""), Step.SIGN, null, Origin.RENDERED);

    assertNull(signed.artifact().pageCount());
  }

  @Test
  void aJsonPayloadWithoutAPageCountIsAbsentToo() {
    Result<DocumentArtifact> result =
        Outcome.document(
            snapshot(0, true, new byte[] {1}, "{\"other\":1}", "", ""),
            Step.GENERATE,
            null,
            Origin.RENDERED);

    assertNull(result.artifact().pageCount());
  }

  @Test
  void aVerdictParsesItsReportBeforeReadingTheVerdict() {
    // Because the report rides a FAILED verify too — that is the whole point of
    // carrying notChecked.
    Result<VerificationReport> result =
        Outcome.verdict(
            snapshot(
                0,
                false,
                new byte[0],
                "{\"valid\":false,\"notChecked\":[\"revocation\"]}",
                "",
                "{\"kind\":\"signature\",\"message\":\"digest mismatch\"}"));

    assertTrue(result.failed());
    assertNotNull(result.report());
    assertEquals(List.of("revocation"), result.report().notChecked());
    assertEquals(Step.VERIFY, result.failure().step());
    assertEquals("signature", result.failure().kind());
  }

  @Test
  void aVerdictWithNoPayloadCarriesNoReportAndThatAbsenceIsData() {
    // A different fact from an empty report: there was nothing to evaluate.
    Result<VerificationReport> result = Outcome.verdict(ok());

    assertTrue(result.success());
    assertNull(result.report());
  }

  @Test
  void aVerdictCarriesDiagnosticsOnBothPaths() {
    // Same reason they ride a render: whatever the engine noticed belongs to the
    // caller, and an operation that drops them makes its result mean something
    // different from every other operation's.
    String diagnostics = "{\"items\":[{\"severity\":\"warning\",\"message\":\"noted\"}]}";

    assertEquals(
        1,
        Outcome.verdict(snapshot(0, true, new byte[0], "{\"valid\":true}", diagnostics, ""))
            .warnings()
            .size());
    assertEquals(
        1, Outcome.verdict(snapshot(0, false, new byte[0], "", diagnostics, "")).warnings().size());
  }

  @Test
  void theGuardRunsBeforeEitherKindOfResultIsBuilt() {
    // A caller error is not a document outcome, on any path.
    Snapshot refused = snapshot(1, false, new byte[0], "", "", "");

    assertThrows(
        UsageException.class, () -> Outcome.document(refused, Step.GENERATE, null, Origin.LOADED));
    assertThrows(UsageException.class, () -> Outcome.verdict(refused));
  }
}

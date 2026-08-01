package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The report, including what verification did NOT look at. */
class VerificationReportTest extends Fixtures {

  @Test
  void theFourChecksStaySeparate() {
    // "Valid but covering only part of the file" is a different fact from "the
    // signature is wrong", and a caller that cannot tell them apart cannot explain
    // the answer to anyone.
    VerificationReport report =
        VerificationReport.parse(
            "{\"valid\": false,"
                + "\"signature\": {\"status\": \"passed\"},"
                + "\"coverage\": {\"status\": \"failed\", \"reason\": \"byte range stops short\"},"
                + "\"certificateValidity\": {\"status\": \"passed\"},"
                + "\"trustChain\": {\"status\": \"failed\", \"reason\": \"no anchor\"},"
                + "\"notChecked\": [\"revocation\", \"timestamp\"]}");

    assertFalse(report.valid());
    assertTrue(report.signature().passed());
    assertFalse(report.coverage().passed());
    assertEquals("byte range stops short", report.coverage().reason());
    assertTrue(report.certificateValidity().passed());
    assertFalse(report.trustChain().passed());
    assertEquals(4, report.checks().size());
  }

  @Test
  void notCheckedIsAFieldRatherThanAFootnote() {
    // A "valid" verdict that quietly skipped revocation is worse than no verifier
    // at all: it turns a missing capability into a false assurance.
    VerificationReport report =
        VerificationReport.parse("{\"valid\": true, \"notChecked\": [\"revocation\"]}");

    assertTrue(report.valid());
    assertEquals(List.of("revocation"), report.notChecked());
  }

  @Test
  void anAbsentCheckIsAbsentRatherThanPassed() {
    VerificationReport report = VerificationReport.parse("{\"valid\": false}");

    assertNull(report.signature().status());
    assertFalse(report.signature().passed());
    assertEquals(List.of(), report.notChecked());
  }

  @Test
  void validIsTrueOnlyForAnExplicitTrue() {
    assertFalse(VerificationReport.parse("{}").valid());
    assertFalse(VerificationReport.parse("{\"valid\": false}").valid());
    assertFalse(VerificationReport.parse("{\"valid\": \"yes\"}").valid());
    assertTrue(VerificationReport.parse("{\"valid\": true}").valid());
  }

  @Test
  void aCheckPrintsItsStatusAndReason() {
    assertEquals(
        "failed: no anchor",
        VerificationReport.parse(
                "{\"trustChain\":{\"status\":\"failed\",\"reason\":\"no anchor\"}}")
            .trustChain()
            .toString());
    assertEquals(
        "passed",
        VerificationReport.parse("{\"trustChain\":{\"status\":\"passed\"}}")
            .trustChain()
            .toString());
    assertEquals("", VerificationReport.parse("{}").trustChain().toString());
  }

  @Test
  void nonStringEntriesInNotCheckedAreSkippedRatherThanCrashed() {
    // The wire is append-only and this SDK does not model it, so a shape it did not
    // expect is dropped rather than thrown over.
    assertEquals(
        List.of("revocation"),
        VerificationReport.parse("{\"notChecked\":[\"revocation\", 7, null]}").notChecked());
    assertEquals(
        List.of(), VerificationReport.parse("{\"notChecked\":\"revocation\"}").notChecked());
  }
}

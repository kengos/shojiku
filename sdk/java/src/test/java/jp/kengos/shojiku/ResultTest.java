package jp.kengos.shojiku;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/** The result wrapper, and the one place this API deliberately throws. */
class ResultTest extends Fixtures {

  private static Failure aFailure() {
    return new Failure(Step.GENERATE, "template_name", "no");
  }

  @Test
  void aSuccessCarriesItsValueUnderEveryAliasItHas() {
    VerificationReport report = VerificationReport.parse("{\"valid\": true}");

    Result<VerificationReport> result = Result.succeeded(report, List.of());

    assertTrue(result.success());
    assertFalse(result.failed());
    assertSame(report, result.value());
    assertSame(report, result.report());
    assertSame(report, result.artifact());
    assertNull(result.failure());
  }

  @Test
  void aFailureCarriesTheTraceAndItsDiagnostics() {
    List<Diagnostic> diagnostics =
        Diagnostic.parse("{\"items\":[{\"severity\":\"error\",\"message\":\"boom\"}]}");
    Failure failure = new Failure(Step.SIGN, "io", "nope", diagnostics, null);

    Result<DocumentArtifact> result = Result.fromFailure(failure);

    assertTrue(result.failed());
    assertSame(failure, result.failure());
    assertNull(result.value());
    // The failure's diagnostics ride on the result, so a caller that only looks at
    // the result still sees what the engine noticed.
    assertEquals(1, result.diagnostics().size());
  }

  @Test
  void severitySlicesSplitWhatTheEngineNoticed() {
    List<Diagnostic> diagnostics =
        Diagnostic.parse(
            "{\"items\":[{\"severity\":\"error\",\"message\":\"a\"},"
                + "{\"severity\":\"warning\",\"message\":\"b\"},"
                + "{\"severity\":\"info\",\"message\":\"c\"}]}");

    Result<DocumentArtifact> result = Result.succeeded(null, diagnostics);

    assertEquals(3, result.diagnostics().size());
    assertEquals(1, result.errors().size());
    assertEquals(1, result.warnings().size());
  }

  @Test
  void unwrapOnASuccessIsTheValue() {
    VerificationReport report = VerificationReport.parse("{\"valid\": true}");

    assertSame(report, Result.succeeded(report, List.of()).unwrap());
  }

  @Test
  void unwrapOnAFailedResultIsProgrammerMisuse() {
    // The frozen ruling, stated rather than implied: a caller who has not checked
    // success is asserting the operation worked. The failure travels on the
    // exception, so nothing is lost by taking the short road.
    Failure failure = aFailure();

    UnwrapException error =
        assertThrows(UnwrapException.class, () -> Result.fromFailure(failure).unwrap());

    assertSame(failure, error.failure());
    assertTrue(error.getMessage().contains("template_name"));
  }

  @Test
  void aValuelessSuccessUnwrapsToNothingRatherThanThrowing() {
    // Reachable: a verify whose payload was empty succeeds with no report, and
    // that absence is data.
    assertNull(new Result<VerificationReport>(null, List.of(), null).unwrap());
  }

  @Test
  void everyShojikuExceptionSharesOneBase() {
    // So an application can catch the package rather than enumerate it.
    assertTrue(new UsageException("x") instanceof ShojikuException);
    assertTrue(new UnwrapException(aFailure()) instanceof ShojikuException);
    assertTrue(new LibraryNotFoundException("x") instanceof ShojikuException);
    assertTrue(new AbiMismatchException("x") instanceof ShojikuException);
    assertTrue(new MaterialUnreadableException("io", "x") instanceof ShojikuException);
    // Unchecked, so failure-as-data is not undermined by a checked exception
    // forcing try/catch onto every call site.
    assertTrue(new UsageException("x") instanceof RuntimeException);
  }

  @Test
  void anExceptionCanCarryTheOneUnderneathIt() {
    IllegalStateException inner = new IllegalStateException("root cause");

    assertSame(inner, new UsageException("x", inner).getCause());
    assertSame(inner, new ShojikuException("x", inner).getCause());
    assertSame(inner, new LibraryNotFoundException("x", inner).getCause());
  }

  @Test
  void materialUnreadableCarriesTheKindTheTraceReports() {
    assertEquals("key_unreadable", new MaterialUnreadableException("key_unreadable", "x").kind());
  }
}

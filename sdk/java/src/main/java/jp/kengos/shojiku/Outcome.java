package jp.kengos.shojiku;

import java.util.List;
import java.util.Map;

/**
 * Turning one engine snapshot into the result an application sees.
 *
 * <p>The C surface's two levels of failure meet here, and keeping them apart is the whole job: a
 * non-zero status is the CALLER's mistake and throws, while everything a DOCUMENT can do wrong
 * comes back as a failed result with the engine's diagnostics attached.
 */
final class Outcome {

  private Outcome() {}

  /**
   * Throw for the caller-error level.
   *
   * <p>A non-zero status is the C surface saying the CALLER got it wrong — a null pointer, a
   * request the schema rejects, an argument past a hard cap. That is programmer misuse in Java
   * terms, so it throws.
   */
  static void guard(Snapshot snapshot) {
    if (snapshot.status() == 0) {
      return;
    }
    throw new UsageException(
        "the engine refused the call (status " + snapshot.status() + "): " + snapshot.error());
  }

  /**
   * A rendered or signed document.
   *
   * <p>Diagnostics are attached either way: a render that WORKED can still have warned.
   */
  static Result<DocumentArtifact> document(
      Snapshot snapshot, Step step, ShojikuClient client, Origin origin) {
    guard(snapshot);
    List<Diagnostic> diagnostics = Diagnostic.parse(snapshot.diagnostics());
    if (!snapshot.success()) {
      return Result.fromFailure(Failure.fromErrorJson(snapshot.error(), step, diagnostics, null));
    }
    DocumentArtifact artifact =
        new DocumentArtifact(
            snapshot.pdf(), diagnostics, client, pageCount(snapshot.json()), origin);
    return Result.succeeded(artifact, diagnostics);
  }

  /**
   * A verification verdict.
   *
   * <p>The report is parsed BEFORE the verdict is read, because it rides a FAILED verify too — that
   * is the whole point of carrying {@code notChecked}. Diagnostics are parsed on both paths for the
   * same reason they are on a render: whatever the engine noticed belongs to the caller, and an
   * operation that drops them makes its result mean something different from every other
   * operation's.
   */
  static Result<VerificationReport> verdict(Snapshot snapshot) {
    guard(snapshot);
    List<Diagnostic> diagnostics = Diagnostic.parse(snapshot.diagnostics());
    VerificationReport report =
        snapshot.json().isEmpty() ? null : VerificationReport.parse(snapshot.json());
    if (snapshot.success()) {
      // Constructed directly rather than through `succeeded`: a verdict whose
      // payload was empty carries no report, and that absence is data — it is a
      // different fact from an empty report.
      return new Result<>(report, diagnostics, null);
    }
    return new Result<>(
        report,
        diagnostics,
        Failure.fromErrorJson(snapshot.error(), Step.VERIFY, diagnostics, null));
  }

  /**
   * Absent (not zero) on a signed artifact.
   *
   * <p>Signing appends a revision to bytes it never laid out, and the surface returns no JSON
   * payload for it at all.
   */
  private static Integer pageCount(String payload) {
    Map<String, Object> parsed = Json.object(payload);
    Object count = parsed.get("pageCount");
    return count instanceof Number number ? number.intValue() : null;
  }
}

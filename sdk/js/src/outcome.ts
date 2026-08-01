/**
 * Turning one engine snapshot into the result an application sees.
 *
 * The addon's two levels of failure meet here, and keeping them apart is the
 * whole job: a non-zero status is the CALLER's mistake and throws, while
 * everything a DOCUMENT can do wrong comes back as a failed result with the
 * engine's diagnostics attached.
 */

import type { Origin } from './artifact.js';
import { DocumentArtifact } from './artifact.js';
import type { Client } from './client.js';
import { Diagnostic } from './diagnostic.js';
import { UsageError } from './errors.js';
import type { Step } from './failure.js';
import { Failure } from './failure.js';
import type { Snapshot } from './library.js';
import { Result } from './result.js';
import { VerificationReport } from './verificationReport.js';

/**
 * Throw for the caller-error level.
 *
 * A non-zero status is the engine saying the CALLER got it wrong — a request
 * the schema rejects, bytes that are not UTF-8, an argument past a hard cap.
 * That is programmer misuse in JavaScript terms, so it throws.
 */
export function guard(snapshot: Snapshot): void {
  if (snapshot.status === 0) {
    return;
  }

  throw new UsageError(
    `the engine refused the call (status ${snapshot.status}): ${snapshot.error}`,
  );
}

/**
 * A rendered or signed document.
 *
 * Diagnostics are attached either way: a render that WORKED can still have
 * warned.
 */
export function document(
  snapshot: Snapshot,
  step: Step,
  client: Client,
  origin: Origin,
): Result<DocumentArtifact> {
  guard(snapshot);
  const diagnostics = Diagnostic.parse(snapshot.diagnostics);
  if (!snapshot.success) {
    return Result.fromFailure(Failure.fromErrorJson(snapshot.error, step, diagnostics));
  }

  const artifact = new DocumentArtifact({
    bytes: snapshot.pdf,
    diagnostics,
    client,
    pageCount: pageCount(snapshot.json),
    origin,
  });
  return Result.succeeded(artifact, diagnostics);
}

/**
 * A verification verdict.
 *
 * The report is parsed BEFORE the verdict is read, because it rides a FAILED
 * verify too — that is the whole point of carrying `notChecked`. Diagnostics
 * are parsed on both paths for the same reason they are on a render: whatever
 * the engine noticed belongs to the caller, and an operation that drops them
 * makes its result mean something different from every other operation's.
 */
export function verdict(snapshot: Snapshot): Result<VerificationReport> {
  guard(snapshot);
  const diagnostics = Diagnostic.parse(snapshot.diagnostics);
  const report = snapshot.json ? VerificationReport.parse(snapshot.json) : null;
  if (snapshot.success) {
    // Constructed directly rather than through `succeeded`: a verdict whose
    // payload was empty carries no report, and that absence is data — it is a
    // different fact from an empty report.
    return new Result(report, diagnostics);
  }

  const failure = Failure.fromErrorJson(snapshot.error, 'verify', diagnostics);
  return new Result(report, diagnostics, failure);
}

/**
 * Absent (not zero) on a signed artifact.
 *
 * Signing appends a revision to bytes it never laid out, and the surface
 * returns no JSON payload for it at all.
 */
function pageCount(payload: string): number | null {
  if (!payload) {
    return null;
  }
  const count: unknown = JSON.parse(payload).pageCount;
  return typeof count === 'number' ? count : null;
}

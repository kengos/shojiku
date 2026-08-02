// Turning one engine snapshot into the result an application sees.
//
// The C surface's two levels of failure meet here, and keeping them apart is the
// whole job: a non-zero status is the CALLER's mistake and throws, while
// everything a DOCUMENT can do wrong comes back as a failed result with the
// engine's diagnostics attached.

using System.Text.Json;

namespace Shojiku;

internal static class Outcome
{
    /// <summary>
    /// Throw for the caller-error level.
    /// </summary>
    /// <remarks>
    /// A non-zero status is the C surface saying the CALLER got it wrong — a
    /// null pointer, a request the schema rejects, an argument past a hard cap.
    /// That is programmer misuse in .NET terms, so it throws.
    /// </remarks>
    internal static void Guard(Snapshot snapshot)
    {
        if (snapshot.Status == 0)
        {
            return;
        }

        throw new UsageException(
            $"the engine refused the call (status {snapshot.Status}): {snapshot.Error}");
    }

    /// <summary>
    /// A rendered or signed document.
    /// </summary>
    /// <remarks>Diagnostics are attached either way: a render that WORKED can still have warned.</remarks>
    internal static Result<DocumentArtifact> Document(
        Snapshot snapshot,
        Step step,
        ShojikuClient client,
        Origin origin)
    {
        Guard(snapshot);
        var diagnostics = Diagnostic.Parse(snapshot.Diagnostics);
        if (!snapshot.Success)
        {
            return Result<DocumentArtifact>.FromFailure(
                Failure.FromErrorJson(snapshot.Error, step, diagnostics));
        }

        var artifact = new DocumentArtifact(
            snapshot.Pdf,
            diagnostics,
            client,
            PageCount(snapshot.Json),
            origin);
        return Result<DocumentArtifact>.Succeeded(artifact, diagnostics);
    }

    /// <summary>
    /// A verification verdict.
    /// </summary>
    /// <remarks>
    /// The report is parsed BEFORE the verdict is read, because it rides a
    /// FAILED verify too — that is the whole point of carrying
    /// <c>notChecked</c>. Diagnostics are parsed on both paths for the same
    /// reason they are on a render: whatever the engine noticed belongs to the
    /// caller, and an operation that drops them makes its result mean something
    /// different from every other operation's.
    /// </remarks>
    internal static Result<VerificationReport> Verdict(Snapshot snapshot)
    {
        Guard(snapshot);
        var diagnostics = Diagnostic.Parse(snapshot.Diagnostics);
        var report = string.IsNullOrEmpty(snapshot.Json) ? null : VerificationReport.Parse(snapshot.Json);
        if (snapshot.Success)
        {
            // Constructed directly rather than through `Succeeded`: a verdict
            // whose payload was empty carries no report, and that absence is
            // data — it is a different fact from an empty report.
            return new Result<VerificationReport>(report, diagnostics);
        }

        var failure = Failure.FromErrorJson(snapshot.Error, Step.Verify, diagnostics);
        return new Result<VerificationReport>(report, diagnostics, failure);
    }

    /// <summary>
    /// Absent (not zero) on a signed artifact.
    /// </summary>
    /// <remarks>
    /// Signing appends a revision to bytes it never laid out, and the surface
    /// returns no JSON payload for it at all.
    /// </remarks>
    private static int? PageCount(string payload)
    {
        if (string.IsNullOrEmpty(payload))
        {
            return null;
        }

        using var document = JsonDocument.Parse(payload);
        if (document.RootElement.ValueKind != JsonValueKind.Object
            || !document.RootElement.TryGetProperty("pageCount", out var count)
            || count.ValueKind != JsonValueKind.Number)
        {
            return null;
        }

        return count.GetInt32();
    }
}

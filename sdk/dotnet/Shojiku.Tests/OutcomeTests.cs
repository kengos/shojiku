// The two levels of failure the C surface defines, and keeping them apart.
//
// A non-zero status is the CALLER's mistake and throws; everything a DOCUMENT
// can do wrong comes back as a failed result with the engine's diagnostics
// attached. An SDK that raised on the second class would have broken the
// contract, not chosen an idiom.

using Xunit;

namespace Shojiku.Tests;

public sealed class OutcomeTests(EngineFixture engine) : ShojikuTest(engine)
{
    private static Snapshot Snapshot(
        int status = 0,
        bool success = true,
        byte[]? pdf = null,
        string json = "",
        string diagnostics = "",
        string error = "") =>
        new(status, success, pdf ?? [], json, diagnostics, error);

    [Fact]
    public void ANonZeroStatusIsProgrammerMisuse()
    {
        var error = Assert.Throws<UsageException>(() =>
            Outcome.Guard(Snapshot(status: 3, error: """{"kind":"bad_request"}""")));

        Assert.Contains("status 3", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AZeroStatusPassesThrough()
    {
        Outcome.Guard(Snapshot());
    }

    [Fact]
    public void ADocumentFailureIsAFailedResultRatherThanAnException()
    {
        var result = Outcome.Document(
            Snapshot(success: false, error: """{"kind":"render_failed","message":"no"}""",
                diagnostics: """{"items":[{"severity":"error","message":"boom"}]}"""),
            Step.Generate,
            null!,
            Origin.Rendered);

        Assert.True(result.Failed);
        Assert.Equal("render_failed", result.Failure!.Kind);
        Assert.Single(result.Errors);
    }

    [Fact]
    public void ASuccessCarriesItsDiagnosticsToo()
    {
        // A render that WORKED can still have warned, and a caller that only
        // looks at failures never sees it.
        var result = Outcome.Document(
            Snapshot(pdf: [1, 2, 3], json: """{"pageCount":2}""",
                diagnostics: """{"items":[{"severity":"warning","message":"cramped"}]}"""),
            Step.Generate,
            null!,
            Origin.Source);

        Assert.True(result.Success);
        Assert.Equal(2, result.Artifact!.PageCount);
        Assert.Equal(Origin.Source, result.Artifact.Origin);
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void APageCountIsAbsentRatherThanZeroWhenNothingLaidAnythingOut()
    {
        // Signing appends a revision to bytes it never measured, and the surface
        // returns no JSON payload for it at all.
        var signed = Outcome.Document(Snapshot(pdf: [1]), Step.Sign, null!, Origin.Rendered);

        Assert.Null(signed.Artifact!.PageCount);
    }

    [Fact]
    public void AJsonPayloadWithoutAPageCountIsAbsentToo()
    {
        var result = Outcome.Document(Snapshot(pdf: [1], json: """{"other":1}"""), Step.Generate, null!, Origin.Rendered);

        Assert.Null(result.Artifact!.PageCount);
    }

    [Fact]
    public void AVerdictParsesItsReportBEFOREReadingTheVerdict()
    {
        // Because the report rides a FAILED verify too — that is the whole point
        // of carrying notChecked.
        var result = Outcome.Verdict(Snapshot(
            success: false,
            json: """{"valid":false,"notChecked":["revocation"]}""",
            error: """{"kind":"signature","message":"digest mismatch"}"""));

        Assert.True(result.Failed);
        Assert.NotNull(result.Report);
        Assert.Equal(["revocation"], result.Report!.NotChecked);
        Assert.Equal(Step.Verify, result.Failure!.Step);
        Assert.Equal("signature", result.Failure.Kind);
    }

    [Fact]
    public void AVerdictWithNoPayloadCarriesNoReportAndThatAbsenceIsData()
    {
        // A different fact from an empty report: there was nothing to evaluate.
        var result = Outcome.Verdict(Snapshot(success: true));

        Assert.True(result.Success);
        Assert.Null(result.Report);
    }

    [Fact]
    public void AVerdictCarriesDiagnosticsOnBothPaths()
    {
        // Same reason they ride a render: whatever the engine noticed belongs to
        // the caller, and an operation that drops them makes its result mean
        // something different from every other operation's.
        var diagnostics = """{"items":[{"severity":"warning","message":"noted"}]}""";

        Assert.Single(Outcome.Verdict(Snapshot(json: """{"valid":true}""", diagnostics: diagnostics)).Warnings);
        Assert.Single(Outcome.Verdict(Snapshot(success: false, diagnostics: diagnostics)).Warnings);
    }

    [Fact]
    public void TheGuardRunsBeforeEitherKindOfResultIsBuilt()
    {
        // A caller error is not a document outcome, on any path.
        Assert.Throws<UsageException>(() => Outcome.Document(Snapshot(status: 1), Step.Generate, null!, Origin.Loaded));
        Assert.Throws<UsageException>(() => Outcome.Verdict(Snapshot(status: 1)));
    }
}

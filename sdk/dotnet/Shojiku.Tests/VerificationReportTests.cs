// The report, including what verification did NOT look at.

using System.Text.Json;
using Xunit;

namespace Shojiku.Tests;

public sealed class VerificationReportTests(EngineFixture engine) : ShojikuTest(engine)
{
    /// <summary>Parses a report payload, for the suites that build one by hand.</summary>
    internal static VerificationReport Parse(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        return new VerificationReport(document.RootElement);
    }

    [Fact]
    public void TheFourChecksStaySeparate()
    {
        // "Valid but covering only part of the file" is a different fact from
        // "the signature is wrong", and a caller that cannot tell them apart
        // cannot explain the answer to anyone.
        var report = Parse(
            """
            {"valid": false,
             "signature": {"status": "passed"},
             "coverage": {"status": "failed", "reason": "byte range stops short"},
             "certificateValidity": {"status": "passed"},
             "trustChain": {"status": "failed", "reason": "no anchor"},
             "notChecked": ["revocation", "timestamp"]}
            """);

        Assert.False(report.Valid);
        Assert.True(report.Signature.Passed);
        Assert.False(report.Coverage.Passed);
        Assert.Equal("byte range stops short", report.Coverage.Reason);
        Assert.True(report.CertificateValidity.Passed);
        Assert.False(report.TrustChain.Passed);
        Assert.Equal(4, report.Checks.Count);
    }

    [Fact]
    public void NotCheckedIsAFieldRatherThanAFootnote()
    {
        // A "valid" verdict that quietly skipped revocation is worse than no
        // verifier at all: it turns a missing capability into a false assurance.
        var report = Parse("""{"valid": true, "notChecked": ["revocation"]}""");

        Assert.True(report.Valid);
        Assert.Equal(["revocation"], report.NotChecked);
    }

    [Fact]
    public void AnAbsentCheckIsAbsentRatherThanPassed()
    {
        var report = Parse("""{"valid": false}""");

        Assert.Null(report.Signature.Status);
        Assert.False(report.Signature.Passed);
        Assert.Empty(report.NotChecked);
    }

    [Fact]
    public void ValidIsTrueOnlyForAnExplicitTrue()
    {
        Assert.False(Parse("{}").Valid);
        Assert.False(Parse("""{"valid": false}""").Valid);
        Assert.False(Parse("""{"valid": "yes"}""").Valid);
        Assert.True(Parse("""{"valid": true}""").Valid);
    }

    [Fact]
    public void ACheckPrintsItsStatusAndReason()
    {
        Assert.Equal("failed: no anchor", Parse("""{"trustChain":{"status":"failed","reason":"no anchor"}}""").TrustChain.ToString());
        Assert.Equal("passed", Parse("""{"trustChain":{"status":"passed"}}""").TrustChain.ToString());
        Assert.Equal("", Parse("{}").TrustChain.ToString());
    }

    [Fact]
    public void NonStringEntriesInNotCheckedAreSkippedRatherThanCrashed()
    {
        // The wire is append-only and this SDK does not model it, so a shape it
        // did not expect is dropped rather than thrown over.
        Assert.Equal(["revocation"], Parse("""{"notChecked":["revocation", 7, null]}""").NotChecked);
        Assert.Empty(Parse("""{"notChecked":"revocation"}""").NotChecked);
    }
}

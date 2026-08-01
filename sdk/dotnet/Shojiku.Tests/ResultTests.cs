// The result wrapper: what every lifecycle operation returns, and the one place
// this API deliberately throws.

using Xunit;

namespace Shojiku.Tests;

public sealed class ResultTests(EngineFixture engine) : ShojikuTest(engine)
{
    private static Failure AFailure() => new(Step.Generate, "template_name", "no");

    [Fact]
    public void ASuccessCarriesItsValueUnderEveryAliasItHas()
    {
        var report = VerificationReportTests.Parse("""{"valid": true}""");

        var result = Result<VerificationReport>.Succeeded(report, []);

        Assert.True(result.Success);
        Assert.False(result.Failed);
        Assert.Same(report, result.Value);
        Assert.Same(report, result.Report);
        Assert.Same(report, result.Artifact);
        Assert.Null(result.Failure);
    }

    [Fact]
    public void AFailureCarriesTheTraceAndItsDiagnostics()
    {
        var diagnostics = Diagnostic.Parse("""{"items":[{"severity":"error","message":"boom"}]}""");
        var failure = new Failure(Step.Sign, "io", "nope", diagnostics);

        var result = Result<DocumentArtifact>.FromFailure(failure);

        Assert.True(result.Failed);
        Assert.Same(failure, result.Failure);
        Assert.Null(result.Value);
        // The failure's diagnostics ride on the result, so a caller that only
        // looks at the result still sees what the engine noticed.
        Assert.Single(result.Diagnostics);
    }

    [Fact]
    public void SeveritySlicesSplitWhatTheEngineNoticed()
    {
        var diagnostics = Diagnostic.Parse(
            """{"items":[{"severity":"error","message":"a"},{"severity":"warning","message":"b"},{"severity":"info","message":"c"}]}""");

        var result = Result<DocumentArtifact>.Succeeded(null!, diagnostics);

        Assert.Equal(3, result.Diagnostics.Count);
        Assert.Single(result.Errors);
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void UnwrapOnASuccessIsTheValue()
    {
        var report = VerificationReportTests.Parse("""{"valid": true}""");

        Assert.Same(report, Result<VerificationReport>.Succeeded(report, []).Unwrap());
    }

    [Fact]
    public void UnwrapOnAFailedResultIsProgrammerMisuse()
    {
        // The frozen ruling, stated rather than implied: a caller who has not
        // checked Success is asserting the operation worked. The failure travels
        // on the exception, so nothing is lost by taking the short road.
        var failure = AFailure();

        var error = Assert.Throws<UnwrapException>(() => Result<DocumentArtifact>.FromFailure(failure).Unwrap());

        Assert.Same(failure, error.Failure);
        Assert.Contains("template_name", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AValuelessSuccessUnwrapsToNothingRatherThanThrowing()
    {
        // Reachable: a verify whose payload was empty succeeds with no report,
        // and that absence is data.
        Assert.Null(new Result<VerificationReport>().Unwrap());
    }

    [Fact]
    public void EveryShojikuExceptionSharesOneBase()
    {
        // So an application can catch the package rather than enumerate it.
        Assert.IsAssignableFrom<ShojikuException>(new UsageException("x"));
        Assert.IsAssignableFrom<ShojikuException>(new UnwrapException(AFailure()));
        Assert.IsAssignableFrom<ShojikuException>(new LibraryNotFoundException("x"));
        Assert.IsAssignableFrom<ShojikuException>(new AbiMismatchException("x"));
        Assert.IsAssignableFrom<ShojikuException>(new MaterialUnreadableException("io", "x"));
    }

    [Fact]
    public void AnExceptionCanCarryTheOneUnderneathIt()
    {
        var inner = new InvalidOperationException("root cause");

        Assert.Same(inner, new UsageException("x", inner).InnerException);
        Assert.Same(inner, new ShojikuException("x", inner).InnerException);
        Assert.Same(inner, new LibraryNotFoundException("x", inner).InnerException);
        Assert.Same(inner, new AbiMismatchException("x", inner).InnerException);
    }
}

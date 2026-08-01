// The host-side log channel: what it says, and everything it must never say.

using Xunit;

namespace Shojiku.Tests;

public sealed class LogTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void SilentUnlessAnApplicationSuppliesALogger()
    {
        // A silent log costs a null check, not string formatting.
        var log = new Log();

        log.Event("library_loaded", ("path", "/x"));
        var result = log.Timed("generate", () => Result<DocumentArtifact>.Succeeded(null!, []));

        Assert.True(result.Success);
    }

    [Fact]
    public void AnEventNamesWhatTheBindingDid()
    {
        var lines = new List<string>();

        new Log(new DelegateLogger(lines.Add)).Event("library_loaded", ("path", "/x"), ("source", "configuration"));

        Assert.Equal("shojiku library_loaded path=/x source=configuration", Assert.Single(lines));
    }

    [Fact]
    public void ATimedOperationRecordsItsVerdictAndReturnsWhatItReturned()
    {
        var lines = new List<string>();
        var log = new Log(new DelegateLogger(lines.Add));
        var expected = Result<DocumentArtifact>.FromFailure(new Failure(Step.Sign, "io", "no"));

        var actual = log.Timed("sign", () => expected);

        Assert.Same(expected, actual);
        Assert.Contains("shojiku sign", Assert.Single(lines), StringComparison.Ordinal);
        Assert.Contains("ok=False", lines[0], StringComparison.Ordinal);
        Assert.Contains("ms=", lines[0], StringComparison.Ordinal);
    }

    [Fact]
    public void TheLifecycleReportsWhichStepRanAndWhetherItWorked()
    {
        var lines = new List<string>();
        var client = Engine.Client(logger: new DelegateLogger(lines.Add));

        client.Generate("receipt");

        Assert.Contains(lines, line => line.StartsWith("shojiku generate", StringComparison.Ordinal)
            && line.Contains("ok=True", StringComparison.Ordinal));
    }

    [Fact]
    public void ATemplateNameCrossesBoundedRatherThanRaw()
    {
        // Whatever does cross is bounded and stripped exactly as the engine
        // bounds its own echoed values, so a hostile name cannot smuggle control
        // characters into a log file.
        var lines = new List<string>();
        var client = Engine.Client(logger: new DelegateLogger(lines.Add));

        client.Generate("receipt");

        Assert.Contains(lines, line => line.Contains("template=receipt", StringComparison.Ordinal));
    }

    [Fact]
    public void NeitherParamsNorDocumentBytesNorDiagnosticsEverCross()
    {
        // BY RULE: a log line is the easiest way for a secret to leave a
        // process, and the diagnostics belong to the result the caller already
        // holds.
        var lines = new List<string>();
        var client = Engine.Client(logger: new DelegateLogger(lines.Add));

        client.Generate("warns");
        client.Generate("receipt", new { customer = new { name = "Yamada Shoji K.K." } });
        client.Generate("broken");

        var log = string.Join("\n", lines);
        Assert.NotEmpty(lines);
        Assert.DoesNotContain("Yamada", log, StringComparison.Ordinal);
        Assert.DoesNotContain("%PDF", log, StringComparison.Ordinal);
        // The `warns` render emits a real diagnostic; none of its text is here.
        Assert.DoesNotContain("box", log, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void AnyDelegateIsALoggerSoThePackageNeedsNoLoggingDependency()
    {
        // Wiring this to Microsoft.Extensions.Logging, Serilog or anything else
        // is a lambda at the call site; the dependency list stays at zero.
        var seen = new List<string>();
        var client = Engine.Client(logger: new DelegateLogger(message => seen.Add(message.ToUpperInvariant())));

        client.Generate("receipt");

        Assert.Contains(seen, line => line.StartsWith("SHOJIKU ", StringComparison.Ordinal));
    }
}

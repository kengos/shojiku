// A diagnostic is passed through, never interpreted.

using System.Text.Json;
using Xunit;

namespace Shojiku.Tests;

public sealed class DiagnosticTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void ADiagnosticIsReadOffTheWireFieldForField()
    {
        var parsed = Diagnostic.Parse(
            """
            {"items":[{"severity":"warning","code":"L0042","category":"layout","message":"box overflows",
            "path":"sections.body.items[0]","origin":"template","args":{"overflow":2.5}}]}
            """);

        var diagnostic = Assert.Single(parsed);
        Assert.Equal("warning", diagnostic.Severity);
        Assert.Equal("L0042", diagnostic.Code);
        Assert.Equal("layout", diagnostic.Category);
        Assert.Equal("box overflows", diagnostic.Message);
        Assert.Equal("sections.body.items[0]", diagnostic.Path);
        Assert.Equal("template", diagnostic.Origin);
        Assert.True(diagnostic.IsWarning);
        Assert.False(diagnostic.IsError);
    }

    [Fact]
    public void TypedArgsPassThroughUntranslated()
    {
        // The engine's frozen contract: a translating consumer renders its own
        // message from `code` and `args`, so this class parses and stops.
        var diagnostic = Assert.Single(Diagnostic.Parse(
            """{"items":[{"code":"L1","args":{"limit":3,"name":"body","ok":true}}]}"""));

        Assert.Equal(3, diagnostic.Args["limit"].GetInt32());
        Assert.Equal("body", diagnostic.Args["name"].GetString());
        Assert.Equal(JsonValueKind.True, diagnostic.Args["ok"].ValueKind);
    }

    [Fact]
    public void ArgsSurviveTheDocumentTheyWereParsedFrom()
    {
        // A JsonElement that outlives its JsonDocument is a use-after-free in
        // managed clothing — it throws, far from where the mistake was made. So
        // every value taken out of a payload is cloned.
        var diagnostic = Assert.Single(Diagnostic.Parse("""{"items":[{"args":{"limit":7}}]}"""));

        GC.Collect();

        Assert.Equal(7, diagnostic.Args["limit"].GetInt32());
    }

    [Fact]
    public void AnAbsentOrEmptyPayloadIsNoDiagnosticsAtAll()
    {
        Assert.Empty(Diagnostic.Parse(""));
        Assert.Empty(Diagnostic.Parse("{}"));
        Assert.Empty(Diagnostic.Parse("""{"items":null}"""));
        Assert.Empty(Diagnostic.Parse("""{"items":[]}"""));
    }

    [Fact]
    public void MissingFieldsAreAbsentRatherThanInvented()
    {
        var diagnostic = Assert.Single(Diagnostic.Parse("""{"items":[{}]}"""));

        Assert.Null(diagnostic.Severity);
        Assert.Null(diagnostic.Code);
        Assert.Null(diagnostic.Message);
        Assert.Empty(diagnostic.Args);
        Assert.False(diagnostic.IsError);
        Assert.False(diagnostic.IsWarning);
    }

    [Fact]
    public void ADiagnosticPrintsItsPathAndMessage()
    {
        Assert.Equal(
            "sections.body: too wide",
            Assert.Single(Diagnostic.Parse("""{"items":[{"path":"sections.body","message":"too wide"}]}""")).ToString());
        Assert.Equal(
            "too wide",
            Assert.Single(Diagnostic.Parse("""{"items":[{"message":"too wide"}]}""")).ToString());
        Assert.Equal(
            "",
            Assert.Single(Diagnostic.Parse("""{"items":[{}]}""")).ToString());
    }

    [Fact]
    public void ARealRenderCarriesRealDiagnostics()
    {
        var result = Engine.Client().Generate("warns");

        var warning = Assert.Single(result.Warnings);
        Assert.NotNull(warning.Code);
        Assert.True(warning.IsWarning);
    }
}

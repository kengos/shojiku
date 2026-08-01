// The lifecycle, against the real engine.

using System.Text.Json;
using Xunit;

namespace Shojiku.Tests;

public sealed class ClientTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void EngineInfoReportsWhatThisBuildCanDo()
    {
        var info = Engine.Client().EngineInfo();

        Assert.NotEmpty(info);
        Assert.True(info.ContainsKey("version"));
    }

    [Fact]
    public void EngineInfoStaysUnmodelled()
    {
        // A plain dictionary of raw wire values, deliberately: the payload is an
        // append-only wire, and a typed value object would owe a new field in
        // seven languages every time the engine adds one.
        var info = Engine.Client().EngineInfo();

        Assert.IsAssignableFrom<IReadOnlyDictionary<string, JsonElement>>(info);
    }

    [Fact]
    public async Task EngineInfoAsyncAnswersTheSame()
    {
        var client = Engine.Client();

        Assert.Equal(client.EngineInfo().Count, (await client.EngineInfoAsync()).Count);
    }

    [Fact]
    public void GenerateRendersATemplateFromTheRoot()
    {
        var result = Engine.Client().Generate("receipt", new { customer = new { name = "Yamada Shoji K.K." } });

        Assert.True(result.Success);
        Assert.Equal(1, result.Artifact!.PageCount);
        Assert.Equal(Origin.Rendered, result.Artifact.Origin);
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(result.Artifact.Bytes[..4]), StringComparison.Ordinal);
    }

    [Fact]
    public async Task GenerateAsyncProducesTheSameBytes()
    {
        var client = Engine.Client();
        var parameters = new { customer = new { name = "Yamada Shoji K.K." } };

        var synchronous = client.Generate("receipt", parameters);
        var asynchronous = await client.GenerateAsync("receipt", parameters);

        Assert.True(asynchronous.Success);
        Assert.Equal(synchronous.Artifact!.Bytes, asynchronous.Artifact!.Bytes);
    }

    [Fact]
    public void GenerateTakesParamsAsSourceTextVerbatim()
    {
        // A string params is the caller's own source, passed through untouched:
        // the engine parses JSON or YAML, and re-encoding here would only be a
        // chance to change it. No per-format method family exists.
        var result = Engine.Client().Generate("receipt", "customer:\n  name: Yamada Shoji K.K.\n");

        Assert.True(result.Success);
    }

    [Fact]
    public void GenerateWithNoParamsStillRenders()
    {
        var result = Engine.Client().Generate("receipt");

        Assert.True(result.Success);
    }

    [Fact]
    public void GenerateCarriesWarningsOnASUCCESS()
    {
        // The case a caller who only inspects failures would miss.
        var result = Engine.Client().Generate("warns");

        Assert.True(result.Success);
        Assert.NotEmpty(result.Warnings);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void GenerateFailsWithTheEnginesDiagnosticsAttached()
    {
        var result = Engine.Client().Generate("broken");

        Assert.True(result.Failed);
        Assert.NotEmpty(result.Errors);
        Assert.NotNull(result.Failure);
        Assert.NotEmpty(result.Failure!.Diagnostics);
    }

    [Fact]
    public void AFailedRenderTracesTheSdksOwnStepNotTheEngines()
    {
        // The engine's error object names an INTERNAL stage; forwarding it would
        // make this field mean different things depending on which layer refused.
        var result = Engine.Client().Generate("broken");

        Assert.Equal(Step.Generate, result.Failure!.Step);
        Assert.NotEqual("unknown", result.Failure.Kind);
    }

    [Fact]
    public void APerCallLocaleBeatsTheClientWideOne()
    {
        var client = Engine.Client(lang: "en-US");

        var result = client.Generate("receipt", new { customer = new { name = "Yamada" } }, lang: "ja-JP");

        Assert.True(result.Success);
    }

    [Fact]
    public void GenerateWithNoTemplateRootIsProgrammerMisuse()
    {
        var client = Engine.Client(useTemplates: false);

        var error = Assert.Throws<UsageException>(() => client.Generate("receipt"));

        Assert.Contains("GenerateSource", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ParamsThatCannotBeSerializedAreProgrammerMisuse()
    {
        // Not a document problem: there is nothing to render, so it throws
        // rather than coming back as a failed result.
        Assert.Throws<UsageException>(() => Engine.Client().Generate("receipt", new Unserializable()));
    }

    [Fact]
    public void ArtifactReEntersArchivedBytesAsLOADED()
    {
        var client = Engine.Client();
        var archived = Engine.Rendered(client).Bytes;

        var artifact = client.Artifact(archived);

        Assert.Equal(Origin.Loaded, artifact.Origin);
        Assert.True(artifact.Loaded);
        // Honestly absent: nothing here laid anything out.
        Assert.Null(artifact.PageCount);
        Assert.Equal(archived, artifact.Bytes);
    }

    [Fact]
    public void TheTemplateRootIsExposedForDiagnosis()
    {
        Assert.Equal(EngineFixture.Templates, Engine.Client().TemplateRootOrNull!.Path);
    }

    private sealed class Unserializable
    {
        // A type System.Text.Json refuses: a property that throws on read.
        public string Boom => throw new InvalidOperationException("not serializable");
    }
}

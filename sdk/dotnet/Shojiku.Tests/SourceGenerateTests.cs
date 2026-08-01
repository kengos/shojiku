// The bytes-first entrance, and the one thing it must never do.

using Xunit;

namespace Shojiku.Tests;

public sealed class SourceGenerateTests(EngineFixture engine) : ShojikuTest(engine)
{
    private static string SourceTemplate(string items, string locale = "en-US") =>
        "version: 0.1.0\n"
        + "name: inline\n"
        + "page: { size: A4, margin: 25 }\n"
        + "defaults:\n"
        + $"  locale: {locale}\n"
        + "  style: { fontFamily: noto-sans, fontSize: 10.5 }\n"
        + "sections:\n"
        + "  body:\n"
        + "    type: flow\n"
        + "    items:\n"
        + string.Join("\n", items.TrimEnd('\n').Split('\n').Select(line => "      " + line))
        + "\n";

    private static string TextItem(string key) =>
        "- id: line\n"
        + "  type: text\n"
        + "  box: { x: 0, y: 0, w: 400, h: 16 }\n"
        + $"  text: \"Billed to {{{key}}}\"\n";

    [Fact]
    public void SourcesTheApplicationHoldsRenderWithoutATemplateRoot()
    {
        // For templates that do not live in a directory this package can see:
        // object storage, a database, a heredoc. Fetching stays the
        // application's act — nothing here opens a socket.
        var client = Engine.Client(useTemplates: false);

        var result = client.GenerateSource(
            SourceTemplate(TextItem("customer.name")),
            parameters: new { customer = new { name = "Yamada Shoji K.K." } });

        Assert.True(result.Success);
        Assert.Equal(Origin.Source, result.Artifact!.Origin);
        Assert.Equal(1, result.Artifact.PageCount);
    }

    [Fact]
    public async Task GenerateSourceAsyncRendersToo()
    {
        var client = Engine.Client(useTemplates: false);

        var result = await client.GenerateSourceAsync(SourceTemplate(TextItem("customer.name")));

        Assert.True(result.Success);
    }

    [Fact]
    public void APathShapedTemplateArgumentIsAPARSEFailureNotAFileThatWasOpened()
    {
        // The rule the entrance exists under: its template argument is source
        // TEXT. An SDK that helpfully opened a path-shaped value would make
        // every containment rule bypassable by spelling the same thing
        // differently.
        var real = Path.Combine(EngineFixture.Templates, "receipt", "templates.yml");
        Assert.True(File.Exists(real), "the fixture this test disproves must exist");

        var result = Engine.Client().GenerateSource(real);

        Assert.True(result.Failed);
        Assert.Equal(Step.Generate, result.Failure!.Step);
        // Parsed, not read: the file at that path is a template that WOULD have
        // rendered, and the failure is a parse of the path string itself.
        Assert.Equal("parse", result.Failure.Kind);
    }

    [Fact]
    public void RootContainmentDoesNotApplyToCallerSuppliedBytes()
    {
        // There is no root to be contained by — which is exactly why a strict
        // client refuses this entrance rather than trying to police it.
        var client = Engine.Client();

        var result = client.GenerateSource(SourceTemplate(TextItem("customer.name")));

        Assert.True(result.Success);
    }

    [Fact]
    public void DefinitionsMayRideAlongWithTheSources()
    {
        var client = Engine.Client(useTemplates: false);

        var result = client.GenerateSource(
            SourceTemplate(TextItem("customer.name")),
            definitions: File.ReadAllText(Path.Combine(EngineFixture.Templates, "receipt", "definitions.yml")),
            parameters: new { customer = new { name = "Yamada" } });

        Assert.True(result.Success);
    }

    [Fact]
    public void BundledAssetsResolveAgainstAPerCallDirectory()
    {
        // Per call rather than per client, because bundled assets belong to a
        // template rather than to a deployment.
        var client = Engine.Client(useTemplates: false);
        var withImage =
            "- id: logo\n"
            + "  type: image\n"
            + "  box: { x: 0, y: 0, w: 40, h: 40 }\n"
            + "  src: assets/logo.svg\n";

        var result = client.GenerateSource(SourceTemplate(withImage), assetsDir: EngineFixture.SourceAssets);

        Assert.True(result.Success);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void WithoutAnAssetsDirectoryABundledSourceIsRefusedRatherThanGuessed()
    {
        var client = Engine.Client(useTemplates: false);
        var withImage =
            "- id: logo\n"
            + "  type: image\n"
            + "  box: { x: 0, y: 0, w: 40, h: 40 }\n"
            + "  src: assets/logo.svg\n";

        var result = client.GenerateSource(SourceTemplate(withImage));

        Assert.True(result.Failed);
    }

    [Fact]
    public void APerCallLocaleAppliesToTheBytesEntranceToo()
    {
        var client = Engine.Client(useTemplates: false, lang: "en-US");

        var result = client.GenerateSource(SourceTemplate(TextItem("customer.name")), lang: "ja-JP");

        Assert.True(result.Success);
    }

    [Fact]
    public void ASourceThatWillNotParseIsAFailedResultWithDiagnostics()
    {
        var result = Engine.Client().GenerateSource("this: is: not: a: template\n");

        Assert.True(result.Failed);
        Assert.Equal("parse", result.Failure!.Kind);
    }
}

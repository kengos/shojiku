// The artifact an application receives: bytes and metadata, never a handle.

using Xunit;

namespace Shojiku.Tests;

public sealed class DocumentArtifactTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void AnArtifactCarriesTheBytesAndWhatTheEngineKnowsAboutThem()
    {
        var rendered = Engine.Rendered();

        Assert.Equal(1, rendered.PageCount);
        Assert.Equal(rendered.Bytes.Length, rendered.Size);
        Assert.False(rendered.Loaded);
        Assert.Equal(Origin.Rendered, rendered.Origin);
    }

    [Fact]
    public void WritingIsBinarySoAPdfSurvivesEveryByteValue()
    {
        // A PDF contains NUL and every other byte value, and a text write would
        // translate line endings on Windows.
        var rendered = Engine.Rendered();
        var path = Path.Combine(Path.GetTempPath(), $"shojiku-{Guid.NewGuid():N}.pdf");
        try
        {
            Assert.Equal(path, rendered.Write(path));
            Assert.Equal(rendered.Bytes, File.ReadAllBytes(path));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task WritingAsynchronouslyProducesTheSameFile()
    {
        var rendered = Engine.Rendered();
        var path = Path.Combine(Path.GetTempPath(), $"shojiku-{Guid.NewGuid():N}.pdf");
        try
        {
            Assert.Equal(path, await rendered.WriteAsync(path));
            Assert.Equal(rendered.Bytes, await File.ReadAllBytesAsync(path));
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public void ARenderedArtifactIsNotLoadedAndALoadedOneIs()
    {
        var client = Engine.Client();
        var rendered = Engine.Rendered(client);

        Assert.False(rendered.Loaded);
        Assert.True(client.Artifact(rendered.Bytes).Loaded);
    }

    [Fact]
    public void TheThreeOriginsAreTheOnlyOnesThereAre()
    {
        // A boolean "was it loaded" would not be enough: an artifact from
        // another client's bytes-first render has engine-laid-out bytes and a
        // caller's template, which is a third trust class.
        Assert.Equal(["Loaded", "Rendered", "Source"], Enum.GetNames<Origin>());
    }

    [Fact]
    public void ARenderedArtifactKnowsHowManyPagesTheEngineLaidOut()
    {
        Assert.Equal(1, Engine.Rendered().PageCount);
    }

    [Fact]
    public void AnArtifactCarriesWhateverTheEngineNoticedWhileProducingIt()
    {
        // On the artifact as well as on the result: a caller who kept only the
        // document still has what the engine said about it.
        var warned = Engine.Client().Generate("warns").Unwrap();

        Assert.NotEmpty(warned.Diagnostics);
        Assert.Empty(Engine.Rendered().Diagnostics);
    }
}

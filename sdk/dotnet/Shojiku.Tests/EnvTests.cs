// One flag governs every SHOJIKU_* lookup.
//
// One rather than one per variable is the reference decision the other six SDKs
// mirror: an application that wants a hermetic configuration wants all of it
// off, and a per-variable set of knobs is a shape nobody can keep consistent
// across seven languages.

using Xunit;

namespace Shojiku.Tests;

public sealed class EnvTests(EngineFixture engine) : ShojikuTest(engine)
{
    private static Env Reading(params (string Key, string Value)[] entries) =>
        new(enabled: true, entries.ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.Ordinal));

    [Fact]
    public void AnEnabledLookupReadsTheVariable()
    {
        Assert.Equal("/templates", Reading(("SHOJIKU_TEMPLATE_ROOT", "/templates")).Get("SHOJIKU_TEMPLATE_ROOT"));
    }

    [Fact]
    public void ADisabledLookupBehavesExactlyAsAnUnsetVariableDoes()
    {
        // So calling code has no second branch to get wrong.
        var disabled = new Env(
            enabled: false,
            new Dictionary<string, string>(StringComparer.Ordinal) { ["SHOJIKU_TEMPLATE_ROOT"] = "/templates" });

        Assert.Null(disabled.Get("SHOJIKU_TEMPLATE_ROOT"));
        Assert.Empty(disabled.Paths("SHOJIKU_FONT_DIR"));
    }

    [Fact]
    public void AnUnsetOrBlankVariableIsNothingRatherThanAnEmptyString()
    {
        Assert.Null(Reading().Get("SHOJIKU_TEMPLATE_ROOT"));
        Assert.Null(Reading(("SHOJIKU_TEMPLATE_ROOT", "")).Get("SHOJIKU_TEMPLATE_ROOT"));
    }

    [Fact]
    public void SeveralPathsRideInOneVariableTheWayEveryOtherToolSpellsIt()
    {
        var separator = Path.PathSeparator;

        var paths = Reading(("SHOJIKU_FONT_DIR", $"/a{separator}/b{separator}{separator}/c")).Paths("SHOJIKU_FONT_DIR");

        Assert.Equal(["/a", "/b", "/c"], paths);
    }

    [Fact]
    public void AnUnsetPathVariableIsNoPathsAtAll()
    {
        Assert.Empty(Reading().Paths("SHOJIKU_FONT_DIR"));
    }

    [Fact]
    public void TheRealEnvironmentIsTheDefaultSource()
    {
        Environment.SetEnvironmentVariable("SHOJIKU_TEST_PROBE", "seen");
        try
        {
            Assert.Equal("seen", new Env(enabled: true).Get("SHOJIKU_TEST_PROBE"));
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_TEST_PROBE", null);
        }
    }

    [Fact]
    public void OneFlagGovernsThePackDirectoriesToo()
    {
        var separator = Path.PathSeparator;
        Environment.SetEnvironmentVariable("SHOJIKU_FONT_DIR", $"{Repo.FontDir}{separator}/extra");
        Environment.SetEnvironmentVariable("SHOJIKU_LOCALE_DIR", Repo.LocaleDir);
        try
        {
            // Off: the packs come from nowhere, so a template needing a font
            // cannot render.
            var hermetic = new ShojikuClient(
                templates: EngineFixture.Templates,
                library: Engine.Library,
                env: false);
            using (hermetic)
            {
                Assert.True(hermetic.Generate("receipt").Failed);
            }

            // On: the same client renders, because the variables supplied them.
            var reading = new ShojikuClient(templates: EngineFixture.Templates, library: Engine.Library, env: true);
            using (reading)
            {
                Assert.True(reading.Generate("receipt").Success);
            }
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_FONT_DIR", null);
            Environment.SetEnvironmentVariable("SHOJIKU_LOCALE_DIR", null);
        }
    }

    [Fact]
    public void ExplicitPackDirectoriesBeatTheEnvironment()
    {
        Environment.SetEnvironmentVariable("SHOJIKU_FONT_DIR", "/nowhere");
        try
        {
            var client = Engine.Client(env: true);

            Assert.True(client.Generate("receipt").Success);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_FONT_DIR", null);
        }
    }
}

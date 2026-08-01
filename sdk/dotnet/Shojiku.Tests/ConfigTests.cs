// Precedence: what an explicit argument beats, what configuration beats, and the
// two places the order deliberately reverses.

using Xunit;

namespace Shojiku.Tests;

public sealed class ConfigTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void ConfigureSetsProcessWideDefaults()
    {
        Configuration.Configure(config => config.Templates = "/configured");

        Assert.Equal("/configured", Configuration.Current.Templates);
    }

    [Fact]
    public void AnExplicitArgumentBeatsAConfiguredDefault()
    {
        // Configuration feeds the same constructor; it never adds a precedence
        // level of its own.
        Configuration.Configure(config => config.Templates = "/configured");

        Assert.Equal(EngineFixture.Templates, Engine.Client().TemplateRootOrNull!.Path);
    }

    [Fact]
    public void AnAbsentArgumentInheritsTheConfiguredDefault()
    {
        Configuration.Configure(config =>
        {
            config.Templates = EngineFixture.Templates;
            config.Lang = "ja-JP";
        });

        var client = Engine.Client(useTemplates: false);

        Assert.Equal(EngineFixture.Templates, client.TemplateRootOrNull!.Path);
    }

    [Fact]
    public void StrictIsTheOnePlaceConfigurationBeatsTheCallSite()
    {
        // A restriction an operator declared must not be liftable by application
        // code: `strict` is OR-ed rather than overridden.
        Configuration.Configure(config => config.Strict = true);

        Assert.True(new Config { Strict = true }.Merge(new ClientOptions(Strict: false)).Strict);
        Assert.True(Configuration.Current.Merge(new ClientOptions(Strict: false)).Strict);
    }

    [Fact]
    public void ACallSiteCanStillTIGHTENWhatConfigurationLeftOpen()
    {
        Assert.True(new Config { Strict = false }.Merge(new ClientOptions(Strict: true)).Strict);
    }

    [Fact]
    public void ProvidersREPLACERatherThanMerge()
    {
        // A client that declares its own registry is stating the whole set it
        // may sign with; quietly adding globally-registered keys would defeat
        // the point.
        var global = new Dictionary<string, object>(StringComparer.Ordinal) { ["global"] = Engine.Signer() };
        var local = new Dictionary<string, object>(StringComparer.Ordinal) { ["local"] = Engine.Signer() };
        var merged = new Config { Providers = global }.Merge(new ClientOptions(Providers: local));

        Assert.Equal(["local"], merged.Providers!.Keys);
    }

    [Fact]
    public void AClientThatDeclaresNoRegistryInheritsTheConfiguredOne()
    {
        var registry = new Dictionary<string, object>(StringComparer.Ordinal) { ["release"] = Engine.Signer() };
        Configuration.Configure(config => config.Providers = registry);

        var client = Engine.Client();

        Assert.True(client.Sign(Engine.Rendered(client), "release").Success);
    }

    [Fact]
    public void ResetDropsEveryConfiguredDefault()
    {
        // Public because a global that cannot be reset makes every test suite
        // invent its own teardown — and get it wrong in a randomly-ordered run.
        Configuration.Configure(config =>
        {
            config.Templates = "/configured";
            config.Strict = true;
        });

        Configuration.Reset();

        Assert.Null(Configuration.Current.Templates);
        Assert.False(Configuration.Current.Strict);
        Assert.True(Configuration.Current.Env);
    }

    [Fact]
    public void EverySettingSurvivesTheMerge()
    {
        var logger = new DelegateLogger(_ => { });
        var providers = new Dictionary<string, object>(StringComparer.Ordinal) { ["p"] = Engine.Signer() };

        var merged = new Config().Merge(new ClientOptions(
            Templates: "/t",
            FontDirs: ["/f"],
            LocaleDirs: ["/l"],
            Lang: "ja-JP",
            Library: "/lib.so",
            Logger: logger,
            Strict: true,
            Providers: providers,
            Env: false));

        Assert.Equal("/t", merged.Templates);
        Assert.Equal(["/f"], merged.FontDirs);
        Assert.Equal(["/l"], merged.LocaleDirs);
        Assert.Equal("ja-JP", merged.Lang);
        Assert.Equal("/lib.so", merged.Library);
        Assert.Same(logger, merged.Logger);
        Assert.True(merged.Strict);
        Assert.Same(providers, merged.Providers);
        Assert.False(merged.Env);
    }

    [Fact]
    public void AnAbsentOverrideLeavesTheDefaultAlone()
    {
        var configured = new Config
        {
            Templates = "/t",
            FontDirs = ["/f"],
            LocaleDirs = ["/l"],
            Lang = "ja-JP",
            Library = "/lib.so",
            Env = false,
        };

        var merged = configured.Merge(new ClientOptions());

        Assert.Equal("/t", merged.Templates);
        Assert.Equal(["/f"], merged.FontDirs);
        Assert.Equal(["/l"], merged.LocaleDirs);
        Assert.Equal("ja-JP", merged.Lang);
        Assert.Equal("/lib.so", merged.Library);
        Assert.False(merged.Env);
    }

    [Fact]
    public void MergingProducesACopyRatherThanMutatingTheDefaults()
    {
        var configured = new Config { Templates = "/t" };

        configured.Merge(new ClientOptions(Templates: "/other"));

        Assert.Equal("/t", configured.Templates);
    }

    [Fact]
    public void APerClientLangIsWhatARenderDefaultsTo()
    {
        var client = Engine.Client(lang: "ja-JP");

        Assert.True(client.Generate("receipt").Success);
    }
}

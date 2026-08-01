// The lockdown, one clause at a time.
//
// A lockdown tested as a whole reports "something was refused" and stops proving
// which rule did it. Each clause below is its own test for that reason.
//
// Every refusal here is the misuse EXCEPTION rather than a failed result: strict
// disables an ENTRANCE, so calling it is the program contradicting its own
// deployment's configuration — not a fact about a document — and a failed result
// is something `if (result.Success)` can swallow.

using Xunit;

namespace Shojiku.Tests;

public sealed class LockdownTests(EngineFixture engine) : ShojikuTest(engine)
{
    private Dictionary<string, object> Registry() =>
        new(StringComparer.Ordinal) { ["release"] = Engine.Signer() };

    [Fact]
    public void AStrictClientRefusesTheBytesEntrance()
    {
        // Clause one: every document a strict client signs came from the
        // configured template root, with its containment rules.
        var client = Engine.Client(strict: true, providers: Registry());

        var error = Assert.Throws<UsageException>(() => client.GenerateSource("version: 0.1.0\n"));

        Assert.Contains("GenerateSource", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AStrictClientStillRendersFromItsOwnRoot()
    {
        var client = Engine.Client(strict: true, providers: Registry());

        Assert.True(client.Generate("receipt").Success);
    }

    [Fact]
    public void AStrictClientRefusesToSignAnArtifactItDidNotRender()
    {
        // Clause two. Bytes handed over whole are the caller's, exactly like a
        // bytes-first template.
        var strict = Engine.Client(strict: true, providers: Registry());
        var archived = strict.Artifact(Engine.Rendered().Bytes);

        var error = Assert.Throws<UsageException>(() => strict.Sign(archived, "release"));

        Assert.Contains("loaded", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AStrictClientRefusesToSignASOURCEArtifactToo()
    {
        // The gap a boolean "was it loaded" would leave open: an artifact from
        // another client's bytes-first render has engine-laid-out bytes and a
        // caller's template.
        var lenient = Engine.Client();
        var fromSource = lenient.GenerateSource(
            File.ReadAllText(Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"))).Unwrap();
        var strict = Engine.Client(strict: true, providers: Registry());

        var error = Assert.Throws<UsageException>(() => strict.Sign(fromSource, "release"));

        Assert.Contains("source", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AnArtifactAStrictClientWillNotSignIsStillVERIFIABLE()
    {
        // Clause three, and the deliberate asymmetry: verifying bytes of unknown
        // provenance is the entire point of verify, and a locked-down deployment
        // is precisely the one that must check an archived document it did not
        // produce.
        var strict = Engine.Client(strict: true, providers: Registry());
        var archived = strict.Artifact(Engine.Signed().Bytes);

        Assert.True(archived.Verify(anchors: [Engine.Key("rsa2048.cert.pem")]).Success);
    }

    [Fact]
    public void AStrictClientRefusesAProviderOBJECT()
    {
        // Clause four: signing material must be a provider REGISTERED in
        // configuration, so a key path never appears in request-handling code.
        var strict = Engine.Client(strict: true, providers: Registry());

        var error = Assert.Throws<UsageException>(() => strict.Sign(Engine.Rendered(strict), Engine.Signer()));

        Assert.Contains("registered", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void AStrictClientSignsWithARegisteredNAME()
    {
        var strict = Engine.Client(strict: true, providers: Registry());

        Assert.True(strict.Sign(Engine.Rendered(strict), "release").Success);
    }

    [Fact]
    public void AnUnknownProviderNameIsNamedWithoutEchoingAnythingUnbounded()
    {
        // Clause five. The name reaches an exception reporter, so it is bounded
        // and stripped exactly as a template name is.
        var strict = Engine.Client(strict: true, providers: Registry());
        var hostile = new string('z', 500);

        var error = Assert.Throws<UsageException>(() => strict.Sign(Engine.Rendered(strict), hostile));

        Assert.Contains("no signing provider named", error.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(new string('z', 200), error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ConfiguredStrictnessSurvivesACallSiteThatAsksForStrictFalse()
    {
        // Clause six, and the ONE place configuration beats a call site: a
        // restriction an operator declared must not be liftable by application
        // code.
        Configuration.Configure(config =>
        {
            config.Strict = true;
            config.Providers = Registry();
        });

        var client = Engine.Client(strict: false, providers: Registry());

        Assert.Throws<UsageException>(() => client.GenerateSource("version: 0.1.0\n"));
    }

    [Fact]
    public void ANameResolvesToARegisteredProviderOutsideStrictModeToo()
    {
        // Naming providers is good practice everywhere; only the REFUSAL of the
        // alternative is strict's.
        var client = Engine.Client(providers: Registry());

        Assert.True(client.Sign(Engine.Rendered(client), "release").Success);
    }

    [Fact]
    public void AnUnknownNameIsRefusedOutsideStrictModeAsWell()
    {
        var client = Engine.Client(providers: Registry());

        Assert.Throws<UsageException>(() => client.Sign(Engine.Rendered(client), "staging"));
    }

    [Fact]
    public void SomethingThatIsNotAProviderAtAllIsProgrammerMisuse()
    {
        var client = Engine.Client();

        var error = Assert.Throws<UsageException>(() => client.Sign(Engine.Rendered(client), 42));

        Assert.Contains("ISigningProvider", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ARegisteredEntryThatIsNotAProviderIsProgrammerMisuseToo()
    {
        var registry = new Dictionary<string, object>(StringComparer.Ordinal) { ["release"] = "not a provider" };
        var client = Engine.Client(providers: registry);

        var error = Assert.Throws<UsageException>(() => client.Sign(Engine.Rendered(client), "release"));

        Assert.Contains("does not implement", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ANonStrictClientNeedsNoRegistryAtAll()
    {
        var client = Engine.Client();

        Assert.True(client.Sign(Engine.Rendered(client), Engine.Signer()).Success);
    }
}

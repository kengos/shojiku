// The template-root hardening, one test per claim.
//
// A hostile NAME is a fact about the request, so every case here is a FAILED
// RESULT rather than an exception — the distinction a caller branches on. The
// rules are the UNION across platforms, so a name refused on Linux is refused on
// Windows and the same application deploys to both.

using Xunit;

namespace Shojiku.Tests;

public sealed class TemplateRootTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Theory]
    // Blank: a hostile STRING, not misuse — it can arrive straight from a form field.
    [InlineData("")]
    [InlineData("   ")]
    // Traversal, in both separators, and what subsumes it: a name is one segment.
    [InlineData("../receipt")]
    [InlineData("..\\receipt")]
    [InlineData("nested/receipt")]
    [InlineData("nested\\receipt")]
    // Absolute, POSIX and Windows.
    [InlineData("/etc/passwd")]
    [InlineData("\\\\host\\share")]
    // Drive-relative: Windows resolves this against that drive's current directory.
    [InlineData("C:receipt")]
    // Control characters, including the NUL a C boundary must never be handed.
    [InlineData("recei\0pt")]
    [InlineData("recei\npt")]
    // Reserved DOS devices, including the trailing dots and spaces Windows strips first.
    [InlineData("CON")]
    [InlineData("nul")]
    [InlineData("CON.")]
    [InlineData("CON ")]
    [InlineData("LPT1")]
    [InlineData("COM9.txt")]
    public void AHostileNameIsARefusedRequest(string name)
    {
        var result = Engine.Client().Generate(name);

        Assert.True(result.Failed);
        Assert.Equal("template_name", result.Failure!.Kind);
        Assert.Equal(Step.Generate, result.Failure.Step);
    }

    [Fact]
    public void ARefusalCapsHowMuchOfTheNameItEchoes()
    {
        // A name reaches exception reporters and log files, so the echo is
        // bounded — the same discipline the engine applies to what it echoes.
        var hostile = "C:" + new string('x', 500);

        var result = Engine.Client().Generate(hostile);

        Assert.True(result.Failed);
        Assert.DoesNotContain(new string('x', 200), result.Failure!.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ARefusalStripsControlCharactersOutOfTheEcho()
    {
        // A separate surface from the cap: a hostile name must not be able to
        // smuggle an escape sequence into a terminal or a log aggregator.
        var result = Engine.Client().Generate("recei\u001bpt");

        Assert.True(result.Failed);
        Assert.DoesNotContain("\u001b", result.Failure!.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ANameThatIsNotThereIsARefusedRequestNamingWhy()
    {
        var result = Engine.Client().Generate("no_such_template");

        Assert.True(result.Failed);
        Assert.Equal("template_not_found", result.Failure!.Kind);
        // The underlying io error rides as the CAUSE, not as the headline.
        Assert.NotNull(result.Failure.Cause);
        Assert.Equal("io", result.Failure.Cause!.Kind);
        Assert.Equal(2, result.Failure.Causes.Count);
    }

    [Fact]
    public void ASymlinkPointingOutsideTheRootIsNotFollowed()
    {
        // The check a name-shape rule cannot make: this name passes every rule
        // above and still points out.
        var outside = Directory.CreateTempSubdirectory("shojiku-outside");
        var root = Directory.CreateTempSubdirectory("shojiku-root");
        try
        {
            File.Copy(
                Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"),
                Path.Combine(outside.FullName, "templates.yml"));
            Directory.CreateSymbolicLink(Path.Combine(root.FullName, "escape"), outside.FullName);

            var result = Engine.Client(templates: root.FullName).Generate("escape");

            Assert.True(result.Failed);
            Assert.Equal("template_escapes_root", result.Failure!.Kind);
        }
        finally
        {
            Directory.Delete(root.FullName, recursive: true);
            Directory.Delete(outside.FullName, recursive: true);
        }
    }

    [Fact]
    public void ASymlinkStayingInsideTheRootIsFine()
    {
        // Containment is about where the answer LANDS, not about symlinks.
        var root = Directory.CreateTempSubdirectory("shojiku-root");
        try
        {
            var real = Path.Combine(root.FullName, "real");
            Directory.CreateDirectory(real);
            File.Copy(
                Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"),
                Path.Combine(real, "templates.yml"));
            Directory.CreateSymbolicLink(Path.Combine(root.FullName, "alias"), real);

            var result = Engine.Client(templates: root.FullName).Generate("alias");

            Assert.True(result.Success);
        }
        finally
        {
            Directory.Delete(root.FullName, recursive: true);
        }
    }

    [Fact]
    public void ASiblingDirectoryWithTheRootsNameAsAPrefixIsNotInsideIt()
    {
        // What a string prefix compare gets wrong: `/tmp/root-evil` starts with
        // `/tmp/root`. The containment test is structural instead.
        var parent = Directory.CreateTempSubdirectory("shojiku-prefix");
        try
        {
            var root = Path.Combine(parent.FullName, "root");
            var evil = Path.Combine(parent.FullName, "root-evil", "receipt");
            Directory.CreateDirectory(root);
            Directory.CreateDirectory(evil);
            File.Copy(
                Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"),
                Path.Combine(evil, "templates.yml"));
            Directory.CreateSymbolicLink(Path.Combine(root, "receipt"), evil);

            var result = Engine.Client(templates: root).Generate("receipt");

            Assert.True(result.Failed);
            Assert.Equal("template_escapes_root", result.Failure!.Kind);
        }
        finally
        {
            Directory.Delete(parent.FullName, recursive: true);
        }
    }

    [Fact]
    public void AnUnreadableTemplateIsARefusedRequest()
    {
        // Structurally unreadable, not `chmod 000`: the gate container runs as
        // root, which ignores permission bits — that test would pass for the
        // wrong reason. A directory where the file belongs cannot be read by
        // anyone.
        var root = Directory.CreateTempSubdirectory("shojiku-unreadable");
        try
        {
            Directory.CreateDirectory(Path.Combine(root.FullName, "shadow", "templates.yml"));

            var result = Engine.Client(templates: root.FullName).Generate("shadow");

            Assert.True(result.Failed);
            Assert.Equal("template_unreadable", result.Failure!.Kind);
            Assert.Equal("io", result.Failure.Cause!.Kind);
        }
        finally
        {
            Directory.Delete(root.FullName, recursive: true);
        }
    }

    [Fact]
    public void DefinitionsAreOptional()
    {
        // `warns` has no definitions.yml; `receipt` has one. Both resolve.
        Assert.True(Engine.Client().Generate("warns").Success);
        Assert.True(Engine.Client().Generate("receipt").Success);
    }

    [Fact]
    public void TheEnvironmentSuppliesTheRoot()
    {
        var client = Engine.Client(
            useTemplates: false,
            env: true,
            library: Engine.Library);
        Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", EngineFixture.Templates);
        try
        {
            Assert.Equal(EngineFixture.Templates, client.TemplateRootOrNull!.Path);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", null);
        }
    }

    [Fact]
    public void ExplicitConfigurationBeatsTheEnvironment()
    {
        // The deliberate asymmetry with the LIBRARY: what an application renders
        // is the application's own decision.
        Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", "/nowhere");
        try
        {
            var client = Engine.Client(env: true);

            Assert.Equal(EngineFixture.Templates, client.TemplateRootOrNull!.Path);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", null);
        }
    }

    [Fact]
    public void TheEnvironmentKnobDisablesTheLookup()
    {
        Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", EngineFixture.Templates);
        try
        {
            var client = Engine.Client(useTemplates: false, env: false);

            Assert.Null(client.TemplateRootOrNull);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_TEMPLATE_ROOT", null);
        }
    }

    // ---- The SHAPE of the root itself -------------------------------------
    //
    // The rules above all constrain the NAME. What the root may look like was
    // never pinned, and this SDK drifted there: its canonical form kept a
    // trailing separator (DirectoryInfo.FullName and Path.GetFullPath both
    // preserve one) while every parent the containment walk compares against
    // canonicalizes without one, so `templates/` — a root four of the five
    // deploy recipes pass — could never contain anything. Relative versus
    // absolute never mattered; the separator did.

    [Theory]
    [InlineData("")]
    [InlineData("/")]
    [InlineData("//")]
    public void ATrailingSeparatorOnTheRootStillResolves(string suffix)
    {
        var result = Engine.Client(templates: EngineFixture.Templates + suffix).Generate("receipt");

        Assert.True(result.Success, result.Failure?.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("/")]
    public void ARelativeRootResolves(string suffix)
    {
        // Expressed relative to the CURRENT directory rather than by changing it:
        // the process cwd is global state, and a test that moves it is a trap for
        // every other test in the collection.
        var relative = Path.GetRelativePath(Environment.CurrentDirectory, EngineFixture.Templates);
        Assert.False(Path.IsPathRooted(relative), "the fixture root must be expressible relatively");

        var result = Engine.Client(templates: relative + suffix).Generate("receipt");

        Assert.True(result.Success, result.Failure?.Message);
    }

    [Fact]
    public void ATrailingSeparatorDoesNotFollowASymlinkOutOfTheRoot()
    {
        // Normalizing the root must not have loosened containment. Same escape as
        // ASymlinkPointingOutsideTheRootIsNotFollowed, with the root spelled the
        // way that used to fail closed for the wrong reason.
        var outside = Directory.CreateTempSubdirectory("shojiku-outside");
        var root = Directory.CreateTempSubdirectory("shojiku-root");
        try
        {
            File.Copy(
                Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"),
                Path.Combine(outside.FullName, "templates.yml"));
            Directory.CreateSymbolicLink(Path.Combine(root.FullName, "escape"), outside.FullName);

            var result = Engine.Client(templates: root.FullName + "/").Generate("escape");

            Assert.True(result.Failed);
            Assert.Equal("template_escapes_root", result.Failure!.Kind);
        }
        finally
        {
            Directory.Delete(root.FullName, recursive: true);
            Directory.Delete(outside.FullName, recursive: true);
        }
    }

    [Fact]
    public void ATrailingSeparatorDoesNotAdmitAPrefixSibling()
    {
        // The hole a string-prefix containment test would open once the root is
        // normalized: `/tmp/root-evil` starts with `/tmp/root`. Containment stays
        // the structural parent walk, so this is still refused.
        var parent = Directory.CreateTempSubdirectory("shojiku-prefix");
        try
        {
            var root = Path.Combine(parent.FullName, "root");
            var evil = Path.Combine(parent.FullName, "root-evil", "receipt");
            Directory.CreateDirectory(root);
            Directory.CreateDirectory(evil);
            File.Copy(
                Path.Combine(EngineFixture.Templates, "receipt", "templates.yml"),
                Path.Combine(evil, "templates.yml"));
            Directory.CreateSymbolicLink(Path.Combine(root, "receipt"), evil);

            var result = Engine.Client(templates: root + "/").Generate("receipt");

            Assert.True(result.Failed);
            Assert.Equal("template_escapes_root", result.Failure!.Kind);
        }
        finally
        {
            Directory.Delete(parent.FullName, recursive: true);
        }
    }
}

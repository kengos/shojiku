// Finding and opening the engine library, and the resolution order that is the
// deliberate reverse of the template root's.

using Xunit;

namespace Shojiku.Tests;

public sealed class LibraryTests(EngineFixture engine) : ShojikuTest(engine)
{
    [Fact]
    public void TheEnvironmentBEATSExplicitConfigurationForTheLibrary()
    {
        // The reverse of the template root, on purpose: WHERE THE ENGINE LIVES
        // is an operator/deployment decision that has to be able to win over
        // application code — the same order the subprocess SDKs give SHOJIKU_BIN.
        Environment.SetEnvironmentVariable("SHOJIKU_LIBRARY", Engine.Library);
        try
        {
            using var library = new Library(path: "/nowhere/libshojiku_capi.so", env: new Env(enabled: true));

            Assert.Equal(Engine.Library, library.Path);
            Assert.Equal("environment", library.Source);
        }
        finally
        {
            Environment.SetEnvironmentVariable("SHOJIKU_LIBRARY", null);
        }
    }

    [Fact]
    public void ExplicitConfigurationWinsWhenTheEnvironmentIsSilent()
    {
        using var library = new Library(path: Engine.Library, env: new Env(enabled: false));

        Assert.Equal(Engine.Library, library.Path);
        Assert.Equal("configuration", library.Source);
    }

    [Fact]
    public void WhichPositionWonIsReportedBecauseThatIsThe3amQuestion()
    {
        var lines = new List<string>();

        using var library = new Library(path: Engine.Library, env: new Env(enabled: false), log: new Log(new DelegateLogger(lines.Add)));

        Assert.Contains(lines, line => line.Contains("library_loaded", StringComparison.Ordinal)
            && line.Contains("source=configuration", StringComparison.Ordinal));
    }

    [Fact]
    public void ALibraryThatIsNotThereNamesTheInstallChannels()
    {
        // The fix is always an installation step, and a bare loader error names
        // none of them.
        var error = Assert.Throws<LibraryNotFoundException>(() =>
            new Library(path: null, env: new Env(enabled: false)));

        Assert.Contains("never downloads", error.Message, StringComparison.Ordinal);
        Assert.Contains("SHOJIKU_LIBRARY", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ALibraryThatWillNotLoadNamesThemToo()
    {
        var notALibrary = Path.Combine(Path.GetTempPath(), $"shojiku-not-a-lib-{Guid.NewGuid():N}.so");
        File.WriteAllText(notALibrary, "this is not an ELF object");
        try
        {
            var error = Assert.Throws<LibraryNotFoundException>(() =>
                new Library(path: notALibrary, env: new Env(enabled: false)));

            Assert.Contains("could not be loaded", error.Message, StringComparison.Ordinal);
            Assert.Contains("never downloads", error.Message, StringComparison.Ordinal);
        }
        finally
        {
            File.Delete(notALibrary);
        }
    }

    [Fact]
    public void AMissingExportIsNamedRatherThanCrashedOn()
    {
        using var library = new Library(path: Engine.Library, env: new Env(enabled: false));

        var error = Assert.Throws<LibraryNotFoundException>(() => library.Export("shojiku_no_such_symbol"));

        Assert.Contains("shojiku_no_such_symbol", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    // Windows is the reason there are six rather than three: cargo emits
    // `shojiku_capi.dll` with NO `lib` prefix while the Unix targets get one.
    // Looking only for the prefixed form would make the package unloadable on
    // the very platform this SDK's market runs on — one test per name, so a
    // dropped candidate cannot hide behind the others.
    [InlineData("libshojiku_capi.so")]
    [InlineData("shojiku_capi.so")]
    [InlineData("libshojiku_capi.dylib")]
    [InlineData("shojiku_capi.dylib")]
    [InlineData("libshojiku_capi.dll")]
    [InlineData("shojiku_capi.dll")]
    public void EveryPlatformsLibraryFilenameIsAmongTheCandidates(string name)
    {
        Assert.Contains(name, Library.Names);
    }

    [Fact]
    public void TheCandidateListHasNothingElseInIt()
    {
        // A negative sweep beside the positive one: a stray candidate would mean
        // the lookup probes for a filename no platform produces.
        Assert.Equal(6, Library.Names.Length);
    }

    [Fact]
    public void TheDefaultResolutionLooksForAPackagedBinary()
    {
        // A source checkout is not a platform package, so there is nothing
        // beside the assembly — which is exactly the "no engine library was
        // found" path.
        Assert.Null(Library.PackagedDir());
    }

    [Fact]
    public void APackagedBinaryIsFoundBesideTheAssemblyWhenThereIsOne()
    {
        // What a platform package looks like from inside: the binary in a
        // `native` directory the loader probes without any path math from a
        // source layout.
        var native = Path.Combine(AppContext.BaseDirectory, Library.PackagedDirname);
        Directory.CreateDirectory(native);
        var planted = Path.Combine(native, "libshojiku_capi.so");
        File.Copy(Engine.Library, planted, overwrite: true);
        try
        {
            using var library = new Library(path: null, env: new Env(enabled: false));

            Assert.Equal(planted, library.Path);
            Assert.Equal("packaged", library.Source);
        }
        finally
        {
            Directory.Delete(native, recursive: true);
        }
    }

    [Fact]
    public void APackagedDirectoryWithNoBinaryInItResolvesToNothing()
    {
        // The directory is where a platform package PUTS the binary, not proof
        // that one is there — a source checkout with an empty `native` beside the
        // assembly must fall through to the install hint, not to a bad path.
        var native = Path.Combine(AppContext.BaseDirectory, Library.PackagedDirname);
        Directory.CreateDirectory(native);
        try
        {
            Assert.Equal(native, Library.PackagedDir());
            Assert.Throws<LibraryNotFoundException>(() => new Library(path: null, env: new Env(enabled: false)));
        }
        finally
        {
            Directory.Delete(native, recursive: true);
        }
    }

    [Fact]
    public void TheAbiRevisionIsCheckedBeforeAnythingElseIsCalled()
    {
        var lines = new List<string>();

        using var library = new Library(path: Engine.Library, env: new Env(enabled: false), log: new Log(new DelegateLogger(lines.Add)));

        Assert.Contains(lines, line => line.Contains($"abi_checked found={Library.AbiVersion}", StringComparison.Ordinal));
    }

    [Fact]
    public void ALibraryIsReleasedWhenTheClientIs()
    {
        // The client owns the loaded image; results and artifacts never do.
        var client = new ShojikuClient(templates: EngineFixture.Templates, library: Engine.Library, env: false);

        client.Dispose();
        // Idempotent, so a `using` around an already-disposed client is safe.
        client.Dispose();
    }
}

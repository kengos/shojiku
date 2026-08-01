// Fixtures shared by every test: the real engine library, the repository's own
// font and locale packs, and generated key material.
//
// Nothing here is a stub. This SDK's whole job is to be a faithful binding, so a
// suite that mocked the boundary would test the mock. What it does avoid is
// repeating the setup: the key generator runs once for the whole collection, and
// every client the suite builds is released with it.

using System.Diagnostics;
using Xunit;

namespace Shojiku.Tests;

/// <summary>The repository this suite runs inside.</summary>
internal static class Repo
{
    /// <summary>
    /// Found by walking up for the workspace markers, not by counting `..`.
    /// </summary>
    /// <remarks>
    /// The assembly sits under bin/&lt;config&gt;/&lt;tfm&gt;/, and how deep
    /// that is changes with the build configuration — a fixed hop count is a
    /// path that breaks on the first Release run.
    /// </remarks>
    internal static string Root { get; } = Find();

    internal static string FontDir => Path.Combine(Root, "packs", "fonts");

    internal static string LocaleDir => Path.Combine(Root, "packs", "locale");

    private static string Find()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "Makefile"))
                && Directory.Exists(Path.Combine(directory.FullName, "engine")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("the repository root is not above this assembly");
    }
}

/// <summary>The engine library, the key material, and every client the suite opened.</summary>
public sealed class EngineFixture : IDisposable
{
    private readonly List<ShojikuClient> opened = [];
    private readonly string keyDirectory;

    /// <summary>Builds the shared, session-scoped state.</summary>
    public EngineFixture()
    {
        // Passed explicitly to every client below, because they all run with the
        // environment OFF — a test that accidentally inherited a SHOJIKU_*
        // variable from the runner would be testing the runner.
        Library = Environment.GetEnvironmentVariable("SHOJIKU_LIBRARY")
            ?? throw new InvalidOperationException("SHOJIKU_LIBRARY is not set; the gate image sets it");

        // Generated, never committed. A repository checkout holds no private key
        // and a leaked test key is worth nothing. The same generator the Rust
        // suites use, so both sides sign with the same shapes. Run ONCE for the
        // collection — a generator that is merely idempotent is still unsafe to
        // run beside itself, because it writes its completion sentinel last.
        keyDirectory = Path.Combine(Path.GetTempPath(), $"shojiku-keys-{Guid.NewGuid():N}");
        Directory.CreateDirectory(keyDirectory);
        Run("sh", Path.Combine(Repo.Root, "scripts", "gen-test-keys.sh"), keyDirectory);
    }

    /// <summary>The engine library the gate image injected.</summary>
    public string Library { get; }

    /// <summary>Where the fixture templates live.</summary>
    public static string Templates => Path.Combine(AppContext.BaseDirectory, "Fixtures", "templates");

    /// <summary>
    /// Where the bytes-first entrance's bundled assets live.
    /// </summary>
    /// <remarks>
    /// A directory rather than a template root: <c>GenerateSource</c> resolves
    /// <c>assets/logo.svg</c> against it and resolves NOTHING else, since there
    /// is no name to look up.
    /// </remarks>
    public static string SourceAssets => Path.Combine(AppContext.BaseDirectory, "Fixtures", "sources");

    /// <summary>A generated key or certificate, by file name.</summary>
    public string Key(string name) => Path.Combine(keyDirectory, name);

    /// <summary>A signer over the generated RSA key pair.</summary>
    public LocalPem Signer() => new(key: Key("rsa2048.key.pem"), cert: Key("rsa2048.cert.pem"));

    /// <summary>
    /// A client over the fixture template root, with the packs wired up.
    /// </summary>
    /// <remarks>Registered for release at collection teardown, so no test owns a `using`.</remarks>
    public ShojikuClient Client(
        string? templates = null,
        bool useTemplates = true,
        IReadOnlyList<string>? fontDirs = null,
        IReadOnlyList<string>? localeDirs = null,
        string? lang = null,
        string? library = null,
        IShojikuLogger? logger = null,
        bool? strict = null,
        IReadOnlyDictionary<string, object>? providers = null,
        bool? env = null)
    {
        var client = new ShojikuClient(
            templates: useTemplates ? templates ?? Templates : null,
            fontDirs: fontDirs ?? [Repo.FontDir],
            localeDirs: localeDirs ?? [Repo.LocaleDir],
            lang: lang,
            library: library ?? Library,
            logger: logger,
            strict: strict,
            providers: providers,
            env: env ?? false);
        opened.Add(client);
        return client;
    }

    /// <summary>A rendered document from the fixture receipt template.</summary>
    public DocumentArtifact Rendered(ShojikuClient? client = null)
    {
        var result = (client ?? Client()).Generate("receipt", new { customer = new { name = "Yamada Shoji K.K." } });
        return result.Failed
            ? throw new InvalidOperationException($"the fixture template did not render: {result.Failure}")
            : result.Unwrap();
    }

    /// <summary>A signed document over <see cref="Rendered"/>.</summary>
    public DocumentArtifact Signed(ShojikuClient? client = null)
    {
        var owner = client ?? Client();
        var result = owner.Sign(Rendered(owner), Signer());
        return result.Failed
            ? throw new InvalidOperationException($"the fixture document did not sign: {result.Failure}")
            : result.Unwrap();
    }

    /// <inheritdoc />
    public void Dispose()
    {
        foreach (var client in opened)
        {
            client.Dispose();
        }

        opened.Clear();
        if (Directory.Exists(keyDirectory))
        {
            Directory.Delete(keyDirectory, recursive: true);
        }
    }

    private static void Run(string command, params string[] arguments)
    {
        var start = new ProcessStartInfo(command) { RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start)
            ?? throw new InvalidOperationException($"{command} did not start");
        process.WaitForExit();
        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException($"{command} failed: {process.StandardError.ReadToEnd()}");
        }
    }
}

/// <summary>
/// One collection, so the key generator runs once and the suite stays serial.
/// </summary>
/// <remarks>
/// Serial matters: <see cref="Configuration"/> is process-wide state, and a test
/// that sets a default would otherwise decide what an unrelated one resolves to
/// — the failure appearing in whichever test happened to run beside it.
/// </remarks>
[CollectionDefinition(Name)]
public sealed class EngineCollection : ICollectionFixture<EngineFixture>
{
    /// <summary>The collection's name.</summary>
    public const string Name = "engine";
}

/// <summary>The base every suite here shares: the fixture, and a clean configuration after each test.</summary>
[Collection(EngineCollection.Name)]
public abstract class ShojikuTest : IDisposable
{
    /// <summary>Binds the shared fixture.</summary>
    protected ShojikuTest(EngineFixture engine) => Engine = engine;

    /// <summary>The engine library, keys and client factory this suite shares.</summary>
    protected EngineFixture Engine { get; }

    /// <inheritdoc />
    public void Dispose()
    {
        Configuration.Reset();
        GC.SuppressFinalize(this);
    }
}

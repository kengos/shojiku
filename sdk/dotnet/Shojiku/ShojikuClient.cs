// The entry point: a configured engine, and the sources to render with it.
//
//     using var client = new ShojikuClient(templates: "App/Templates");
//     var result = await client.GenerateAsync("receipt_ja", new { customer = new { name = "…" } });
//     if (result.Success) await result.Artifact!.WriteAsync("receipt.pdf");
//
// TWO ENTRANCES, DELIBERATELY. `Generate` takes a template NAME and resolves it
// against the configured root, which is where the containment rules live.
// `GenerateSource` takes the sources as BYTES the application already has —
// fetched from object storage, read out of a database, written inline — because
// fetching is the application's act and this package downloads nothing. Root
// containment does not apply to bytes a caller supplied: there is no root to be
// contained by, which is exactly why a strict client refuses that entrance.
//
// PRECEDENCE, AND ITS ONE DELIBERATE ASYMMETRY. An explicit `templates:` beats
// Shojiku.Configuration.Configure, which beats SHOJIKU_TEMPLATE_ROOT; the pack
// directories resolve the same way. What an application renders is the
// application's own decision. An explicit `library:` is the other way round —
// SHOJIKU_LIBRARY beats it — because where the ENGINE lives is an operator's
// decision that has to be able to win over application code, the same order the
// subprocess SDKs give SHOJIKU_BIN. Passing `env: false` disables every one of
// those lookups at once. `Strict` is the one setting Configure wins outright.
//
// SYNCHRONOUS AND ASYNCHRONOUS, BOTH. Rendering is CPU work with no I/O to
// overlap, so the `…Async` methods are the blocking call moved off the calling
// thread — which is precisely what a request-handling runtime needs, and why
// .NET and node get an async surface where the other five SDKs stay
// synchronous. A console application that wants the straight call still has it,
// rather than being pushed through .GetAwaiter().GetResult().

namespace Shojiku;

/// <summary>A configured engine and the sources to render with it.</summary>
public sealed class ShojikuClient : IDisposable
{
    private const string AnchorForms = "`anchors` (paths) or `anchorsPem` (bytes)";

    private readonly Settings settings;
    private readonly Engine engine;

    /// <summary>Creates a client.</summary>
    /// <param name="templates">The directory template names resolve against.</param>
    /// <param name="fontDirs">Directories holding font packs.</param>
    /// <param name="localeDirs">Directories holding locale packs.</param>
    /// <param name="lang">The BCP 47 locale a render defaults to.</param>
    /// <param name="library">An explicit engine library path. <c>SHOJIKU_LIBRARY</c> still beats it.</param>
    /// <param name="logger">Where the host-side log channel writes.</param>
    /// <param name="strict">Whether to refuse the bytes entrance and unregistered providers.</param>
    /// <param name="providers">Signing providers this client may be asked for by name.</param>
    /// <param name="env">Whether <c>SHOJIKU_*</c> lookups happen at all.</param>
    public ShojikuClient(
        string? templates = null,
        IReadOnlyList<string>? fontDirs = null,
        IReadOnlyList<string>? localeDirs = null,
        string? lang = null,
        string? library = null,
        IShojikuLogger? logger = null,
        bool? strict = null,
        IReadOnlyDictionary<string, object>? providers = null,
        bool? env = null)
    {
        settings = new Settings(new ClientOptions(
            templates,
            fontDirs,
            localeDirs,
            lang,
            library,
            logger,
            strict,
            providers,
            env));
        engine = new Engine(settings.Library);
    }

    /// <summary>The configured template root, or null when nothing configured one.</summary>
    internal TemplateRoot? TemplateRootOrNull => settings.TemplateRoot;

    /// <summary>
    /// What this build of the engine can do — its version, capability keys and builtin locales.
    /// </summary>
    /// <remarks>
    /// Gate a feature on this rather than on a package version.
    /// <para>
    /// A plain dictionary, deliberately. The payload is an append-only wire this
    /// SDK does not model, exactly as a diagnostic's typed args pass through
    /// untranslated: a typed value object would have to grow a field in seven
    /// languages every time the engine adds one, and an application reading a
    /// key its engine is too old to send already has to handle a missing one.
    /// </para>
    /// </remarks>
    public IReadOnlyDictionary<string, System.Text.Json.JsonElement> EngineInfo()
    {
        var snapshot = engine.EngineInfo();
        Outcome.Guard(snapshot);
        return Wire.Object(snapshot.Json);
    }

    /// <summary>What this build of the engine can do, off the calling thread.</summary>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<IReadOnlyDictionary<string, System.Text.Json.JsonElement>> EngineInfoAsync(
        CancellationToken cancellationToken = default) =>
        Task.Run(EngineInfo, cancellationToken);

    /// <summary>
    /// Render <paramref name="name"/> with <paramref name="parameters"/>.
    /// </summary>
    /// <remarks>
    /// <paramref name="parameters"/> may be any object (serialized here) or a
    /// string you already have — JSON or YAML, since the engine parses either
    /// and a string is passed through verbatim.
    /// <para>
    /// <paramref name="lang"/> overrides this client's locale for this call
    /// alone, which is how a multi-locale application renders one template per
    /// buyer's locale without building a second client. (The ruby reference
    /// spells the same override as a derived client, because a keyword beside
    /// its trailing-hash params would break the ordinary call form; what every
    /// SDK mirrors is that a per-call locale beats the client-wide one, not the
    /// spelling.)
    /// </para>
    /// <para>
    /// A rejected template name is a FAILED RESULT, not an exception: a hostile
    /// name is a fact about the request, not a bug in the program.
    /// </para>
    /// </remarks>
    /// <param name="name">The template's identifier — never a path.</param>
    /// <param name="parameters">The data to render with.</param>
    /// <param name="lang">A per-call locale, which beats this client's own.</param>
    public Result<DocumentArtifact> Generate(string name, object? parameters = null, string? lang = null)
    {
        Sources sources;
        try
        {
            sources = TemplateRoot().Resolve(name);
        }
        catch (RejectedException error)
        {
            return Result<DocumentArtifact>.FromFailure(Rejection(error, Step.Generate));
        }

        return Render(sources, parameters, Origin.Rendered, lang, ("template", Text.Bounded(name)));
    }

    /// <summary>Render <paramref name="name"/> off the calling thread.</summary>
    /// <param name="name">The template's identifier — never a path.</param>
    /// <param name="parameters">The data to render with.</param>
    /// <param name="lang">A per-call locale, which beats this client's own.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<DocumentArtifact>> GenerateAsync(
        string name,
        object? parameters = null,
        string? lang = null,
        CancellationToken cancellationToken = default) =>
        Task.Run(() => Generate(name, parameters, lang), cancellationToken);

    /// <summary>
    /// Render sources the APPLICATION supplies.
    /// </summary>
    /// <remarks>
    /// For templates that do not live in a directory this package can see:
    /// fetched from object storage, stored in a database, or written inline.
    /// Fetching them stays the application's act — nothing here opens a socket.
    /// <para>
    /// <paramref name="template"/> is source TEXT, never a path: a path-shaped
    /// value is a template that fails to parse. An SDK that helpfully opened it
    /// would make every containment rule bypassable by spelling the same thing
    /// differently.
    /// </para>
    /// <para>
    /// <paramref name="assetsDir"/> is per call rather than per client, because
    /// bundled assets belong to a template rather than to a deployment. Without
    /// it, bundled image sources are disabled: inline sources have no directory
    /// of their own.
    /// </para>
    /// </remarks>
    /// <param name="template">The template's source text.</param>
    /// <param name="definitions">The definitions' source text, when there are any.</param>
    /// <param name="assetsDir">The directory bundled assets resolve against.</param>
    /// <param name="parameters">The data to render with.</param>
    /// <param name="lang">A per-call locale, which beats this client's own.</param>
    public Result<DocumentArtifact> GenerateSource(
        string template,
        string? definitions = null,
        string? assetsDir = null,
        object? parameters = null,
        string? lang = null)
    {
        settings.Lockdown.SourceEntrance();
        return Render(new Sources(template, definitions, assetsDir), parameters, Origin.Source, lang);
    }

    /// <summary>Render caller-supplied sources off the calling thread.</summary>
    /// <param name="template">The template's source text.</param>
    /// <param name="definitions">The definitions' source text, when there are any.</param>
    /// <param name="assetsDir">The directory bundled assets resolve against.</param>
    /// <param name="parameters">The data to render with.</param>
    /// <param name="lang">A per-call locale, which beats this client's own.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<DocumentArtifact>> GenerateSourceAsync(
        string template,
        string? definitions = null,
        string? assetsDir = null,
        object? parameters = null,
        string? lang = null,
        CancellationToken cancellationToken = default) =>
        Task.Run(() => GenerateSource(template, definitions, assetsDir, parameters, lang), cancellationToken);

    /// <summary>
    /// Re-enter an archived document.
    /// </summary>
    /// <remarks>
    /// So bytes signed some time ago can be verified — or re-signed — without
    /// hand-building an artifact.
    /// <para>
    /// The result is marked as <see cref="Origin.Loaded"/>: its bytes are the
    /// caller's rather than this client's own render, which is a distinction a
    /// strict client acts on. <c>PageCount</c> is null, honestly: nothing here
    /// laid anything out.
    /// </para>
    /// </remarks>
    /// <param name="data">The archived PDF's bytes.</param>
    public DocumentArtifact Artifact(byte[] data) =>
        new(data, [], this, null, Origin.Loaded);

    /// <summary>
    /// Sign an artifact with <paramref name="provider"/>.
    /// </summary>
    /// <remarks>
    /// The signed bytes begin with the input byte for byte — signing appends a
    /// revision.
    /// <para>
    /// <paramref name="provider"/> is an <see cref="ISigningProvider"/> (a
    /// <see cref="LocalPem"/>, say), or the NAME of one registered in
    /// configuration. A strict client takes the name only.
    /// </para>
    /// </remarks>
    /// <param name="artifact">The document to sign.</param>
    /// <param name="provider">A provider object, or a registered provider's name.</param>
    public Result<DocumentArtifact> Sign(DocumentArtifact artifact, object provider)
    {
        var signer = settings.Lockdown.Provider(provider);
        settings.Lockdown.Signable(artifact);
        return settings.Log.Timed("sign", () => Signed(artifact, signer));
    }

    /// <summary>Sign an artifact off the calling thread.</summary>
    /// <param name="artifact">The document to sign.</param>
    /// <param name="provider">A provider object, or a registered provider's name.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<DocumentArtifact>> SignAsync(
        DocumentArtifact artifact,
        object provider,
        CancellationToken cancellationToken = default) =>
        Task.Run(() => Sign(artifact, provider), cancellationToken);

    /// <summary>
    /// Verify an artifact against trust anchors.
    /// </summary>
    /// <remarks>
    /// Anchors are required and are given as paths (<paramref name="anchors"/>,
    /// one or several) or as PEM bytes (<paramref name="anchorsPem"/>, which may
    /// carry several concatenated). Which form you passed is explicit rather
    /// than sniffed, and passing both throws rather than silently preferring
    /// one. There is no fallback to the machine's trust store, because the
    /// engine never consults one — a default would answer a different question
    /// than you asked.
    /// <para>
    /// A signature that does not verify is a FAILED result that still carries
    /// the report, so <c>NotChecked</c> reaches you either way.
    /// </para>
    /// </remarks>
    /// <param name="artifact">The document to verify.</param>
    /// <param name="anchors">Paths to PEM trust anchors.</param>
    /// <param name="anchorsPem">Trust anchors as PEM bytes.</param>
    public Result<VerificationReport> Verify(
        DocumentArtifact artifact,
        IEnumerable<string>? anchors = null,
        byte[]? anchorsPem = null)
    {
        byte[] pem;
        try
        {
            pem = AnchorMaterial(anchors, anchorsPem);
        }
        catch (MaterialUnreadableException error)
        {
            return Result<VerificationReport>.FromFailure(
                new Failure(Step.Verify, error.Kind, error.Message));
        }

        return settings.Log.Timed(
            "verify",
            () => Outcome.Verdict(engine.Verify(artifact.Bytes, pem)));
    }

    /// <summary>Verify an artifact off the calling thread.</summary>
    /// <param name="artifact">The document to verify.</param>
    /// <param name="anchors">Paths to PEM trust anchors.</param>
    /// <param name="anchorsPem">Trust anchors as PEM bytes.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<VerificationReport>> VerifyAsync(
        DocumentArtifact artifact,
        IEnumerable<string>? anchors = null,
        byte[]? anchorsPem = null,
        CancellationToken cancellationToken = default) =>
        Task.Run(() => Verify(artifact, anchors, anchorsPem), cancellationToken);

    /// <summary>Releases the engine library this client opened.</summary>
    public void Dispose() => settings.Dispose();

    private static byte[] AnchorMaterial(IEnumerable<string>? paths, byte[]? pem)
    {
        if (paths is not null && pem is not null)
        {
            throw new UsageException($"Verify takes either {AnchorForms}, not both");
        }

        if (pem is not null)
        {
            return pem;
        }

        if (paths is null)
        {
            throw new UsageException($"Verify needs {AnchorForms}");
        }

        var joined = new List<byte>();
        foreach (var path in paths)
        {
            if (joined.Count > 0)
            {
                joined.Add((byte)'\n');
            }

            joined.AddRange(Text.ReadMaterial(path, "anchor_unreadable"));
        }

        return [.. joined];
    }

    private static Failure Rejection(RejectedException error, Step step)
    {
        var cause = error.CauseMessage is null
            ? null
            : new Failure(step, "io", error.CauseMessage);
        return new Failure(step, error.Kind, error.Message, null, cause);
    }

    private Result<DocumentArtifact> Render(
        Sources sources,
        object? parameters,
        Origin origin,
        string? lang,
        params (string Key, object? Value)[] fields)
    {
        var request = new Request(
            sources,
            parameters ?? new Dictionary<string, object>(),
            lang ?? settings.Lang,
            settings.FontDirs,
            settings.LocaleDirs);
        var encoded = request.Encoded();
        return settings.Log.Timed(
            "generate",
            () => Outcome.Document(engine.Render(encoded), Step.Generate, this, origin),
            fields);
    }

    /// <summary>
    /// The signed document inherits the origin of what it signed.
    /// </summary>
    /// <remarks>Appending a revision does not launder where the document came from.</remarks>
    private Result<DocumentArtifact> Signed(DocumentArtifact artifact, ISigningProvider provider)
    {
        Snapshot snapshot;
        try
        {
            snapshot = engine.Sign(artifact.Bytes, provider.Key, provider.Certificate, provider.Passphrase);
        }
        catch (MaterialUnreadableException error)
        {
            return Result<DocumentArtifact>.FromFailure(
                new Failure(Step.Sign, error.Kind, error.Message));
        }

        return Outcome.Document(snapshot, Step.Sign, this, artifact.Origin);
    }

    private TemplateRoot TemplateRoot() =>
        settings.TemplateRoot
        ?? throw new UsageException(
            "no template root: pass new ShojikuClient(templates: …), set it with "
            + "Shojiku.Configuration.Configure, or set SHOJIKU_TEMPLATE_ROOT (which "
            + "`env: false` disables). Sources you already hold go to `GenerateSource`.");
}

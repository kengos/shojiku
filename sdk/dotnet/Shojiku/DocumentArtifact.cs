// A rendered (and possibly signed) document.
//
// The application sees bytes and metadata — never a layout-engine internal, and
// never a handle it has to free. Freeing is the binding's job and it is already
// done by the time this object exists.

namespace Shojiku;

/// <summary>
/// Where a document came from, which is what a strict client signs on.
/// </summary>
/// <remarks>
/// Only <see cref="Rendered"/> is signable under a lockdown: in the other two
/// the provenance of what gets signed is the application's rather than the
/// deployment's, which is the distinction strict exists to draw. Signing
/// inherits the origin of what it signed — appending a revision does not
/// launder where the document came from. Verification is never restricted.
/// </remarks>
public enum Origin
{
    /// <summary>Bytes the application supplied whole.</summary>
    Loaded,

    /// <summary>Laid out from a template the configured root resolved.</summary>
    Rendered,

    /// <summary>Laid out from template bytes the application supplied.</summary>
    Source,
}

/// <summary>PDF bytes plus what the engine knows about them.</summary>
public sealed class DocumentArtifact
{
    private readonly ShojikuClient client;

    /// <summary>Creates an artifact. Clients build these; applications receive them.</summary>
    internal DocumentArtifact(
        byte[] bytes,
        IReadOnlyList<Diagnostic> diagnostics,
        ShojikuClient client,
        int? pageCount = null,
        // The LEAST privileged value, not the most: every internal path states
        // it explicitly, so the default only ever applies to an artifact
        // somebody built by hand — which is bytes handed over whole, and must
        // not become signable under a lockdown by omission.
        Origin origin = Origin.Loaded)
    {
        Bytes = bytes;
        Diagnostics = diagnostics;
        PageCount = pageCount;
        Origin = origin;
        this.client = client;
    }

    /// <summary>
    /// The PDF, as binary.
    /// </summary>
    /// <remarks>PDF bytes are not text, and decoding them to a string is how a document gets corrupted on the way to disk.</remarks>
    public byte[] Bytes { get; }

    /// <summary>
    /// How many pages the engine laid out.
    /// </summary>
    /// <remarks>
    /// Null for an artifact that was signed rather than rendered — signing
    /// appends a revision to bytes it never measured, and a zero there would
    /// read as "a document with no pages".
    /// </remarks>
    public int? PageCount { get; }

    /// <summary>Whatever the engine noticed while producing these bytes.</summary>
    public IReadOnlyList<Diagnostic> Diagnostics { get; }

    /// <summary>Where these bytes came from.</summary>
    public Origin Origin { get; }

    /// <summary>Whether these bytes were handed over whole rather than laid out here.</summary>
    public bool Loaded => Origin == Origin.Loaded;

    /// <summary>How many bytes the document is.</summary>
    public int Size => Bytes.Length;

    /// <summary>
    /// Write the document.
    /// </summary>
    /// <remarks>
    /// Binary, explicitly — a PDF contains NUL and every other byte value, and
    /// a text write would translate line endings on Windows.
    /// </remarks>
    /// <param name="path">Where to write it.</param>
    /// <returns>The path written to.</returns>
    public string Write(string path)
    {
        File.WriteAllBytes(path, Bytes);
        return path;
    }

    /// <summary>Write the document without blocking the calling thread.</summary>
    /// <param name="path">Where to write it.</param>
    /// <param name="cancellationToken">Cancels the write.</param>
    /// <returns>The path written to.</returns>
    public async Task<string> WriteAsync(string path, CancellationToken cancellationToken = default)
    {
        await File.WriteAllBytesAsync(path, Bytes, cancellationToken).ConfigureAwait(false);
        return path;
    }

    /// <summary>
    /// Sign this document, returning a result carrying the signed artifact.
    /// </summary>
    /// <remarks>The signed bytes begin with these bytes byte for byte: signing appends a revision, it never rewrites what was there.</remarks>
    /// <param name="provider">A provider object, or the name of one registered in configuration.</param>
    public Result<DocumentArtifact> Sign(object provider) => client.Sign(this, provider);

    /// <summary>Sign this document without blocking the calling thread.</summary>
    /// <param name="provider">A provider object, or the name of one registered in configuration.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<DocumentArtifact>> SignAsync(object provider, CancellationToken cancellationToken = default) =>
        client.SignAsync(this, provider, cancellationToken);

    /// <summary>Verify this document against caller-supplied trust anchors.</summary>
    /// <param name="anchors">Paths to PEM trust anchors.</param>
    /// <param name="anchorsPem">Trust anchors as PEM bytes, possibly several concatenated.</param>
    public Result<VerificationReport> Verify(IEnumerable<string>? anchors = null, byte[]? anchorsPem = null) =>
        client.Verify(this, anchors, anchorsPem);

    /// <summary>Verify this document without blocking the calling thread.</summary>
    /// <param name="anchors">Paths to PEM trust anchors.</param>
    /// <param name="anchorsPem">Trust anchors as PEM bytes, possibly several concatenated.</param>
    /// <param name="cancellationToken">Cancels the wait, not the engine call.</param>
    public Task<Result<VerificationReport>> VerifyAsync(
        IEnumerable<string>? anchors = null,
        byte[]? anchorsPem = null,
        CancellationToken cancellationToken = default) =>
        client.VerifyAsync(this, anchors, anchorsPem, cancellationToken);
}

// A signing provider backed by a PEM key and certificate.
//
// The only provider this release has. KMS and HSM providers are a recorded
// deferral, which is why this is a named class rather than a pair of arguments
// on `Sign` — a second provider then adds a class, not a signature change in
// seven languages.
//
// The material comes either from paths (`key` / `cert`) or from bytes already in
// memory (`keyPem` / `certPem`), so a key fetched from a secret manager never
// has to be written to disk first. Which one you passed is explicit rather than
// sniffed: guessing whether a string is a path or a PEM body is exactly the kind
// of cleverness that reads the wrong file.
//
// Nothing here logs key material, and the engine builds its refusals from fixed
// strings, so a rejection cannot echo it back either.

namespace Shojiku;

/// <summary>What a client needs from anything it can sign with.</summary>
public interface ISigningProvider
{
    /// <summary>The private key, as PEM or DER bytes.</summary>
    byte[] Key { get; }

    /// <summary>The signing certificate, as PEM or DER bytes.</summary>
    byte[] Certificate { get; }

    /// <summary>The key's passphrase, when it has one.</summary>
    byte[]? Passphrase { get; }
}

/// <summary>PEM key + certificate, from paths or from bytes, never sniffed.</summary>
public sealed class LocalPem : ISigningProvider
{
    private readonly string? keyPath;
    private readonly string? certPath;
    private byte[]? keyPem;
    private byte[]? certPem;

    /// <summary>Creates a provider from any one form of each half.</summary>
    /// <param name="key">Path to the private key.</param>
    /// <param name="cert">Path to the certificate.</param>
    /// <param name="keyPem">The private key as bytes.</param>
    /// <param name="certPem">The certificate as bytes.</param>
    /// <param name="passphrase">The key's passphrase, when it has one.</param>
    public LocalPem(
        string? key = null,
        string? cert = null,
        byte[]? keyPem = null,
        byte[]? certPem = null,
        byte[]? passphrase = null)
    {
        keyPath = key;
        certPath = cert;
        this.keyPem = keyPem;
        this.certPem = certPem;
        Passphrase = passphrase;
        OneSource(key, keyPem, "key");
        OneSource(cert, certPem, "cert");
    }

    /// <inheritdoc />
    public byte[] Key => keyPem ??= Text.ReadMaterial(keyPath!, "key_unreadable");

    /// <inheritdoc />
    public byte[] Certificate => certPem ??= Text.ReadMaterial(certPath!, "certificate_unreadable");

    /// <inheritdoc />
    public byte[]? Passphrase { get; }

    /// <summary>
    /// Redacted, deliberately.
    /// </summary>
    /// <remarks>
    /// The default <c>ToString</c> would be the type name, but an object
    /// initializer, a structured logger or a debugger display reaches for the
    /// members — which here are the private key and the passphrase. So this
    /// states what is safe and nothing else: the class, and which FORM each
    /// half came from. Registering the provider once shrinks the surface
    /// further: material loads into one object instead of being rebuilt per
    /// request.
    /// </remarks>
    public override string ToString() =>
        $"<LocalPem key={Form(keyPath)} cert={Form(certPath)} passphrase={(Passphrase is null ? "none" : "[redacted]")}>";

    /// <summary>
    /// The path, or a note that the bytes came from memory.
    /// </summary>
    /// <remarks>
    /// A configured file path is not secret and is the one thing worth seeing
    /// when a provider loaded the wrong material; the bytes themselves are
    /// never printed.
    /// </remarks>
    private static string Form(string? path) => path ?? "[pem bytes]";

    /// <summary>
    /// Explicit, never sniffed — in BOTH directions.
    /// </summary>
    /// <remarks>
    /// Guessing whether a string is a path or a PEM body is how the wrong file
    /// gets read; accepting both forms and silently preferring one ignores the
    /// argument the caller meant, which is the same mistake one layer quieter.
    /// </remarks>
    private static void OneSource(string? path, byte[]? pem, string what)
    {
        var forms = $"`{what}` (a path) or `{what}Pem` (bytes)";
        if (path is not null && pem is not null)
        {
            throw new UsageException($"LocalPem takes either {forms}, not both");
        }

        if (path is null && pem is null)
        {
            throw new UsageException($"LocalPem needs either {forms}");
        }
    }
}

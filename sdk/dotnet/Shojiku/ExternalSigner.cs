using System.Text;

namespace Shojiku;

/// <summary>How a key signs, in the spelling the engine accepts.</summary>
public enum Algorithm
{
    /// <summary>RSA PKCS#1 v1.5 over SHA-256; the signature is the raw operation output.</summary>
    RsaPkcs1Sha256,

    /// <summary>
    /// ECDSA on P-256 over SHA-256; the signature is an ASN.1 DER SEQUENCE, which is what
    /// both major cloud key services return.
    /// </summary>
    EcdsaP256Sha256,
}

/// <summary>A signing provider for a key this process is never given.</summary>
/// <remarks>
/// <para>
/// The second provider, and the shape <see cref="LocalPem"/>'s own comment
/// promised: a new class rather than new arguments on <c>Sign</c>, so the call
/// site is unchanged in all seven SDKs.
/// </para>
/// <para>
/// The engine hands out the bytes a signature has to cover; the delegate signs
/// them wherever the key actually lives — AWS KMS, Azure Key Vault, an HSM, a
/// smartcard — and hands the signature back. Shojiku ships no cloud client of
/// its own, deliberately: the delegate is whatever client your application
/// already has, and the SDK stays a wrapper with nothing to keep in step with a
/// vendor's releases.
/// </para>
/// <para>
/// <b>What the delegate receives is the signed ATTRIBUTES, not the document
/// digest.</b> A service that signs a digest must hash these bytes with SHA-256
/// itself. Signing the document digest instead produces a document that fails
/// verification, so the distinction is not cosmetic.
/// </para>
/// <para>
/// Nothing here is key material — that is the point of this provider — but a
/// delegate closes over whatever built it, which in practice is a client
/// holding credentials. So <see cref="ToString"/> states the certificate's FORM
/// and the algorithm and nothing else, exactly as <see cref="LocalPem"/> does.
/// </para>
/// </remarks>
public sealed class ExternalSigner : IEngineSigner
{
    private readonly string? certPath;
    private byte[]? certPem;
    private readonly Func<byte[], byte[]> sign;

    /// <summary>Creates a provider around the delegate that signs.</summary>
    /// <param name="sign">Receives the bytes to sign, returns the raw signature.</param>
    /// <param name="algorithm">Which algorithm the key signs with.</param>
    /// <param name="cert">Path to the signer's certificate, as PEM.</param>
    /// <param name="certPem">The certificate as bytes already in memory.</param>
    /// <exception cref="ArgumentNullException"><paramref name="sign"/> is null.</exception>
    /// <exception cref="UsageException">
    /// Both certificate forms were given, or neither was.
    /// </exception>
    public ExternalSigner(
        Func<byte[], byte[]> sign,
        Algorithm algorithm,
        string? cert = null,
        byte[]? certPem = null)
    {
        ArgumentNullException.ThrowIfNull(sign);
        OneSource(cert, certPem);
        this.sign = sign;
        this.certPath = cert;
        this.certPem = certPem;
        Algorithm = algorithm;
    }

    /// <summary>The algorithm this provider's key signs with.</summary>
    public Algorithm Algorithm { get; }

    /// <summary>The signing certificate, as PEM or DER bytes.</summary>
    public byte[] Certificate =>
        certPem ??= Text.ReadMaterial(certPath!, "certificate_unreadable");

    /// <summary>Redacted, deliberately — see the class remarks.</summary>
    public override string ToString() =>
        $"<ExternalSigner cert={certPath ?? "[pem bytes]"} algorithm={Wire(Algorithm)}>";

    /// <summary>The wire spelling the engine accepts for an algorithm.</summary>
    internal static string Wire(Algorithm algorithm) => algorithm switch
    {
        Algorithm.RsaPkcs1Sha256 => "rsa-pkcs1-sha256",
        _ => "ecdsa-p256-sha256",
    };

    /// <summary>Signs in two engine calls, with the delegate in between.</summary>
    /// <remarks>
    /// Both calls take the same document, certificate and algorithm: the pair is
    /// stateless, so the second re-derives what the first prepared. Keeping them
    /// inside ONE method is what makes that impossible to get wrong from C# —
    /// there is no way to pair a prepare of one document with a complete of
    /// another. A prepare that did not succeed is returned as it is: an
    /// unreadable certificate or a document the engine refuses is a fact about
    /// the inputs, and paying for a signature afterwards would tell the caller
    /// nothing new.
    /// </remarks>
    Snapshot IEngineSigner.SignWith(Engine engine, byte[] pdf)
    {
        var certificate = Certificate;
        var algorithm = Encoding.UTF8.GetBytes(Wire(Algorithm));
        var prepared = engine.SignPrepare(pdf, certificate, algorithm);
        if (prepared.Status != 0 || !prepared.Success)
        {
            return prepared;
        }

        return engine.SignComplete(pdf, certificate, algorithm, SignatureFor(prepared));
    }

    /// <summary>The bytes the engine wants signed, out of the prepare payload.</summary>
    /// <remarks>
    /// Split out so the refusal is reachable from a test: the real engine always
    /// reports <c>toBeSigned</c>, so a payload without one is a shape only a
    /// different library on the other end could produce — and a guard nobody can
    /// exercise is a guard nobody knows works.
    /// </remarks>
    /// <param name="json">The prepare payload.</param>
    /// <returns>The bytes to sign.</returns>
    /// <exception cref="UsageException">The payload names no bytes.</exception>
    internal static byte[] BytesToSign(string json)
    {
        using var document = System.Text.Json.JsonDocument.Parse(json);
        if (!document.RootElement.TryGetProperty("toBeSigned", out var value) ||
            value.ValueKind != System.Text.Json.JsonValueKind.String)
        {
            throw new UsageException("the engine reported no bytes to sign");
        }

        return Convert.FromBase64String(value.GetString()!);
    }

    /// <summary>
    /// Runs the delegate over the bytes the engine wants signed.
    /// </summary>
    /// <remarks>
    /// The delegate's own exceptions are deliberately not caught: it is the
    /// caller's code talking to the caller's key service, and turning its
    /// failures into a failed result would file a caller's outage under
    /// "something was wrong with this document".
    /// </remarks>
    private byte[] SignatureFor(Snapshot prepared)
    {
        var signature = sign(BytesToSign(prepared.Json));
        if (signature is null || signature.Length == 0)
        {
            throw new UsageException("the signing delegate must return a non-empty signature");
        }

        return signature;
    }

    /// <summary>Explicit, never sniffed — in BOTH directions, LocalPem's rule.</summary>
    private static void OneSource(string? path, byte[]? pem)
    {
        const string Forms = "`cert` (a path) or `certPem` (bytes)";
        if (path is not null && pem is not null)
        {
            throw new UsageException($"ExternalSigner takes either {Forms}, not both");
        }

        if (path is null && pem is null)
        {
            throw new UsageException($"ExternalSigner needs either {Forms}");
        }
    }
}

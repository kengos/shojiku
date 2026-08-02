// What verification found — INCLUDING what it did not look at.
//
// `NotChecked` is a field, not a footnote, and this binding passes it through
// untouched. A "valid" verdict that quietly skipped revocation is worse than no
// verifier at all: it turns a missing capability into a false assurance, which
// is exactly the trust a signing feature sells. Dropping it on the way through
// an SDK would be the same lie one layer up.
//
// The four checks stay separate for the same reason. "The signature is valid but
// covers only part of the file" is a different fact from "the signature is
// wrong", and a caller that cannot tell them apart cannot explain the answer to
// anyone.

using System.Text.Json;

namespace Shojiku;

/// <summary>The outcome of one check: passed, or failed with the reason.</summary>
public sealed class Check
{
    /// <summary>Reads one check off the wire.</summary>
    internal Check(JsonElement parent, string key)
    {
        if (parent.ValueKind == JsonValueKind.Object && parent.TryGetProperty(key, out var item))
        {
            Status = Wire.String(item, "status");
            Reason = Wire.String(item, "reason");
        }
    }

    /// <summary>The engine's verdict for this check.</summary>
    public string? Status { get; }

    /// <summary>Why, when it did not pass.</summary>
    public string? Reason { get; }

    /// <summary>Whether this check passed.</summary>
    public bool Passed => Status == "passed";

    /// <inheritdoc />
    public override string ToString() =>
        Reason is null ? Status ?? string.Empty : $"{Status}: {Reason}";
}

/// <summary>The four checks, the verdict, and the list of what was never looked at.</summary>
public sealed class VerificationReport
{
    private readonly bool valid;

    /// <summary>Reads a report off the wire.</summary>
    internal VerificationReport(JsonElement payload)
    {
        valid = payload.ValueKind == JsonValueKind.Object
            && payload.TryGetProperty("valid", out var verdict)
            && verdict.ValueKind == JsonValueKind.True;

        Signature = new Check(payload, "signature");
        Coverage = new Check(payload, "coverage");
        CertificateValidity = new Check(payload, "certificateValidity");
        TrustChain = new Check(payload, "trustChain");
        NotChecked = Wire.Strings(payload, "notChecked");
    }

    /// <summary>Whether the signature itself verified over the bytes it covers.</summary>
    public Check Signature { get; }

    /// <summary>Whether the signature covers the whole file — an incomplete range is a forgery, not a detail.</summary>
    public Check Coverage { get; }

    /// <summary>Whether the signing certificate was within its validity window.</summary>
    public Check CertificateValidity { get; }

    /// <summary>Whether the certificate chained to a caller-supplied anchor.</summary>
    public Check TrustChain { get; }

    /// <summary>
    /// What this release did NOT look at.
    /// </summary>
    /// <remarks>Read it beside <see cref="Valid"/>. A verdict that hides this is a false assurance.</remarks>
    public IReadOnlyList<string> NotChecked { get; }

    /// <summary>
    /// Whether every check this release PERFORMS passed.
    /// </summary>
    /// <remarks>
    /// Read <see cref="NotChecked"/> beside it: this is not "the document is
    /// trustworthy", it is "nothing we looked at was wrong".
    /// </remarks>
    public bool Valid => valid;

    /// <summary>
    /// The four checks, by name.
    /// </summary>
    /// <remarks>
    /// Keyed by this SDK's own property names rather than by the wire spelling —
    /// the reference SDKs do the same in their own conventions, because a caller
    /// iterating this collection is reading the SDK's vocabulary, not the
    /// engine's.
    /// </remarks>
    public IReadOnlyDictionary<string, Check> Checks => new Dictionary<string, Check>(StringComparer.Ordinal)
    {
        [nameof(Signature)] = Signature,
        [nameof(Coverage)] = Coverage,
        [nameof(CertificateValidity)] = CertificateValidity,
        [nameof(TrustChain)] = TrustChain,
    };

    /// <summary>Parses a report payload.</summary>
    internal static VerificationReport Parse(string payload)
    {
        using var document = JsonDocument.Parse(payload);
        return new VerificationReport(document.RootElement);
    }
}

// The input ceiling an operator can declare, and its named signing providers.
//
// Once signing is in the loop, template input is a security boundary: whoever
// controls the bytes controls what gets signed. A strict client therefore
// narrows where signable input may come from.
//
//   * The bytes-first entrance is refused, so every document this client signs
//     came from the configured template root, with its containment rules.
//   * An artifact this client did not render may not be signed — those bytes are
//     the caller's, exactly like a bytes-first template.
//   * Signing material must be a provider REGISTERED in configuration and named
//     at the call site, so a key path never appears in request-handling code and
//     the material is loaded by one object rather than rebuilt per request.
//
// Verification is never restricted. Verifying bytes of unknown provenance is the
// entire point of verify, and a locked-down deployment is precisely the one that
// needs to check an archived document it did not produce.
//
// Refusals throw `UsageException` rather than returning a failed result: strict
// disables an ENTRANCE, so calling it is the program contradicting its own
// deployment's configuration — not a fact about a document — and a failed result
// is something `if (result.Success)` can swallow.
//
// The six other SDKs mirror this with identical semantics. It is contract, not
// ecosystem idiom.

namespace Shojiku;

/// <summary>One client's ceiling: which entrances are open, and which providers exist.</summary>
internal sealed class Lockdown
{
    private readonly IReadOnlyDictionary<string, object> providers;

    internal Lockdown(bool strict, IReadOnlyDictionary<string, object>? providers)
    {
        Strict = strict;
        this.providers = providers ?? new Dictionary<string, object>(StringComparer.Ordinal);
    }

    /// <summary>Whether this client is locked down.</summary>
    internal bool Strict { get; }

    /// <summary>The bytes-first entrance.</summary>
    internal void SourceEntrance()
    {
        if (!Strict)
        {
            return;
        }

        throw new UsageException(
            "this client is strict: templates must come from the template root, so "
            + "`GenerateSource` is disabled. Use `Generate(name, params)`.");
    }

    /// <summary>
    /// An artifact about to be signed.
    /// </summary>
    /// <remarks>
    /// Only a document laid out from a template the ROOT resolved qualifies —
    /// bytes handed over whole, and bytes laid out from a caller's own template,
    /// are the same trust class here. That closes the gap a boolean "was it
    /// loaded" would leave open: an artifact from another client's bytes-first
    /// render is not this deployment's document either.
    /// </remarks>
    internal void Signable(DocumentArtifact artifact)
    {
        if (!Strict || artifact.Origin == Origin.Rendered)
        {
            return;
        }

        throw new UsageException(
            "this client is strict: only a document rendered from its own template root "
            + $"may be signed (this one is {artifact.Origin.ToString().ToLowerInvariant()}). "
            + "It can still be verified.");
    }

    /// <summary>
    /// The provider to sign with.
    /// </summary>
    /// <remarks>
    /// A string is a registered name, in strict mode and out of it — naming
    /// providers is good practice everywhere, and only the REFUSAL of the
    /// alternative is strict's. A provider object is accepted only when this
    /// client is not strict.
    /// </remarks>
    internal IEngineSigner Provider(object provider)
    {
        if (provider is string name)
        {
            return Registered(name);
        }

        if (!Strict)
        {
            return provider as IEngineSigner
                ?? throw new UsageException(
                    "a signing provider must implement ISigningProvider, or be the name of one "
                    + "registered in configuration");
        }

        throw new UsageException(
            "this client is strict: sign with the name of a provider registered in "
            + "configuration, not with a provider object.");
    }

    private IEngineSigner Registered(string name)
    {
        if (!providers.TryGetValue(name, out var provider))
        {
            throw new UsageException($"no signing provider named `{Text.Bounded(name)}` is registered");
        }

        return provider as IEngineSigner
            ?? throw new UsageException(
                $"the provider registered as `{Text.Bounded(name)}` does not implement ISigningProvider");
    }
}

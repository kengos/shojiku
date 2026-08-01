// Why a lifecycle operation did not produce what was asked for.
//
// A VALUE, not an exception. The shape takes effect-ts's `Cause` as its
// conceptual reference: which step failed, what class of thing went wrong, and —
// when one failure happened because of another — the chain underneath it, all
// inspectable rather than unwound. No effect framework is involved; only the
// idea that a failure is data.

using System.Text.Json;

namespace Shojiku;

/// <summary>
/// The SDK's own lifecycle vocabulary.
/// </summary>
/// <remarks>
/// Always one of these three. The engine's error object carries a step of its
/// own naming an INTERNAL stage (<c>render</c>, <c>validate</c>), and passing
/// that through would make the trace's step mean different things depending on
/// which layer refused. What the engine said specifically is the
/// <see cref="Failure.Kind"/>.
/// </remarks>
public enum Step
{
    /// <summary>Rendering a document, from a template name or from caller-supplied sources.</summary>
    Generate,

    /// <summary>Appending a signature revision to a rendered document.</summary>
    Sign,

    /// <summary>Checking a document's signature against caller-supplied trust anchors.</summary>
    Verify,
}

/// <summary>One failed lifecycle step, and the chain of causes under it.</summary>
public sealed class Failure
{
    /// <summary>Creates a failure.</summary>
    public Failure(
        Step step,
        string kind,
        string message,
        IReadOnlyList<Diagnostic>? diagnostics = null,
        Failure? cause = null)
    {
        Step = step;
        Kind = kind;
        Message = message;
        Diagnostics = diagnostics ?? [];
        Cause = cause;
    }

    /// <summary>Which of this SDK's lifecycle steps refused — never the engine's internal stage.</summary>
    public Step Step { get; }

    /// <summary>
    /// A stable machine-readable class.
    /// </summary>
    /// <remarks>
    /// Engine-side kinds come straight off the wire; host-side ones are this
    /// package's own (<c>template_name</c>, <c>io</c>).
    /// </remarks>
    public string Kind { get; }

    /// <summary>What went wrong, in the engine's or this package's own words.</summary>
    public string Message { get; }

    /// <summary>Whatever the engine noticed while refusing.</summary>
    public IReadOnlyList<Diagnostic> Diagnostics { get; }

    /// <summary>The failure underneath this one, when there is one.</summary>
    public Failure? Cause { get; }

    /// <summary>
    /// This failure and everything under it, outermost first.
    /// </summary>
    /// <remarks>What you log when you want the whole story rather than only its headline.</remarks>
    public IReadOnlyList<Failure> Causes
    {
        get
        {
            var chain = new List<Failure>();
            for (var failure = this; failure is not null; failure = failure.Cause)
            {
                chain.Add(failure);
            }

            return chain;
        }
    }

    /// <summary>Reads a failure out of the engine's error payload.</summary>
    public static Failure FromErrorJson(
        string? payload,
        Step step,
        IReadOnlyList<Diagnostic>? diagnostics = null,
        Failure? cause = null)
    {
        var kind = "unknown";
        var message = string.Empty;

        if (!string.IsNullOrEmpty(payload))
        {
            using var document = JsonDocument.Parse(payload);
            kind = Wire.String(document.RootElement, "kind") ?? kind;
            message = Wire.String(document.RootElement, "message") ?? message;
        }

        return new Failure(step, kind, message, diagnostics, cause);
    }

    /// <inheritdoc />
    public override string ToString() =>
        $"{Step.ToString().ToLowerInvariant()}/{Kind}: {Message}";
}

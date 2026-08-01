// What every lifecycle operation returns.
//
// Nothing in the normal flow throws. A template that will not render, a key that
// will not sign, a signature that does not verify are all data you query —
// `Success`, the value, the engine's diagnostics either way, and on failure the
// `Failure` trace.
//
// Diagnostics ride on a SUCCESS too. A render that worked can still have warned
// about an overflowing box, and a caller that only looks at failures never sees
// them.

namespace Shojiku;

/// <summary>A lifecycle operation's outcome: a value, diagnostics, maybe a failure.</summary>
/// <typeparam name="T">What the operation produced.</typeparam>
public sealed class Result<T>
    where T : class
{
    /// <summary>Creates a result directly. Prefer <see cref="Succeeded"/> or <see cref="FromFailure"/>.</summary>
    public Result(
        T? value = null,
        IReadOnlyList<Diagnostic>? diagnostics = null,
        Failure? failure = null)
    {
        Value = value;
        Diagnostics = diagnostics ?? [];
        Failure = failure;
    }

    /// <summary>What the operation produced, if it produced anything.</summary>
    public T? Value { get; }

    /// <summary>Everything the engine noticed — on a successful operation as well as a failed one.</summary>
    public IReadOnlyList<Diagnostic> Diagnostics { get; }

    /// <summary>Why the operation did not produce what was asked for, or null.</summary>
    public Failure? Failure { get; }

    /// <summary>Whether the operation produced what was asked for.</summary>
    public bool Success => Failure is null;

    /// <summary>Whether the operation did not.</summary>
    public bool Failed => !Success;

    /// <summary>
    /// <see cref="Value"/> under the name of what a render or a signature produced.
    /// </summary>
    /// <remarks>The same object; the alias exists so calling code reads as what it is doing.</remarks>
    public T? Artifact => Value;

    /// <summary><see cref="Value"/> under the name of what a verification produced.</summary>
    public T? Report => Value;

    /// <summary>Only the diagnostics that are errors — the ones that explain a refusal.</summary>
    public IReadOnlyList<Diagnostic> Errors => Filter(static item => item.IsError);

    /// <summary>Only the warnings, which a SUCCESSFUL result can carry.</summary>
    public IReadOnlyList<Diagnostic> Warnings => Filter(static item => item.IsWarning);

    /// <summary>A successful result.</summary>
    internal static Result<T> Succeeded(T value, IReadOnlyList<Diagnostic> diagnostics) =>
        new(value, diagnostics);

    /// <summary>A failed result, carrying the failure's own diagnostics.</summary>
    /// <remarks>
    /// Named <c>FromFailure</c> rather than mirroring ruby's <c>Result.failed</c>,
    /// because a static factory and a predicate cannot share one name here and
    /// the PREDICATE is the one the frozen contract lists.
    /// </remarks>
    internal static Result<T> FromFailure(Failure failure) =>
        new(null, failure.Diagnostics, failure);

    /// <summary>
    /// The value, or a thrown <see cref="UnwrapException"/>.
    /// </summary>
    /// <remarks>
    /// The opt-in bridge for a script that wants a stack trace rather than a
    /// branch, and the ONE place this API throws for something other than a
    /// misused argument. That is why the ruling is stated rather than implied,
    /// and frozen for every Shojiku SDK: <b>calling Unwrap on a failed result is
    /// programmer misuse</b> — a caller who has not checked <see cref="Success"/>
    /// is asserting the operation worked. Application code that handles failure
    /// keeps using <see cref="Success"/> and <see cref="Failure"/>; nothing in
    /// this package calls it.
    /// <para>
    /// (The reference SDK spells this pair <c>artifact!</c> / <c>report!</c>.
    /// Go is the recorded exception to the throwing form: with no exceptions in
    /// the language its SDK mirrors the shape as an error return.)
    /// </para>
    /// </remarks>
    public T Unwrap()
    {
        if (Failure is not null)
        {
            throw new UnwrapException(Failure);
        }

        // Returned rather than asserted non-null: a verify whose payload was
        // empty succeeds with no report, so a value-less success is reachable
        // and must not blow up here.
        return Value!;
    }

    private List<Diagnostic> Filter(Func<Diagnostic, bool> keep)
    {
        var kept = new List<Diagnostic>();
        foreach (var item in Diagnostics)
        {
            if (keep(item))
            {
                kept.Add(item);
            }
        }

        return kept;
    }
}

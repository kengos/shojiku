// The base of everything this package throws, plus the two shared helpers.
//
// Throwing is deliberately rare here. A template that will not render, a key
// that will not sign, a signature that does not verify are OUTCOMES — they come
// back as Result objects you query, never as exceptions you catch. What is left
// for exceptions is what every .NET library reserves them for: programmer
// misuse, and an environment that cannot host the engine at all.

namespace Shojiku;

/// <summary>The base of every exception this package throws.</summary>
public class ShojikuException : Exception
{
    /// <summary>Creates the exception with <paramref name="message"/>.</summary>
    public ShojikuException(string message)
        : base(message) { }

    /// <summary>Creates the exception with <paramref name="message"/> over <paramref name="inner"/>.</summary>
    public ShojikuException(string message, Exception inner)
        : base(message, inner) { }
}

/// <summary>
/// The caller passed something this API cannot accept.
/// </summary>
/// <remarks>
/// Both forms of the same material at once, or an entrance this client's
/// lockdown disables. Programmer misuse, so it throws.
/// <para>
/// A BLANK template name is deliberately not in that list: an empty string can
/// arrive straight from a form field, so it comes back as a refused request
/// like every other bad name.
/// </para>
/// </remarks>
public class UsageException : ShojikuException
{
    /// <summary>Creates the exception with <paramref name="message"/>.</summary>
    public UsageException(string message)
        : base(message) { }

    /// <summary>Creates the exception with <paramref name="message"/> over <paramref name="inner"/>.</summary>
    public UsageException(string message, Exception inner)
        : base(message, inner) { }
}

/// <summary>
/// Unwrapping a result that failed.
/// </summary>
/// <remarks>
/// <c>Unwrap</c> is the opt-in bridge to exception-style control flow. Calling
/// it on a failed result is programmer misuse — the ruling is explicit and
/// frozen for every Shojiku SDK, because an accessor that throws is the one
/// place this API could drift back into exceptions by accident. The failure
/// travels on the exception, so nothing is lost by taking the short road.
/// </remarks>
public class UnwrapException : ShojikuException
{
    /// <summary>Creates the exception carrying <paramref name="failure"/>.</summary>
    public UnwrapException(Failure failure)
        : base(failure.ToString()) => Failure = failure;

    /// <summary>The failure the unwrapped result carried.</summary>
    public Failure Failure { get; }
}

/// <summary>
/// The engine library could not be found or loaded.
/// </summary>
/// <remarks>
/// The message names the install channels, because the fix is always an
/// installation step and a bare loader error names none of them. Nothing here
/// downloads the library: an SDK that fetches an executable is a supply-chain
/// surface this product does not take on.
/// </remarks>
public class LibraryNotFoundException : ShojikuException
{
    /// <summary>Creates the exception with <paramref name="message"/>.</summary>
    public LibraryNotFoundException(string message)
        : base(message) { }

    /// <summary>Creates the exception with <paramref name="message"/> over <paramref name="inner"/>.</summary>
    public LibraryNotFoundException(string message, Exception inner)
        : base(message, inner) { }
}

/// <summary>
/// The library implements a different ABI revision than this package.
/// Loading anyway would mean calling symbols whose meaning has changed.
/// </summary>
public class AbiMismatchException : ShojikuException
{
    /// <summary>Creates the exception with <paramref name="message"/>.</summary>
    public AbiMismatchException(string message)
        : base(message) { }

    /// <summary>Creates the exception with <paramref name="message"/> over <paramref name="inner"/>.</summary>
    public AbiMismatchException(string message, Exception inner)
        : base(message, inner) { }
}

/// <summary>
/// Key, certificate or trust-anchor bytes that could not be read.
/// </summary>
/// <remarks>
/// Thrown internally and caught by the client, which turns it into a failed
/// result: an unreadable key is an outcome of the operation, not a bug in the
/// calling program. It carries the machine-readable <see cref="Kind"/> the
/// failure trace reports.
/// </remarks>
public class MaterialUnreadableException : ShojikuException
{
    /// <summary>Creates the exception for <paramref name="kind"/> with <paramref name="message"/>.</summary>
    public MaterialUnreadableException(string kind, string message)
        : base(message) => Kind = kind;

    /// <summary>The machine-readable class of material that could not be read.</summary>
    public string Kind { get; }
}

/// <summary>Shared helpers every echoing and material-reading path owes.</summary>
internal static class Text
{
    /// <summary>How much caller-supplied text may reach a message or a log line.</summary>
    internal const int EchoLimit = 80;

    /// <summary>
    /// Echo caller-supplied text back, stripped and capped.
    /// </summary>
    /// <remarks>
    /// Template names and provider names reach exception reporters and log
    /// files, so they are stripped of control characters and bounded before
    /// they are quoted — the same discipline the engine applies to the values
    /// it echoes. One place for it, because every path that echoes owes the
    /// same thing.
    /// </remarks>
    internal static string Bounded(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var stripped = new System.Text.StringBuilder(value.Length);
        foreach (var character in value)
        {
            if (!char.IsControl(character))
            {
                stripped.Append(character);
            }
        }

        var text = stripped.ToString();
        return text.Length <= EchoLimit ? text : text[..EchoLimit];
    }

    /// <summary>
    /// Read the byte inputs signing and verification take.
    /// </summary>
    /// <remarks>
    /// One place, because both paths owe the same thing: raw bytes (PEM is
    /// bytes, and a transcode would corrupt a DER-bearing file), and an
    /// unreadable file surfacing as <see cref="MaterialUnreadableException"/>
    /// rather than as a raw <see cref="IOException"/> nobody upstream is
    /// catching.
    /// </remarks>
    internal static byte[] ReadMaterial(string path, string kind)
    {
        try
        {
            return File.ReadAllBytes(path);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            throw new MaterialUnreadableException(kind, error.Message);
        }
    }
}

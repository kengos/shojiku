// Resolving a template NAME to the sources behind it.
//
// A name is an identifier, never a path. A bundle format will take this lookup
// over later, so nothing outside this class may assume a directory is how names
// resolve — callers ask for "receipt_ja" and get sources back.
//
// THE REJECTION RULES ARE THE UNION ACROSS PLATFORMS, NOT THE HOST'S. Windows is
// a first-class target (it is what this SDK's market runs on), so a backslash is
// a separator, `C:name` is drive-relative, `\\host\share` is a UNC path and
// CON/NUL are reserved devices — every one of them refused on EVERY platform. A
// template name that is valid on one machine is valid on all of them, which is
// the only way the same application deploys to both.

using System.Text.RegularExpressions;

namespace Shojiku;

/// <summary>
/// A refused name or an unreadable template.
/// </summary>
/// <remarks>
/// Rejection is an exception INSIDE this class and a failed result outside it —
/// a hostile template name is a fact about the request, not a bug in the calling
/// program.
/// </remarks>
internal sealed class RejectedException : Exception
{
    internal RejectedException(string kind, string message, string? causeMessage = null)
        : base(message)
    {
        Kind = kind;
        CauseMessage = causeMessage;
    }

    internal string Kind { get; }

    internal string? CauseMessage { get; }
}

/// <summary>One configured root, and the only thing that turns names into sources.</summary>
internal sealed partial class TemplateRoot
{
    internal const string TemplateFile = "templates.yml";
    internal const string DefinitionsFile = "definitions.yml";

    /// <summary>
    /// Reserved DOS device names.
    /// </summary>
    /// <remarks>Windows resolves these no matter what directory you are in and no matter what extension you append.</remarks>
    private static readonly HashSet<string> Devices = BuildDevices();

    private readonly string path;

    internal TemplateRoot(string path) => this.path = path;

    /// <summary>The configured root directory.</summary>
    internal string Path => path;

    /// <summary>Resolve <paramref name="name"/>, or throw <see cref="RejectedException"/> naming why it will not.</summary>
    internal Sources Resolve(string name)
    {
        Reject(name);
        var real = Contained(System.IO.Path.Combine(path, name));
        return new Sources(
            Read(System.IO.Path.Combine(real, TemplateFile)),
            Optional(System.IO.Path.Combine(real, DefinitionsFile)),
            real);
    }

    // A name is ONE segment. Refusing both separators outright subsumes
    // traversal, absolute paths and nested lookups in a single rule — the
    // simplest thing six other SDKs can mirror without drifting.
    [GeneratedRegex(@"[/\\]")]
    private static partial Regex Separators();

    [GeneratedRegex(@"\A[A-Za-z]:")]
    private static partial Regex DriveRelative();

    [GeneratedRegex(@"[.\s]+\z")]
    private static partial Regex TrailingDotsAndSpaces();

    private static HashSet<string> BuildDevices()
    {
        var devices = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "CON", "PRN", "AUX", "NUL" };
        for (var n = 1; n <= 9; n++)
        {
            devices.Add($"COM{n}");
            devices.Add($"LPT{n}");
        }

        return devices;
    }

    private static bool IsSeparator(string name) => Separators().IsMatch(name);

    private static bool IsControl(string name)
    {
        foreach (var character in name)
        {
            if (char.IsControl(character))
            {
                return true;
            }
        }

        return false;
    }

    private static bool IsDriveRelative(string name) => DriveRelative().IsMatch(name);

    /// <summary>
    /// Trailing dots and spaces are STRIPPED by Windows before it resolves a name.
    /// </summary>
    /// <remarks>
    /// So <c>CON.</c> and <c>"CON "</c> are the CON device just as <c>CON</c> is.
    /// Without that strip they slip past this rule and are refused later, by
    /// containment — still refused, but with a message about a missing template
    /// rather than about a reserved name.
    /// </remarks>
    private static bool IsDevice(string name)
    {
        var stem = TrailingDotsAndSpaces().Replace(name.Split('.')[0], string.Empty);
        return Devices.Contains(stem);
    }

    private static void Reject(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new RejectedException("template_name", "a template name must not be empty");
        }

        // Each rule, and what a caller is told when it fires.
        (Func<string, bool> Fires, string Explanation)[] rules =
        [
            (IsSeparator,
                "a name is one segment, so `/` and `\\` are never part of it "
                + "(which is also what makes `..` traversal impossible)"),
            (IsControl, "it contains a control character"),
            (IsDriveRelative,
                "it is drive-relative, which Windows resolves against that drive's current directory"),
            (IsDevice, "it is a reserved device name on Windows"),
        ];

        foreach (var (fires, explanation) in rules)
        {
            if (fires(name))
            {
                throw new RejectedException(
                    "template_name",
                    $"`{Text.Bounded(name)}` is not a template name: {explanation}");
            }
        }
    }

    private static string Read(string file)
    {
        try
        {
            return File.ReadAllText(file, System.Text.Encoding.UTF8);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            throw new RejectedException("template_unreadable", "the template could not be read", error.Message);
        }
    }

    private static string? Optional(string file) => File.Exists(file) ? Read(file) : null;

    /// <summary>
    /// The check a name-shape rule cannot make.
    /// </summary>
    /// <remarks>
    /// After following whatever the filesystem has there, is the answer still
    /// inside the root? A symlink is what this exists for — it passes every rule
    /// above and still points out.
    /// <para>
    /// The existence check is explicit: canonicalization here does NOT fail for
    /// a path that is not there, so a missing template would canonicalize
    /// happily and fall through to a confusing read error. And the containment
    /// test is STRUCTURAL rather than a string prefix compare, which a sibling
    /// directory named <c>root-evil</c> would beat.
    /// </para>
    /// </remarks>
    private string Contained(string directory)
    {
        string root;
        string real;
        try
        {
            if (!Directory.Exists(path) || !Directory.Exists(directory))
            {
                throw new DirectoryNotFoundException($"no directory at {directory}");
            }

            root = Canonical(path);
            real = Canonical(directory);
        }
        catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException or NotSupportedException)
        {
            throw new RejectedException("template_not_found", "no template by that name", error.Message);
        }

        if (string.Equals(real, root, StringComparison.Ordinal) || IsUnder(real, root))
        {
            return real;
        }

        throw new RejectedException("template_escapes_root", "the template resolves outside the template root");
    }

    /// <summary>Absolute, symlinks followed, and with NO trailing separator.</summary>
    /// <remarks>
    /// The trim is what keeps this SDK's canonical form the same SHAPE as the other
    /// six, whose canonicalizers (<c>realpath</c> and its equivalents) drop a trailing
    /// separator as part of what they do. .NET's do not — <c>DirectoryInfo.FullName</c>
    /// and <c>Path.GetFullPath</c> both preserve it — so a root configured as
    /// <c>templates/</c> canonicalized to <c>/app/templates/</c> while every parent
    /// <see cref="IsUnder"/> walks canonicalizes without one. No comparison could match,
    /// and a perfectly good root was reported as <c>template_escapes_root</c>. Relative
    /// versus absolute never mattered; the separator did.
    /// <para>
    /// <c>Path.TrimEndingDirectorySeparator</c> rather than a hand-rolled <c>TrimEnd</c>:
    /// it deliberately leaves a ROOT path alone, so <c>/</c> stays <c>/</c> and
    /// <c>C:\</c> stays <c>C:\</c> instead of becoming an empty string and a
    /// drive-relative <c>C:</c>.
    /// </para>
    /// <para>
    /// Normalizing HERE, not at the comparison: containment stays the structural walk
    /// below. Making the root comparable by string-prefix instead would admit a sibling
    /// directory named <c>&lt;root&gt;-evil</c>, which is exactly what that walk exists
    /// to refuse.
    /// </para>
    /// </remarks>
    private static string Canonical(string directory)
    {
        var info = new DirectoryInfo(directory);
        var resolved = info.ResolveLinkTarget(returnFinalTarget: true)?.FullName ?? info.FullName;
        return System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(resolved));
    }

    private static bool IsUnder(string real, string root)
    {
        var parent = Directory.GetParent(real);
        while (parent is not null)
        {
            if (string.Equals(parent.FullName, root, StringComparison.Ordinal))
            {
                return true;
            }

            parent = parent.Parent;
        }

        return false;
    }
}

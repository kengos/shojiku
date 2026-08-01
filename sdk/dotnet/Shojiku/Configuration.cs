// Process-wide configuration, and the entry points that reach it.
//
// The ecosystem idiom (a Configure call in application start-up) OVER the
// constructor, never a third precedence layer: what Configure sets stands
// exactly where an explicit constructor argument stands against the environment.
// So the order is
//
//     explicit argument > Shojiku.Configuration.Configure > SHOJIKU_*
//
// for the template root and the pack directories, and the deliberate reverse for
// the engine library — SHOJIKU_LIBRARY still wins over both, because where the
// engine lives is a deployment decision.
//
// `Strict` is the one exception, and it is the only place Configure beats a call
// site. Strictness is a restriction rather than a default: an operator who
// declared a lockdown must not have it lifted by application code passing
// strict: false. Every SDK mirrors that asymmetry.
//
// The rule the other six mirror: an ecosystem-standard configuration idiom feeds
// the same constructor and never adds a precedence level of its own.

namespace Shojiku;

/// <summary>Process-wide defaults for every client built after it is set.</summary>
public sealed class Config
{
    /// <summary>The directory template names resolve against.</summary>
    public string? Templates { get; set; }

    /// <summary>Directories holding font packs.</summary>
    public IReadOnlyList<string>? FontDirs { get; set; }

    /// <summary>Directories holding locale packs.</summary>
    public IReadOnlyList<string>? LocaleDirs { get; set; }

    /// <summary>The BCP 47 locale a render defaults to.</summary>
    public string? Lang { get; set; }

    /// <summary>An explicit path to the engine library. <c>SHOJIKU_LIBRARY</c> still beats it.</summary>
    public string? Library { get; set; }

    /// <summary>Where the host-side log channel writes, when an application wants one.</summary>
    public IShojikuLogger? Logger { get; set; }

    /// <summary>Whether clients refuse the bytes entrance and unregistered providers.</summary>
    public bool Strict { get; set; }

    /// <summary>The signing providers a strict client may be asked for by name.</summary>
    public IReadOnlyDictionary<string, object>? Providers { get; set; }

    /// <summary>Whether <c>SHOJIKU_*</c> lookups happen at all.</summary>
    public bool Env { get; set; } = true;

    /// <summary>
    /// A copy with <paramref name="overrides"/> applied — one client's resolution step.
    /// </summary>
    /// <remarks>
    /// A null override means "not given", so an explicit constructor argument
    /// beats a configured default and an absent one inherits it.
    /// <see cref="Strict"/> is the exception documented above: it is OR-ed
    /// rather than overridden.
    /// <para>
    /// <see cref="Providers"/> REPLACES rather than merges. A client that
    /// declares its own registry is stating the whole set it may sign with, and
    /// quietly adding globally-registered keys to that set would defeat the
    /// point.
    /// </para>
    /// </remarks>
    internal Config Merge(ClientOptions overrides) => new()
    {
        Templates = overrides.Templates ?? Templates,
        FontDirs = overrides.FontDirs ?? FontDirs,
        LocaleDirs = overrides.LocaleDirs ?? LocaleDirs,
        Lang = overrides.Lang ?? Lang,
        Library = overrides.Library ?? Library,
        Logger = overrides.Logger ?? Logger,
        Providers = overrides.Providers ?? Providers,
        Env = overrides.Env ?? Env,
        Strict = Strict || (overrides.Strict ?? false),
    };
}

/// <summary>What one client was constructed with, before the defaults are merged in.</summary>
internal sealed record ClientOptions(
    string? Templates = null,
    IReadOnlyList<string>? FontDirs = null,
    IReadOnlyList<string>? LocaleDirs = null,
    string? Lang = null,
    string? Library = null,
    IShojikuLogger? Logger = null,
    bool? Strict = null,
    IReadOnlyDictionary<string, object>? Providers = null,
    bool? Env = null);

/// <summary>The process-wide defaults, and the entry points that set them.</summary>
public static class Configuration
{
    private static Config current = new();

    /// <summary>The process-wide defaults, read by every client at construction.</summary>
    public static Config Current => current;

    /// <summary>
    /// Set process-wide defaults.
    /// </summary>
    /// <example>
    /// <code>
    /// Shojiku.Configuration.Configure(config =>
    /// {
    ///     config.Templates = "App/Templates";
    ///     config.Lang = "ja-JP";
    /// });
    /// </code>
    /// </example>
    /// <param name="configure">Mutates the process-wide defaults.</param>
    /// <returns>The configured defaults.</returns>
    public static Config Configure(Action<Config> configure)
    {
        configure(current);
        return current;
    }

    /// <summary>
    /// Drop every configured default.
    /// </summary>
    /// <remarks>
    /// Public because a global that cannot be reset makes every test suite
    /// invent its own teardown — and get it wrong in a randomly-ordered run.
    /// Applications call it at most once, if at all.
    /// </remarks>
    public static void Reset() => current = new Config();
}

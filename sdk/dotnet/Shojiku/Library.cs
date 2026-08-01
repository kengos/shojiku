// Finding and opening the engine's shared library.
//
// Resolution order, and the deliberate asymmetry with the template root:
// SHOJIKU_LIBRARY beats explicit configuration, which beats the copy shipped
// inside the platform package. That is the reverse of how the template root
// resolves, and on purpose — WHERE THE ENGINE LIVES is an operator/deployment
// decision that has to be able to win over application code, exactly as
// SHOJIKU_BIN does for the subprocess SDKs. WHICH TEMPLATES an application
// renders is the application's own decision, so there the explicit value wins.
//
// Nothing here downloads anything. A library that is not present is a named
// error listing the install channels.

using System.Runtime.InteropServices;

namespace Shojiku;

/// <summary>One opened engine library, and the ABI check that admitted it.</summary>
internal sealed class Library : IDisposable
{
    /// <summary>
    /// The ABI revision this package is written against.
    /// </summary>
    /// <remarks>
    /// It moves only when a symbol's meaning changes; new operations are
    /// appended without it, so a newer engine keeps working with this package.
    /// </remarks>
    internal const int AbiVersion = 1;

    /// <summary>Where a platform package puts the binary it ships.</summary>
    internal const string PackagedDirname = "native";

    /// <summary>
    /// The names a platform package's binary can have, in the order they are tried.
    /// </summary>
    /// <remarks>
    /// Six rather than three, and Windows is the reason: cargo emits
    /// <c>shojiku_capi.dll</c> with NO <c>lib</c> prefix while the Unix targets
    /// get one. Looking only for the prefixed form would make the package
    /// unloadable on the very platform this SDK's market runs on — and the one
    /// least likely to be in front of whoever writes the lookup.
    /// </remarks>
    internal static readonly string[] Names =
    [
        "libshojiku_capi.so",
        "shojiku_capi.so",
        "libshojiku_capi.dylib",
        "shojiku_capi.dylib",
        "libshojiku_capi.dll",
        "shojiku_capi.dll",
    ];

    private readonly Log log;
    private IntPtr handle;

    internal Library(string? path = null, Env? env = null, Log? log = null)
    {
        this.log = log ?? new Log();
        (Path, Source) = Discover(path, env ?? new Env(enabled: true));
        if (Path is null)
        {
            throw new LibraryNotFoundException(InstallHint("no engine library was found"));
        }

        handle = Open(Path);
        this.log.Event("library_loaded", ("path", Path), ("source", Source));
        CheckAbi();
    }

    /// <summary>Which file was opened.</summary>
    internal string? Path { get; }

    /// <summary>
    /// Which position in the resolution order won.
    /// </summary>
    /// <remarks>
    /// Worth reporting, because "which library did this process actually load,
    /// and why that one" is the question a deployment asks at 3am.
    /// </remarks>
    internal string Source { get; }

    /// <summary>The directory a platform package's binary lives in, if this is one.</summary>
    internal static string? PackagedDir()
    {
        // Beside the assembly, then the RID-specific NuGet layout. Both are
        // probed because a published application flattens the second into the
        // first and a referenced project does not.
        var basePath = AppContext.BaseDirectory;
        var rid = RuntimeInformation.RuntimeIdentifier;
        foreach (var candidate in new[]
        {
            System.IO.Path.Combine(basePath, PackagedDirname),
            System.IO.Path.Combine(basePath, "runtimes", rid, PackagedDirname),
        })
        {
            if (Directory.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    /// <summary>One resolved entry point, with the export's absence named rather than crashed on.</summary>
    internal IntPtr Export(string name)
    {
        if (NativeLibrary.TryGetExport(handle, name, out var address))
        {
            return address;
        }

        throw new LibraryNotFoundException($"{Path} exports no `{name}`");
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (handle == IntPtr.Zero)
        {
            return;
        }

        NativeLibrary.Free(handle);
        handle = IntPtr.Zero;
    }

    private static (string? Path, string Source) Discover(string? path, Env env)
    {
        var fromEnv = env.Get("SHOJIKU_LIBRARY");
        if (fromEnv is not null)
        {
            return (fromEnv, "environment");
        }

        if (path is not null)
        {
            return (path, "configuration");
        }

        return (Packaged(), "packaged");
    }

    private static string? Packaged()
    {
        var directory = PackagedDir();
        if (directory is null)
        {
            return null;
        }

        foreach (var name in Names)
        {
            var candidate = System.IO.Path.Combine(directory, name);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return null;
    }

    private static IntPtr Open(string path)
    {
        try
        {
            return NativeLibrary.Load(path);
        }
        catch (Exception error) when (error is DllNotFoundException or BadImageFormatException or ArgumentException)
        {
            throw new LibraryNotFoundException(
                InstallHint($"{path} could not be loaded ({error.Message})"),
                error);
        }
    }

    private static string InstallHint(string reason) =>
        $"{reason}.\n\n"
        + "This package never downloads the engine. Install it one of these ways:\n"
        + "  * install the NuGet package for your platform, which ships the binary\n"
        + "  * point SHOJIKU_LIBRARY at a shojiku_capi library you built\n"
        + "  * pass new ShojikuClient(library: \"/path/to/libshojiku_capi.so\")";

    /// <summary>
    /// Asked once, before anything else is called.
    /// </summary>
    /// <remarks>
    /// The header's own advice, and the only way a binding learns that a symbol
    /// it is about to call means something different now.
    /// </remarks>
    private unsafe void CheckAbi()
    {
        var found = (int)((delegate* unmanaged[Cdecl]<uint>)Export("shojiku_abi_version"))();
        log.Event("abi_checked", ("found", found), ("expected", AbiVersion));
        RequireAbi(found, Path!);
    }

    /// <summary>The rule the check applies, separated from the call that feeds it.</summary>
    internal static void RequireAbi(int found, string path)
    {
        if (found == AbiVersion)
        {
            return;
        }

        throw new AbiMismatchException(
            $"{path} implements ABI revision {found}; this package speaks {AbiVersion}");
    }
}

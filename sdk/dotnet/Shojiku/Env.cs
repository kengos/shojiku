// The one place this package reads the environment.
//
// A client is constructed with env: true (the default) or env: false, and that
// single flag governs EVERY SHOJIKU_* lookup — the template root, the font and
// locale directories, and the library path. One flag rather than one per
// variable is the reference decision the other six SDKs mirror: an application
// that wants a hermetic configuration wants all of it off, and a per-variable
// set of knobs is a shape nobody can keep consistent across seven languages.
//
// Disabled lookups behave exactly as unset variables do, so calling code has no
// second branch to get wrong.

namespace Shojiku;

/// <summary>Reads <c>SHOJIKU_*</c> variables, or does not, per one flag.</summary>
internal sealed class Env
{
    private readonly bool enabled;
    private readonly IReadOnlyDictionary<string, string>? source;

    internal Env(bool enabled, IReadOnlyDictionary<string, string>? source = null)
    {
        this.enabled = enabled;
        this.source = source;
    }

    /// <summary>The variable's value, or null when unset, blank, or lookups are off.</summary>
    internal string? Get(string name)
    {
        if (!enabled)
        {
            return null;
        }

        string? value;
        if (source is null)
        {
            value = Environment.GetEnvironmentVariable(name);
        }
        else
        {
            source.TryGetValue(name, out value);
        }

        return string.IsNullOrEmpty(value) ? null : value;
    }

    /// <summary>
    /// A path-separator-separated variable as a list of directories.
    /// </summary>
    /// <remarks>Which is how every other tool in this family spells "several paths in one variable".</remarks>
    internal IReadOnlyList<string> Paths(string name)
    {
        var value = Get(name);
        if (value is null)
        {
            return [];
        }

        var listed = new List<string>();
        foreach (var entry in value.Split(System.IO.Path.PathSeparator))
        {
            if (entry.Length > 0)
            {
                listed.Add(entry);
            }
        }

        return listed;
    }
}

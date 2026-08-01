// One client's resolved configuration, plus the collaborators built from it.
//
// Configuration answers "what was configured"; this answers "what does THIS
// client use", which is the merge of the process-wide defaults with the
// arguments the client was constructed with. Keeping it out of the client keeps
// the precedence rules in one readable place instead of spread across a
// constructor.
//
// Everything is built lazily and memoized: a bytes-first application never
// configures a template root, and demanding one at construction would refuse a
// legitimate client.

namespace Shojiku;

/// <summary>The resolved settings of one client, and what they build.</summary>
internal sealed class Settings : IDisposable
{
    private readonly Config config;
    private readonly Lazy<Env> env;
    private readonly Lazy<Log> log;
    private readonly Lazy<Lockdown> lockdown;
    private readonly Lazy<Library> library;
    private readonly Lazy<IReadOnlyList<string>> fontDirs;
    private readonly Lazy<IReadOnlyList<string>> localeDirs;
    private readonly Lazy<TemplateRoot?> templateRoot;

    internal Settings(ClientOptions overrides)
    {
        config = Configuration.Current.Merge(overrides);
        Lang = config.Lang;

        env = new Lazy<Env>(() => new Env(config.Env));
        log = new Lazy<Log>(() => new Log(config.Logger));
        lockdown = new Lazy<Lockdown>(() => new Lockdown(config.Strict, config.Providers));
        library = new Lazy<Library>(() => new Library(config.Library, Env, Log));
        fontDirs = new Lazy<IReadOnlyList<string>>(() => config.FontDirs ?? Env.Paths("SHOJIKU_FONT_DIR"));
        localeDirs = new Lazy<IReadOnlyList<string>>(() => config.LocaleDirs ?? Env.Paths("SHOJIKU_LOCALE_DIR"));
        templateRoot = new Lazy<TemplateRoot?>(() =>
        {
            var root = config.Templates ?? Env.Get("SHOJIKU_TEMPLATE_ROOT");
            return root is null ? null : new TemplateRoot(root);
        });
    }

    /// <summary>This client's default locale, which a per-call one beats.</summary>
    internal string? Lang { get; }

    internal Env Env => env.Value;

    internal Log Log => log.Value;

    internal Lockdown Lockdown => lockdown.Value;

    internal Library Library => library.Value;

    internal IReadOnlyList<string> FontDirs => fontDirs.Value;

    internal IReadOnlyList<string> LocaleDirs => localeDirs.Value;

    /// <summary>The template root, or null when nothing configured one.</summary>
    internal TemplateRoot? TemplateRoot => templateRoot.Value;

    /// <inheritdoc />
    public void Dispose()
    {
        if (library.IsValueCreated)
        {
            library.Value.Dispose();
        }
    }
}

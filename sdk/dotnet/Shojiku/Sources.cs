// The sources one render runs over.
//
// The template text, the definitions text when there are any, and the directory
// bundled assets resolve against.
//
// A value rather than a file layout, because there are two ways to get one and
// only one of them involves the filesystem. `TemplateRoot` produces it by
// resolving a NAME; `ShojikuClient.GenerateSource` produces it from bytes the
// application already has. Everything downstream — the request envelope, the
// engine — sees the same object either way, which is what keeps the second
// entrance from being a second code path.

namespace Shojiku;

/// <summary>One render's template text, definitions text and assets directory.</summary>
/// <param name="Template">The template source text.</param>
/// <param name="Definitions">The definitions source text, when there are any.</param>
/// <param name="AssetsDir">The directory bundled assets resolve against, when there is one.</param>
internal sealed record Sources(string Template, string? Definitions = null, string? AssetsDir = null);

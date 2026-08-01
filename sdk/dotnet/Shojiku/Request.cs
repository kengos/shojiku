// The one JSON envelope every document operation crosses with.
//
// Both entrances build it: sources resolved from a template NAME and sources the
// application handed over as BYTES produce the same request, because the C
// surface has one request schema — and that schema rejects unknown keys, so a
// key the engine may legitimately not receive is dropped rather than sent as
// null.

using System.Text.Json;

namespace Shojiku;

/// <summary>One render's envelope, ready for the C surface.</summary>
internal sealed class Request
{
    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        // The engine's surface is UTF-8 by contract, so there is nothing to gain
        // from escaping non-ASCII into \uXXXX and a lot of size to lose.
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private readonly Sources sources;
    private readonly object? parameters;
    private readonly string? lang;
    private readonly IReadOnlyList<string> fontDirs;
    private readonly IReadOnlyList<string> localeDirs;

    internal Request(
        Sources sources,
        object? parameters,
        string? lang = null,
        IReadOnlyList<string>? fontDirs = null,
        IReadOnlyList<string>? localeDirs = null)
    {
        this.sources = sources;
        this.parameters = parameters;
        this.lang = lang;
        this.fontDirs = fontDirs ?? [];
        this.localeDirs = localeDirs ?? [];
    }

    /// <summary>
    /// The serialized envelope as UTF-8 bytes.
    /// </summary>
    /// <remarks>
    /// Params that cannot be serialized as JSON are programmer misuse — the
    /// engine's surface is UTF-8 JSON by contract, so there is nothing to render
    /// — but a bare <see cref="JsonException"/> or
    /// <see cref="NotSupportedException"/> escaping from <c>Generate</c> would
    /// make callers catch a foreign class they never invited into their code.
    /// </remarks>
    internal byte[] Encoded()
    {
        try
        {
            return JsonSerializer.SerializeToUtf8Bytes(Envelope(), SerializerOptions);
        }
        catch (Exception error)
        {
            // Deliberately broad. System.Text.Json raises JsonException and
            // NotSupportedException for shapes it refuses, but anything the
            // caller's own object does on the way out — a property getter that
            // throws — arrives raw. All of it means one thing: there is nothing
            // to render. Naming a narrower set would let that last case escape
            // `Generate` as a foreign exception class nobody invited in.
            throw new UsageException($"params could not be serialized as UTF-8 JSON: {error.Message}", error);
        }
    }

    private Dictionary<string, object> Envelope()
    {
        var envelope = new Dictionary<string, object>(StringComparer.Ordinal)
        {
            ["template"] = sources.Template,
            ["params"] = ParamsSource(),
            ["fontDirs"] = fontDirs,
            ["localeDirs"] = localeDirs,
        };

        // Absent rather than null: the request schema rejects unknown and
        // ill-typed keys, so a key the engine may legitimately not receive is
        // dropped instead of sent empty.
        if (sources.Definitions is not null)
        {
            envelope["definitions"] = sources.Definitions;
        }

        if (sources.AssetsDir is not null)
        {
            envelope["assetsDir"] = sources.AssetsDir;
        }

        if (lang is not null)
        {
            envelope["lang"] = lang;
        }

        return envelope;
    }

    /// <summary>
    /// A string params is the caller's own source text, passed through VERBATIM.
    /// </summary>
    /// <remarks>
    /// The engine parses JSON or YAML (YAML is a superset), so re-encoding it
    /// here would only be a chance to change it. Anything else is serialized as
    /// JSON.
    /// <para>
    /// There is deliberately no per-format method family — format dispatch is
    /// the engine's, and an SDK that offered <c>GenerateYaml</c> would be
    /// claiming a distinction the engine does not make.
    /// </para>
    /// </remarks>
    private string ParamsSource() =>
        parameters as string ?? JsonSerializer.Serialize(parameters, SerializerOptions);
}

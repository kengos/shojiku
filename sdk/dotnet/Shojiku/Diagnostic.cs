// One thing the engine noticed about a document.
//
// Passed through, never interpreted. `Code` and `Args` are the engine's frozen
// contract — a translating consumer renders its own message from them — so this
// class parses the wire and stops. It does not translate, it does not
// re-classify, and it never becomes an exception: a render that warns still
// succeeded, and a render that failed says why in these.

using System.Text.Json;

namespace Shojiku;

/// <summary>One engine diagnostic, exactly as the engine stated it.</summary>
public sealed class Diagnostic
{
    /// <summary>Reads one diagnostic off the wire.</summary>
    public Diagnostic(JsonElement item)
    {
        Severity = Wire.String(item, "severity");
        Code = Wire.String(item, "code");
        Category = Wire.String(item, "category");
        Message = Wire.String(item, "message");
        Path = Wire.String(item, "path");
        Origin = Wire.String(item, "origin");
        Args = Wire.Map(item, "args");
    }

    /// <summary><c>error</c> or <c>warning</c>, as the engine classified it.</summary>
    public string? Severity { get; }

    /// <summary>The engine's stable, append-only diagnostic code.</summary>
    public string? Code { get; }

    /// <summary>The engine's grouping for this code.</summary>
    public string? Category { get; }

    /// <summary>The engine's own English message. A translating consumer renders from <see cref="Code"/> and <see cref="Args"/> instead.</summary>
    public string? Message { get; }

    /// <summary>Where in the document the engine noticed it.</summary>
    public string? Path { get; }

    /// <summary>Which input the diagnostic came from.</summary>
    public string? Origin { get; }

    /// <summary>The typed arguments behind the message, passed through untranslated.</summary>
    public IReadOnlyDictionary<string, JsonElement> Args { get; }

    /// <summary>Whether this diagnostic is an error.</summary>
    public bool IsError => Severity == "error";

    /// <summary>Whether this diagnostic is a warning.</summary>
    public bool IsWarning => Severity == "warning";

    /// <summary>Every diagnostic in a payload, or nothing at all for an empty one.</summary>
    public static IReadOnlyList<Diagnostic> Parse(string payload)
    {
        if (string.IsNullOrEmpty(payload))
        {
            return [];
        }

        using var document = JsonDocument.Parse(payload);
        if (!document.RootElement.TryGetProperty("items", out var items)
            || items.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var parsed = new List<Diagnostic>(items.GetArrayLength());
        foreach (var item in items.EnumerateArray())
        {
            parsed.Add(new Diagnostic(item));
        }

        return parsed;
    }

    /// <inheritdoc />
    public override string ToString() =>
        Path is null ? Message ?? string.Empty : $"{Path}: {Message}";
}

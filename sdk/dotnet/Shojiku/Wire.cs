// Reading the engine's JSON without modelling it.
//
// Every payload this SDK parses is append-only: the engine may add a key at any
// time, and a binding that deserialized into fixed types would owe a new field
// in seven languages every time it did. So the reads here are all
// "this key if it is there, and its absence is data" — the same posture that
// makes `EngineInfo` a plain dictionary and a diagnostic's `Args` pass through
// untranslated.
//
// A `JsonDocument` owns its buffers, so every value taken out of one is CLONED
// before the document is disposed. A `JsonElement` that outlives its document
// is a use-after-free in managed clothing: it throws rather than corrupting,
// but it throws far from here.

using System.Text.Json;

namespace Shojiku;

internal static class Wire
{
    /// <summary>The string at <paramref name="key"/>, or null when absent or not a string.</summary>
    internal static string? String(JsonElement element, string key) =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(key, out var value)
        && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    /// <summary>The object at <paramref name="key"/> as a dictionary of cloned elements.</summary>
    internal static IReadOnlyDictionary<string, JsonElement> Map(JsonElement element, string key)
    {
        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(key, out var value)
            || value.ValueKind != JsonValueKind.Object)
        {
            return new Dictionary<string, JsonElement>();
        }

        var map = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var property in value.EnumerateObject())
        {
            map[property.Name] = property.Value.Clone();
        }

        return map;
    }

    /// <summary>Every entry of a top-level object payload, cloned.</summary>
    internal static IReadOnlyDictionary<string, JsonElement> Object(string payload)
    {
        var map = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        if (string.IsNullOrEmpty(payload))
        {
            return map;
        }

        using var document = JsonDocument.Parse(payload);
        if (document.RootElement.ValueKind != JsonValueKind.Object)
        {
            return map;
        }

        foreach (var property in document.RootElement.EnumerateObject())
        {
            map[property.Name] = property.Value.Clone();
        }

        return map;
    }

    /// <summary>The list of strings at <paramref name="key"/>, or an empty one.</summary>
    internal static IReadOnlyList<string> Strings(JsonElement element, string key)
    {
        if (element.ValueKind != JsonValueKind.Object
            || !element.TryGetProperty(key, out var value)
            || value.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var listed = new List<string>(value.GetArrayLength());
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind == JsonValueKind.String)
            {
                listed.Add(item.GetString()!);
            }
        }

        return listed;
    }
}

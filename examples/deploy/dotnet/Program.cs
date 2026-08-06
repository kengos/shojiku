// Renders the vendored template with its bundled sample data and writes the
// PDF to stdout — swap the params line for data from your app.
using System.Text.Json;
using Shojiku;

using var client = new ShojikuClient(
    templates: "templates/",
    fontDirs: new[] { "packs/fonts" },
    localeDirs: new[] { "packs/locale" });
var parameters = JsonSerializer.Deserialize<JsonElement>(
    File.ReadAllText("templates/receipt-ja/params.json"));
var result = client.Generate("receipt-ja", parameters);
if (!result.Success)
{
    Console.Error.WriteLine($"render failed: {result.Failure!.Kind} | {result.Failure.Message}");
    Environment.Exit(1);
}
using var stdout = Console.OpenStandardOutput();
stdout.Write(result.Artifact!.Bytes);

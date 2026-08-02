#!/bin/sh
# Published-install proof, dotnet: `dotnet add package Shojiku` from
# nuget.org, which must resolve the RID-specific native asset for this
# container. See published-python.sh for why the registry copy is proved
# separately.
. "$(dirname "$0")/common.sh"

IMG="mcr.microsoft.com/dotnet/sdk:${DOTNET_VER:-10.0}-noble"

echo "== published-install proof (dotnet, $IMG) =="

cat > "$WORK/Program.cs" <<'CS'
using System.Text.Json;
using Shojiku;

if (Environment.GetEnvironmentVariable("SHOJIKU_LIBRARY") is not null)
{
    throw new InvalidOperationException("void: a library was injected");
}
if (Directory.Exists("/opt/shojiku"))
{
    throw new InvalidOperationException("void: an engine exists outside the package");
}

using var client = new ShojikuClient(
    templates: "/ex",
    fontDirs: new[] { "/packs/fonts" },
    localeDirs: new[] { "/packs/locale" });
var parameters = JsonSerializer.Deserialize<JsonElement>(
    File.ReadAllText("/ex/receipt-ja/params.json"));
var result = client.Generate("receipt-ja", parameters);
if (!result.Success)
{
    Console.Error.WriteLine($"FAILED: {result.Failure!.Kind} | {result.Failure.Message}");
    Environment.Exit(1);
}
File.WriteAllBytes("/w/out.pdf", result.Artifact!.Bytes);
CS

docker run --rm -e VER="${SHOJIKU_VERSION:-}" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
  mkdir /consumer && cd /consumer
  dotnet new console -o . >/dev/null
  rm -f Program.cs && cp /w/Program.cs Program.cs
  if [ -n "$VER" ]; then dotnet add package Shojiku -v "$VER"; else dotnet add package Shojiku; fi
  # The native asset is RID-scoped, so name what restore actually laid down —
  # a package that resolves but carries no runtimes/ entry loads nothing.
  find ~/.nuget/packages/shojiku -path "*runtimes*" -name "*shojiku_capi*" -printf "native asset: %P\n" 2>/dev/null || true
  dotnet run --property WarningLevel=0'

assert_pdf "$WORK/out.pdf"

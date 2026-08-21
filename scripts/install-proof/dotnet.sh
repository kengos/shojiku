#!/bin/sh
# Install proof, dotnet: nupkg carrying the cdylib as a RID native asset
# (runtimes/<rid>/native/), installed into a console app from a local feed in
# a clean floor-version container. See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

IMG="mcr.microsoft.com/dotnet/sdk:${DOTNET_VER:-10.0}-noble"
require_artifact "$CAPI_LIB" engine:capi-lib

echo "== install proof (dotnet, $IMG) =="

# The RID must match the architecture the CONTAINER runs as — which is the
# host's, since the payload is the host-arch build. Filing an arm64 library
# under linux-x64 is refused by the runtime's own RID probing (correctly:
# that refusal is the asset layout doing its job), so derive rather than
# hardcode.
case "$(uname -m)" in
  arm64|aarch64) RID=linux-arm64 ;;
  x86_64)        RID=linux-x64 ;;
  *) echo "install-proof: unmapped host architecture $(uname -m)" >&2; exit 1 ;;
esac

cp -R "$ROOT/sdk/dotnet" "$WORK/src"
mkdir -p "$WORK/src/Shojiku/runtimes/$RID/native"
cp "$CAPI_LIB" "$WORK/src/Shojiku/runtimes/$RID/native/"

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

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  "$IMG" sh -euc '
  cd /w/src
  dotnet pack Shojiku/Shojiku.csproj -c Release -o /w/feed --nologo -v q
  # The csproj must have CARRIED the payload — a pack list of the README
  # alone builds a package that installs fine and renders nothing. A nupkg is
  # a zip, and zip entry NAMES are stored uncompressed, so the raw archive
  # greps for the path without any unzip tool in the image.
  grep -aq "runtimes/'"$RID"'/native/libshojiku_capi.so" /w/feed/Shojiku.*.nupkg || {
    echo "the built nupkg does not contain the engine payload" >&2; exit 1; }
  echo "payload in nupkg: runtimes/'"$RID"'/native/libshojiku_capi.so"

  mkdir /w/app && cd /w/app
  dotnet new console --no-restore -o . >/dev/null
  cp /w/Program.cs Program.cs
  dotnet add package Shojiku --source /w/feed >/dev/null
  dotnet run -c Release --nologo'

assert_pdf "$WORK/out.pdf"

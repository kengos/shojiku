#!/bin/sh
# Install proof, go: a scratch module depending on the SDK, driving a CLI
# found on PATH — the subprocess SDKs' payload is the installed `shojiku`
# binary, and their proof is that they FIND and DRIVE it with no SHOJIKU_BIN
# pointing the way. The module is wired by a replace directive because the
# module path has no published tag yet; the SDK has zero dependencies, so
# nothing else is fetched either. See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

IMG="golang:${GO_VER:-1.25}-bookworm"
require_artifact "$CLI_BIN" cli-bin

echo "== install proof (go, $IMG) =="

cp -R "$ROOT/sdk/go" "$WORK/pkg"
cp "$CLI_BIN" "$WORK/shojiku"

mkdir -p "$WORK/consumer"
cat > "$WORK/consumer/go.mod" <<'MOD'
module proof/consumer

go 1.25

require github.com/kengos/shojiku/sdk/go v0.0.0

replace github.com/kengos/shojiku/sdk/go => /w/pkg
MOD

cat > "$WORK/consumer/main.go" <<'GO'
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	shojiku "github.com/kengos/shojiku/sdk/go"
)

func main() {
	if _, injected := os.LookupEnv("SHOJIKU_BIN"); injected {
		panic("void: a binary was injected")
	}
	if _, err := os.Stat("/opt/shojiku"); err == nil {
		panic("void: an engine exists outside PATH")
	}

	client, err := shojiku.NewClient(
		shojiku.WithTemplates("/ex"),
		shojiku.WithFontDirs("/packs/fonts"),
		shojiku.WithLocaleDirs("/packs/locale"),
	)
	if err != nil {
		panic(err)
	}

	raw, err := os.ReadFile("/ex/receipt-ja/params.json")
	if err != nil {
		panic(err)
	}
	var params any
	if err := json.Unmarshal(raw, &params); err != nil {
		panic(err)
	}

	result, err := client.Generate(context.Background(), "receipt-ja", params)
	if err != nil {
		panic(err)
	}
	if !result.Success() {
		fmt.Fprintf(os.Stderr, "FAILED: %s | %s\n",
			result.Failure().Kind, result.Failure().Message)
		os.Exit(1)
	}
	if err := os.WriteFile("/w/out.pdf", result.Artifact().Bytes(), 0o644); err != nil {
		panic(err)
	}
}
GO

docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  -v "$WORK/shojiku:/usr/local/bin/shojiku:ro" \
  "$IMG" sh -euc '
  cd /w/consumer
  go mod tidy >/dev/null 2>&1
  go run .'

assert_pdf "$WORK/out.pdf"

#!/bin/sh
# Install proof, php: the composer package installed into a consumer project,
# driving a CLI found on PATH — the subprocess SDKs' payload is the installed
# `shojiku` binary, and their proof is that they FIND and DRIVE it with no
# SHOJIKU_BIN pointing the way. See common.sh for what a proof is.
. "$(dirname "$0")/common.sh"

IMG="php:${PHP_VER:-8.3}-cli-bookworm"
require_artifact "$CLI_BIN" engine:cli-bin

echo "== install proof (php, $IMG) =="

cp -R "$ROOT/sdk/php" "$WORK/src"
rm -rf "$WORK/src/vendor"
cp "$CLI_BIN" "$WORK/shojiku"

cat > "$WORK/composer.json" <<'JSON'
{
  "name": "proof/consumer",
  "repositories": [{ "type": "path", "url": "/w/src", "options": { "symlink": false } }],
  "require": { "shojiku/shojiku": "@dev" }
}
JSON

cat > "$WORK/proof.php" <<'PHP'
<?php

declare(strict_types=1);

require "/consumer/vendor/autoload.php";

if (getenv("SHOJIKU_BIN") !== false) {
    throw new RuntimeException("void: a binary was injected");
}
if (file_exists("/opt/shojiku")) {
    throw new RuntimeException("void: an engine exists outside PATH");
}

$client = new \Shojiku\Client(
    templates: "/ex",
    fontDirs: ["/packs/fonts"],
    localeDirs: ["/packs/locale"],
);
$params = json_decode(file_get_contents("/ex/receipt-ja/params.json"), true);
$result = $client->generate("receipt-ja", $params);
if (!$result->success()) {
    fwrite(STDERR, "FAILED: {$result->failure()->kind} | {$result->failure()->message}\n");
    exit(1);
}
file_put_contents("/w/out.pdf", $result->artifact()->bytes());
PHP

# The php base image carries no composer; borrowing the binary from the
# composer image (exactly as the gate Dockerfile does) keeps the install
# environment itself the plain floor image.
docker run --rm -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  -v "$WORK/shojiku:/usr/local/bin/shojiku:ro" \
  "$IMG" sh -euc '
  php -r "copy(\"https://getcomposer.org/download/latest-stable/composer.phar\", \"/usr/local/bin/composer\");" \
    && chmod +x /usr/local/bin/composer
  mkdir /consumer && cd /consumer
  cp /w/composer.json .
  COMPOSER_ROOT_VERSION=1.0.0 composer install --quiet --no-interaction
  php /w/proof.php'

assert_pdf "$WORK/out.pdf"

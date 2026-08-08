#!/bin/sh
# Published-install proof, php: `composer require shojiku/shojiku` from
# Packagist, driving a `shojiku` CLI taken from the published GitHub Release.
#
# This is the only proof whose two halves come from two different publish
# channels, and that is the package's design rather than a shortcut: the
# composer package is pure PHP and renders nothing on its own — it drives a
# binary the user installs separately, which its README says before it says
# anything else. A proof that injected a locally built CLI would be exercising
# half the story and calling it published. See published-python.sh for why the
# registry copy is worth proving separately at all.
. "$(dirname "$0")/common.sh"

IMG="php:${PHP_VER:-8.3}-cli-bookworm"

# The release asset's filename carries the version, so `latest` has to be
# resolved to a tag before anything can be downloaded.
# Downloaded to a FILE rather than piped: a pipeline reports only the last
# command's status, so `curl | sed` would turn a failed fetch into an empty
# version and `curl | tar` a truncated archive into a confusing tar error.
VER="${SHOJIKU_VERSION:-}"
if [ -z "$VER" ]; then
  curl -fsSL -o "$WORK/latest.json" \
    https://api.github.com/repos/kengos/shojiku/releases/latest
  VER=$(sed -n 's/.*"tag_name"[^"]*"v\{0,1\}\([^"]*\)".*/\1/p' "$WORK/latest.json" | head -1)
  [ -n "$VER" ] || {
    echo "published-php: no tag_name in the latest-release response" >&2
    exit 1
  }
fi

# The container runs the host's architecture, so the archive has to match it —
# an x64 binary mounted into an arm64 container fails to exec, with an error
# that names the format rather than the mistake.
case "$(uname -m)" in
  arm64|aarch64) SLUG=linux-arm64 ;;
  x86_64|amd64)  SLUG=linux-x64 ;;
  *) echo "published-php: no release archive for $(uname -m)" >&2; exit 1 ;;
esac

echo "== published-install proof (php, $IMG, CLI $VER $SLUG) =="

mkdir -p "$WORK/cli"
curl -fsSL -o "$WORK/cli.tar.gz" \
  "https://github.com/kengos/shojiku/releases/download/v$VER/shojiku-$VER-$SLUG.tar.gz"
tar xzf "$WORK/cli.tar.gz" -C "$WORK/cli"
chmod +x "$WORK/cli/shojiku"

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

# The CLI is mounted onto PATH rather than pointed at by SHOJIKU_BIN: finding
# it is part of what the package has to do. The php base image carries no
# composer, so the binary is borrowed from the composer image exactly as the
# local proof and the gate Dockerfile do.
docker run --rm -e VER="$VER" -v "$WORK:/w" \
  -v "$ROOT/examples/business:/ex:ro" -v "$ROOT/packs:/packs:ro" \
  -v "$WORK/cli/shojiku:/usr/local/bin/shojiku:ro" \
  "$IMG" sh -euc '
  test ! -e /opt/shojiku || { echo "void: an engine exists outside the package" >&2; exit 1; }
  shojiku --version
  php -r "copy(\"https://getcomposer.org/download/latest-stable/composer.phar\", \"/usr/local/bin/composer\");" \
    && chmod +x /usr/local/bin/composer
  mkdir /consumer && cd /consumer
  composer init --no-interaction --name=proof/consumer --quiet
  composer require --no-interaction --quiet "shojiku/shojiku:$VER"
  # WHICH package resolved matters: a `path` or VCS repository would prove
  # something else entirely, so the installed copy must have come from dist.
  composer show shojiku/shojiku | head -20
  php /w/proof.php'

assert_pdf "$WORK/out.pdf"

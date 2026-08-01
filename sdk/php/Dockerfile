# The PHP SDK's gate environment.
#
# Nobody needs PHP installed to work on this package: `make sdk-php` builds and
# runs this image, exactly as the Rust, Node, Ruby, Python, .NET and Java gates
# run in theirs.
#
# The engine is INJECTED as a pre-compiled artifact — here the `shojiku`
# BINARY, built once by `make cli-bin` through the pinned Rust image, because
# this SDK's transport is a subprocess rather than a linked library. Seven
# language images each building the engine would make the gate grid unusable.
#
# Two things this file has to get right, both of which fail confusingly:
#
#   * the repository root `.dockerignore` excludes `sdk`, so this build sees
#     nothing of the package it exists to test. The sidecar
#     `Dockerfile.dockerignore` beside this file REPLACES that root file for
#     this build and re-admits what is needed.
#   * the binary has to run against this image's libc. Bookworm here, bookworm
#     in the Rust image — a musl base would run nothing.
#
# PHP 8.3 is the FLOOR from docs/agents/sdk.md, and the floor is what the gate
# runs on: a package that only works on the newest interpreter has not actually
# supported the version it claims.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk-php` gates on.
ARG PHP_VERSION=8.3
FROM php:${PHP_VERSION}-cli-bookworm

# openssl is the test-key generator's only dependency
# (scripts/gen-test-keys.sh, shared with the Rust suites); git and unzip are
# what composer wants while it installs the gate toolchain. Nothing here is
# installed on the PACKAGE's behalf — it is pure PHP with no dependencies and
# no extension to build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl git unzip \
  && rm -rf /var/lib/apt/lists/*

# PCOV rather than Xdebug: the coverage driver is all this gate needs from
# either, and pcov costs a fraction of the run time. PHPUnit has no
# fail-under flag, so the 100% bar is asserted from the clover report by
# tools/coverage-gate.php.
RUN pecl install pcov \
  && docker-php-ext-enable pcov \
  && echo "pcov.enabled=1" > /usr/local/etc/php/conf.d/pcov.ini

# The gate toolchain, PINNED so a gate run never resolves a different linter
# than the one the change was written against. Installed globally rather than
# as `require-dev`, which is what keeps `composer.json` free of development
# dependencies — and therefore free of a lockfile that nothing consumes.
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV COMPOSER_HOME=/opt/composer
ENV PATH="/opt/composer/vendor/bin:${PATH}"
RUN composer global require --no-interaction --no-progress \
      "phpunit/phpunit:11.5.56" \
      "phpstan/phpstan:2.2.7" \
      "friendsofphp/php-cs-fixer:3.95.18" \
  && composer clear-cache

# Outside /repo on purpose: the gate mounts the repository over /repo, and a
# binary that lived there would be hidden by the mount.
COPY dist/cli/local/shojiku /opt/shojiku/bin/shojiku
ENV SHOJIKU_BIN=/opt/shojiku/bin/shojiku

# php-cs-fixer refuses to run without one, and a gate container has no home
# directory it would otherwise use.
ENV PHP_CS_FIXER_IGNORE_ENV=1

WORKDIR /repo/sdk/php
# One command per line, like the make recipes: under `sh -euc`, errexit is
# SUPPRESSED for a failing command inside an `&&` list, so a chain with
# anything after it reports the LAST step's status.
CMD ["sh", "-euc", "php-cs-fixer check --diff ; phpstan analyse --memory-limit=512M ; phpunit ; php tools/coverage-gate.php"]

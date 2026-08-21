# The Go SDK's gate environment.
#
# Nobody needs Go installed to work on this package: `make sdk:go:verify` builds and
# runs this image, exactly as the Rust, Node, Ruby, Python, .NET, Java and PHP
# gates run in theirs.
#
# The engine is INJECTED as a pre-compiled artifact — here the `shojiku`
# BINARY, built once by `make engine:cli-bin` through the pinned Rust image, because
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
# Go 1.25 is the FLOOR from docs/agents/sdk.md, and the floor is what the gate
# runs on: a package that only works on the newest toolchain has not actually
# supported the version it claims. Go's compatibility promise makes the `go`
# directive a minimum rather than a ceiling, so a newer toolchain would still
# build it — which is exactly why the gate must not be the thing that proves
# it, and pins the floor instead.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk:go:verify` gates on.
ARG GO_VERSION=1.25
FROM golang:${GO_VERSION}-bookworm

# openssl is the test-key generator's only dependency (scripts/gen-test-keys.sh,
# shared with the Rust suites). Nothing else is installed on the PACKAGE's
# behalf — it is pure Go with no dependencies and no cgo.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# The linter, PINNED and copied from its own published image, so a gate run
# never resolves a different version than the one the change was written
# against — and so this build never compiles a linter from source.
COPY --from=golangci/golangci-lint:v2.6.0 /usr/bin/golangci-lint /usr/bin/golangci-lint

# Outside /repo on purpose, twice over: the gate mounts the repository over
# /repo, so a cache written under it would be hidden by the mount (and would
# litter the working tree), and a binary that lived there would be hidden too.
ENV GOCACHE=/opt/go/cache
ENV GOMODCACHE=/opt/go/mod
ENV GOLANGCI_LINT_CACHE=/opt/go/lint
COPY dist/cli/local/shojiku /opt/shojiku/bin/shojiku
ENV SHOJIKU_BIN=/opt/shojiku/bin/shojiku

WORKDIR /repo/sdk/go
# One command per line, like the make recipes: under `sh -euc`, errexit is
# SUPPRESSED for a failing command inside an `&&` list, so a chain with
# anything after it reports the LAST step's status.
#
# `gofmt -l` prints the files it would change and exits 0 either way, so the
# check is that it printed NOTHING — captured and printed rather than tested
# with `test -z`, which under `sh -euc` aborts the whole recipe with no output
# at all and names neither the tool nor the file. And the coverage bar is
# asserted from the profile here rather than by a program in the module, which
# would otherwise be part of the surface it measures.
CMD ["sh", "-euc", "gofmt -l . > /tmp/fmt.txt ; if [ -s /tmp/fmt.txt ]; then echo 'gofmt would rewrite:'; cat /tmp/fmt.txt; exit 1; fi ; go vet ./... ; golangci-lint run ; go test ./... -race -coverprofile=cover.out ; go tool cover -func=cover.out | awk '/^total:/ {print; if ($3 != \"100.0%\") exit 1}'"]

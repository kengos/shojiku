# The .NET SDK's gate environment.
#
# Nobody needs the .NET SDK installed to work on this package: `make sdk-dotnet`
# builds and runs this image, exactly as the Rust, Node, Ruby and Python gates
# run in theirs.
#
# The engine library is INJECTED as a pre-compiled artifact (built once by
# `make capi-lib` through the pinned Rust image) rather than compiled from Rust
# source here. Seven language images each building the engine would make the
# gate grid unusable.
#
# Two things this file has to get right, both of which fail confusingly:
#
#   * the repository root `.dockerignore` excludes `sdk`, so this build sees
#     nothing of the package it exists to test. The sidecar
#     `Dockerfile.dockerignore` beside this file REPLACES that root file for
#     this build and re-admits what is needed.
#   * the library has to be able to LOAD against this image's libc. The ruby and
#     python images say "bookworm here, bookworm in the Rust image"; .NET cannot,
#     because Microsoft ships NO Debian-based .NET 10 image — the Linux tags are
#     `noble` (Ubuntu 24.04), `azurelinux3.0` and `alpine`. Noble is the right
#     one and the rule generalizes rather than breaks: glibc is BACKWARD
#     compatible, so a library built on bookworm's glibc 2.36 loads on noble's
#     2.39, and it is the reverse that would fail. Alpine would load nothing at
#     all, being musl.
#
# .NET 10 is the FLOOR from docs/agents/sdk.md, and the floor is what the gate
# runs on: .NET 8 (LTS) and 9 (STS) both reach end of support in 2026-11, which
# leaves 10 the only line the support policy admits.
FROM mcr.microsoft.com/dotnet/sdk:10.0-noble

# openssl is the test-key generator's only dependency (scripts/gen-test-keys.sh,
# shared with the Rust suites). Nothing else is needed: the transport is
# System.Runtime.InteropServices, which is in the framework, and the ENGINE
# never compiles anywhere — the platform package carries it prebuilt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1

# Outside /repo on purpose: the gate mounts the repository over /repo, and a
# library that lived there would be hidden by the mount. The package cache is
# outside for the same reason — a restore that wrote into the mount would
# dirty the working tree and be thrown away between runs.
COPY dist/capi/local/ /opt/shojiku/lib/
ENV SHOJIKU_LIBRARY=/opt/shojiku/lib/libshojiku_capi.so
ENV NUGET_PACKAGES=/opt/nuget

# Only what resolves the dependency graph, so a change to Shojiku/ or
# Shojiku.Tests/ does not re-run the restore. The layout under /restore mirrors
# the repository's, because a project reference is resolved by relative path.
WORKDIR /restore
COPY sdk/dotnet/Directory.Build.props ./
COPY sdk/dotnet/Shojiku/Shojiku.csproj Shojiku/
COPY sdk/dotnet/Shojiku.Tests/Shojiku.Tests.csproj Shojiku.Tests/
RUN dotnet restore Shojiku.Tests/Shojiku.Tests.csproj

WORKDIR /repo/sdk/dotnet
# One command per line, like the make recipes: under `sh -euc`, errexit is
# SUPPRESSED for a failing command inside an `&&` list, so a chain with anything
# after it reports the LAST step's status.
CMD ["sh", "-euc", "dotnet format --verify-no-changes ; dotnet test"]

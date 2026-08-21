# The Python SDK's gate environment.
#
# Nobody needs Python installed to work on this package: `make sdk:python:verify`
# builds and runs this image, exactly as the Rust, Node and Ruby gates run in
# theirs.
#
# The engine library is INJECTED as a pre-compiled artifact (built once by
# `make engine:capi-lib` through the pinned Rust image) rather than compiled from Rust
# source here. Seven language images each building the engine would make the
# gate grid unusable.
#
# Two things this file has to get right, both of which fail confusingly:
#
#   * the repository root `.dockerignore` excludes `sdk`, so this build sees
#     nothing of the package it exists to test. The sidecar
#     `Dockerfile.dockerignore` beside this file REPLACES that root file for
#     this build and re-admits what is needed.
#   * the library has to be built against the same libc. Bookworm here,
#     bookworm in the Rust image — a musl base would load nothing.
#
# Python 3.11 is the FLOOR from docs/agents/sdk.md, and the floor is what the
# gate runs on: a package that only works on the newest interpreter has not
# actually supported the version it claims.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk:python:verify` gates on.
ARG PYTHON_VERSION=3.11
FROM python:${PYTHON_VERSION}-slim-bookworm

# openssl is the test-key generator's only dependency (scripts/gen-test-keys.sh,
# shared with the Rust suites). Nothing else is needed: the transport is ctypes
# from the standard library, and the ENGINE never compiles anywhere — the
# platform wheel carries it prebuilt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Outside /repo on purpose: the gate mounts the repository over /repo, and a
# library that lived there would be hidden by the mount.
COPY dist/capi/local/ /opt/shojiku/lib/
ENV SHOJIKU_LIBRARY=/opt/shojiku/lib/libshojiku_capi.so

# The gate toolchain, pinned so a gate run never resolves a different linter
# than the one the change was written against. The package itself has no
# runtime dependencies, so nothing here is installed on its behalf.
RUN pip install --no-cache-dir \
      "ruff==0.14.2" \
      "mypy==1.18.2" \
      "pytest==8.4.2" \
      "pytest-cov==7.0.0" \
      "build==1.3.0"

# Imported from the source tree rather than installed: the gate mounts the
# repository, and `make sdk:python:verify` builds and installs the WHEEL separately in
# a scratch directory to prove that path too.
ENV PYTHONPATH=/repo/sdk/python/src
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /repo/sdk/python
# One command per line, like the make recipes: under `sh -euc`, errexit is
# SUPPRESSED for a failing command inside an `&&` list, so a chain with anything
# after it reports the LAST step's status. Safe here today (nothing follows),
# written this way so appending a step cannot quietly reintroduce that.
CMD ["sh", "-euc", "ruff format --check . ; ruff check . ; mypy ; pytest"]

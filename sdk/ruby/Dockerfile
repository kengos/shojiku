# The Ruby SDK's gate environment.
#
# Nobody needs Ruby installed to work on this package: `make sdk:ruby:verify` builds
# and runs this image, exactly as the Rust and Node gates run in theirs.
#
# The engine library is INJECTED as a pre-compiled artifact (built once by
# `make engine:capi-lib` through the pinned Rust image) rather than compiled from
# Rust source here. Seven language images each building the engine would make
# the gate grid unusable.
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
# Ruby 3.3 is the FLOOR from docs/agents/sdk.md, and the floor is what the
# gate runs on: a package that only works on the newest interpreter has not
# actually supported the version it claims.
# The language version is a build ARG so one Dockerfile serves the whole
# supported range; the default is the FLOOR from docs/agents/sdk.md, which is
# what a bare `make sdk:ruby:verify` gates on.
ARG RUBY_VERSION=3.3
FROM ruby:${RUBY_VERSION}-slim-bookworm

# openssl is the test-key generator's only dependency (scripts/gen-test-keys.sh,
# shared with the Rust suites); git is what bundler wants for a gemspec-driven
# Gemfile. build-essential and libffi-dev are for `fiddle` itself: the gemspec
# declares it (it is leaving the default-gem set), so bundler resolves the
# newest release and builds its C extension rather than using the one shipped
# with this interpreter. That is a DEV-image cost — an application installing
# this gem on a supported Ruby already has fiddle, and the ENGINE never
# compiles anywhere: the platform gem carries it prebuilt.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
       openssl git build-essential libffi-dev \
  && rm -rf /var/lib/apt/lists/*

# Outside /repo on purpose: the gate mounts the repository over /repo, and a
# library that lived there would be hidden by the mount.
COPY dist/capi/local/ /opt/shojiku/lib/
ENV SHOJIKU_LIBRARY=/opt/shojiku/lib/libshojiku_capi.so

WORKDIR /gem
# Only what resolves the dependency graph, so a change to lib/ or spec/ does
# not re-run `bundle install`.
COPY sdk/ruby/Gemfile sdk/ruby/shojiku.gemspec ./
COPY sdk/ruby/lib/shojiku/version.rb lib/shojiku/version.rb
RUN bundle install

WORKDIR /repo/sdk/ruby
ENV BUNDLE_GEMFILE=/gem/Gemfile
CMD ["bundle", "exec", "rake"]

#!/bin/sh
# Build an image in Shojiku's own buildx builder instead of the default builder.
#
#   scripts/docker-build.sh <docker build arguments...>
#
# The default builder's build cache is shared by every repository on the
# daemon, so Shojiku's build cache in the default builder cannot be pruned
# without pruning the build cache of the other repositories. Every image build
# that a make target runs calls this script instead of `docker build`. This
# script builds in a docker-container builder that only Shojiku uses, and
# `make docker:clean:cache` prunes the build cache of that builder alone.
#
# The Makefile passes both names, so this script decides neither:
#
#   SHOJIKU_BUILDER         the builder's name
#   SHOJIKU_BUILDKIT_IMAGE  the pinned buildkit image the builder runs
#
# The first run of this script that finds no builder named SHOJIKU_BUILDER
# creates it with --bootstrap. When `docker buildx create` fails and
# `docker buildx inspect` then finds the builder (a concurrent make created it
# first), the create error is ignored.
#
# A buildx builder keeps the endpoint of the docker context it was created on,
# so after a switch to another docker context the builder still builds on the
# old daemon and --load loads the image there, where `docker run` on the new
# context does not find it. Run `docker buildx rm "$SHOJIKU_BUILDER"` after the
# switch; the next build creates the builder on the new context.
#
# `--load` copies the built image into the daemon's image store, where
# `docker run` and the trivy scan read it; without `--load`, a docker-container
# builder keeps the built image only in its build cache. This script writes its
# own messages to stderr, so a caller that passes -q and sends stdout to
# /dev/null prints only the "creating buildx builder" line, and only on the run
# that creates the builder.
set -eu

: "${SHOJIKU_BUILDER:?SHOJIKU_BUILDER is not set (run through make, which passes it)}"
: "${SHOJIKU_BUILDKIT_IMAGE:?SHOJIKU_BUILDKIT_IMAGE is not set (run through make, which passes it)}"

if ! docker buildx inspect "$SHOJIKU_BUILDER" >/dev/null 2>&1; then
    echo "creating buildx builder $SHOJIKU_BUILDER" >&2
    if ! err=$(docker buildx create --name "$SHOJIKU_BUILDER" --driver docker-container \
        --driver-opt image="$SHOJIKU_BUILDKIT_IMAGE" --bootstrap 2>&1 >/dev/null); then
        docker buildx inspect "$SHOJIKU_BUILDER" >/dev/null 2>&1 || {
            echo "$err" >&2
            exit 1
        }
    fi
fi

exec docker buildx build --builder "$SHOJIKU_BUILDER" --load "$@"

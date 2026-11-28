#!/bin/sh
# Build an image in Shojiku's own buildx builder instead of the default builder.
#
#   scripts/docker-build.sh [-q] <docker build arguments...>
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
# builder keeps the built image only in its build cache.
#
# A first argument of -q selects quiet mode, which prints only the image ID on
# stdout, like `docker build -q`. With `docker buildx build -q`, a failed RUN
# step prints only an excerpt of the Dockerfile and the exit code, not the
# output of the RUN command. So in quiet mode the script runs the build with
# --progress=plain and writes the whole build output to a temporary file.
#
# When the build succeeds, stdout gets only the image ID and a newline (as
# `docker build -q`); stderr gets only the "creating buildx builder" line, on
# the run that creates the builder.
#
# When the build fails, the script prints the whole build output to stderr,
# then the heading
#   docker build failed at step #N; its last 30 lines:
# and the last 30 lines of the build output that start with "#N ". N is the
# step number in the first line of the build output that starts with
# "#<N> ERROR:"; when no line starts that way (buildx failed before a step
# ran), the script prints no heading. scripts/gate-culprits.sh extracts that
# heading and those lines, so the FAIL block of a quiet make target shows the
# failed step's output under "where it broke".
#
# The script exits with status 2 without building when any argument other
# than a first-argument -q starts with -q, when any argument is --quiet or
# --quiet=<value>, or, in quiet mode, when an argument sets --progress or
# --iidfile (the script sets those two itself, and a later flag would override
# them).
#
# Without -q, the script passes the output of docker buildx build through as it
# is.
set -eu

: "${SHOJIKU_BUILDER:?SHOJIKU_BUILDER is not set (run through make, which passes it)}"
: "${SHOJIKU_BUILDKIT_IMAGE:?SHOJIKU_BUILDKIT_IMAGE is not set (run through make, which passes it)}"

quiet=0
if [ "${1:-}" = "-q" ]; then
    quiet=1
    shift
fi

for arg in "$@"; do
    case "$arg" in
    -q | -q?* | --quiet | --quiet=*)
        echo "docker-build.sh: -q is accepted only as the first argument, and --quiet not at all; got $arg" >&2
        exit 2
        ;;
    --progress | --progress=* | --iidfile | --iidfile=*)
        if [ "$quiet" = 1 ]; then
            echo "docker-build.sh: quiet mode sets --progress and --iidfile itself; got $arg" >&2
            exit 2
        fi
        ;;
    esac
done

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

if [ "$quiet" = 0 ]; then
    exec docker buildx build --builder "$SHOJIKU_BUILDER" --load "$@"
fi

lines=30
log=
iid=
trap 'rm -f "$log" "$iid"' EXIT
# When only this script's PID receives TERM, the script exits after docker
# buildx build exits, because the script does not exec docker buildx build.
# Ctrl-C in the terminal and a CI cancel send the signal to the whole process
# group, so docker buildx build also receives it.
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
log=$(mktemp)
iid=$(mktemp)

status=0
docker buildx build --builder "$SHOJIKU_BUILDER" --load --progress=plain \
    --iidfile "$iid" "$@" >"$log" 2>&1 || status=$?

if [ "$status" = 0 ]; then
    printf '%s\n' "$(cat "$iid")"
    exit 0
fi

cat "$log" >&2
step=$(sed -n -E 's/^#([0-9]+) ERROR:.*/\1/p' "$log" | head -n 1)
if [ -n "$step" ]; then
    echo "docker build failed at step #$step; its last $lines lines:" >&2
    grep "^#$step " "$log" | tail -n "$lines" >&2
fi
exit "$status"

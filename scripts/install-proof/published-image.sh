#!/bin/sh
# Published-install proof, container image: pull the runtime image that
# publish-image.yml pushed, from every registry it was pushed to, and use it.
#
# The image is the published artifact a user runs without writing any code,
# so it is proven the way a user meets it: by TAG. Each registry's tag is
# resolved ONCE, to the digest of its multi-arch index, and everything after
# that names the digest — a tag can move between two commands, a digest names
# bytes. The registries must agree on that digest (the workflow copies ghcr's
# manifests to Docker Hub rather than rebuilding, so identical bytes are the
# contract), the index must carry both architectures the workflow builds, and
# then the image is pulled by digest from each registry and asked for its
# version, a render, a sign-and-verify round trip and an MCP handshake.
#
# Each registry's pull is a real download: the image is removed from the local
# store before every pull, because a store that already holds the layers
# answers "Already exists" and proves only that the registry returned a
# manifest. This deletes the local copy of the image under test, under every
# tag it carries; `docker pull` brings it back. A layer another local image
# also uses (the distroless base under a locally built shojiku image, say)
# stays, so on a workstation part of each pull is still "Already exists"; on
# a fresh CI runner nothing else shares them.
#
# Inputs (all optional):
#   SHOJIKU_VERSION       the version the image must report; defaults to this
#                         tree's own (common.sh), like every published proof
#   SHOJIKU_IMAGE_TAG     the tag to resolve; defaults to that version, the tag
#                         a release dispatches the workflow with. `edge` is
#                         the other tag it pushes, and it still reports the
#                         workspace version of the commit it was built from
#   SHOJIKU_IMAGE_DIGEST  the index digest the tag MUST resolve to. The publish
#                         workflow passes the one it just assembled, so a tag
#                         someone moved in between is caught rather than proven
#   SHOJIKU_IMAGE_REPOS   space-separated repositories; defaults to both. The
#                         workflow narrows it to ghcr when Docker Hub is not
#                         configured, the case where it publishes ghcr alone
#
# The render and the round trip run with no network at all: rendering, signing
# and verifying are the network-free stages, and an image that reached out
# during any of them would be breaking that promise. The image runs as the
# invoking user so that it can read and write the scratch tree on a Linux host,
# where the image's own nonroot user does not own it.
#
# Every pull is anonymous, as a user's is, which also checks that the package
# is public (ghcr makes a new package private). Docker Hub rate-limits anonymous
# pulls per IP, so on a shared runner address this can fail for want of quota
# rather than for a broken image; the error then names the rate limit.
. "$(dirname "$0")/common.sh"

TAG="${SHOJIKU_IMAGE_TAG:-$PROOF_VERSION}"
REPOS="${SHOJIKU_IMAGE_REPOS:-ghcr.io/kengos/shojiku docker.io/kengos/shojiku}"
# The signing material comes from the same generator the signing tests use,
# run in the image published-python.sh already pulls: it carries the openssl
# command and nothing of ours, so the keys are not made by the thing under test.
# It makes twenty files where this uses two, and that costs seconds; a second,
# smaller key recipe would be one more to keep in step with what the engine
# accepts.
KEYGEN_IMG="python:${PYTHON_VER:-3.11}-slim-bookworm"
RUN_AS="$(id -u):$(id -g)"

echo "== published-install proof (image, tag $TAG, version $PROOF_VERSION) =="

digest=
for repo in $REPOS; do
  d=$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$repo:$TAG") || {
    echo "published-image: $repo:$TAG does not resolve" >&2
    exit 1
  }
  echo "  $repo:$TAG -> $d"
  # A single-architecture manifest has no list to range over, so the template
  # fails on it, as does a registry that stops answering; the inspect's own
  # error above this line says which.
  platforms=$(docker buildx imagetools inspect \
    --format '{{range .Manifest.Manifests}}{{.Platform.OS}}/{{.Platform.Architecture}} {{end}}' \
    "$repo@$d") || {
    echo "published-image: could not read the platform list of $repo@$d" >&2
    exit 1
  }
  for p in linux/amd64 linux/arm64; do
    case " $platforms " in
      *" $p "*) ;;
      *) echo "published-image: $repo:$TAG ($d) carries no $p image" >&2; exit 1 ;;
    esac
  done
  if [ -z "$digest" ]; then
    digest="$d"
  elif [ "$d" != "$digest" ]; then
    echo "published-image: $repo:$TAG is $d, but the first registry has $digest" >&2
    exit 1
  fi
done
if [ -n "${SHOJIKU_IMAGE_DIGEST:-}" ] && [ "$digest" != "$SHOJIKU_IMAGE_DIGEST" ]; then
  echo "published-image: $TAG resolves to $digest, expected $SHOJIKU_IMAGE_DIGEST" >&2
  exit 1
fi

mkdir -p "$WORK/keys"
docker run --rm --user "$RUN_AS" -v "$WORK/keys:/keys" \
  -v "$ROOT/scripts/gen-test-keys.sh:/gen-test-keys.sh:ro" \
  "$KEYGEN_IMG" sh /gen-test-keys.sh /keys

# Remove the image under test from the local store, by image id so that every
# tag pointing at it goes too. Its layers then come from the next pull.
forget() {
  id=$(docker image inspect --format '{{.Id}}' "$1" 2>/dev/null) || return 0
  docker image rm -f "$id" >/dev/null
}

for repo in $REPOS; do
  img="$repo@$digest"
  echo "== $img =="
  forget "$img"
  docker pull -q "$img"

  # docker/Dockerfile promises a nonroot image; the runs below pass --user
  # for the mounts, so they alone would not notice a root one.
  user=$(docker image inspect --format '{{.Config.User}}' "$img")
  [ "$user" = 65532 ] || {
    echo "published-image: $img runs as '$user', expected the nonroot uid 65532" >&2
    exit 1
  }

  got=$(docker run --rm --network none "$img" --version)
  [ "$got" = "shojiku $PROOF_VERSION" ] || {
    echo "published-image: $img reports '$got', expected 'shojiku $PROOF_VERSION'" >&2
    exit 1
  }
  echo "  $got"

  # The image's own default command: what `docker run <image> > output.pdf`
  # gives a user who reads nothing else. A clean render prints nothing to
  # stderr, so anything there is a diagnostic the example should not raise.
  rm -f "$WORK/out.pdf" "$WORK/signed.pdf" "$WORK/verify.json"
  docker run --rm --network none "$img" > "$WORK/out.pdf" 2> "$WORK/stderr.txt" || {
    echo "published-image: the default render failed:" >&2
    cat "$WORK/stderr.txt" >&2
    exit 1
  }
  if [ -s "$WORK/stderr.txt" ]; then
    echo "published-image: the default render emitted diagnostics:" >&2
    cat "$WORK/stderr.txt" >&2
    exit 1
  fi
  assert_pdf "$WORK/out.pdf"

  docker run --rm --network none --user "$RUN_AS" -v "$WORK:/w" "$img" \
    sign --input /w/out.pdf --key /w/keys/ec256.key.pem \
    --cert /w/keys/ec256.cert.pem --output /w/signed.pdf
  # verify exits non-zero when the document does not verify, which is the
  # assertion; the report is printed so a failure says what it found.
  docker run --rm --network none --user "$RUN_AS" -v "$WORK:/w" "$img" \
    verify --input /w/signed.pdf --anchor /w/keys/ec256.cert.pem > "$WORK/verify.json" || {
    echo "published-image: the signed render does not verify:" >&2
    cat "$WORK/verify.json" >&2
    exit 1
  }
  echo "  signed and verified against a fresh anchor"

  # The MCP server rides the same image (see docker/Dockerfile). One
  # initialize request on stdin; the server answers and exits at EOF.
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"install-proof","version":"0"}}}' |
    docker run -i --rm --network none --entrypoint shojiku-mcp "$img" > "$WORK/mcp.json"
  grep -Fq "\"serverInfo\":{\"name\":\"shojiku-mcp\",\"version\":\"$PROOF_VERSION\"}" "$WORK/mcp.json" || {
    echo "published-image: shojiku-mcp did not answer initialize as $PROOF_VERSION:" >&2
    cat "$WORK/mcp.json" >&2
    exit 1
  }
  echo "  shojiku-mcp answered initialize"

  forget "$img"
done

echo "install-proof: $TAG ($digest) is the same image in every registry, and it renders, signs, verifies and serves MCP"

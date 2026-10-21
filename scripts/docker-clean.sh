#!/bin/sh
# Remove the Docker resources Shojiku's gates leave behind.
#
#   scripts/docker-clean.sh containers|volumes|images|all
#
# The make targets pass what the Makefile knows, so no name is re-derived here:
#
#   SHOJIKU_BUILT_IMAGES   the images this tree's gates build (WORK_TAG-aware)
#   SHOJIKU_PULLED_IMAGES  the base images the Makefile pins and pulls
#   SHOJIKU_CACHE_VOLUMES  the cargo/rustup/pnpm cache volumes
#   SLOT                   with `volumes`: reset that one target slot only
#
# It never stops at the first thing it cannot remove: every resource ends up on
# a `removed` or a `kept` line with the reason, and `all` closes with the counts.
#
#   containers  exited or dead containers that were started from a `shojiku-*`
#               image or mount a `shojiku-*` volume, from ANY working tree. The
#               gates run with --rm, so these are what an interrupted run left.
#               Every other state is only listed: a `created` one may be a gate
#               starting in another worktree, and a running one may be a gate
#               (make investigate:gates tells it from an orphan).
#   volumes     the pooled target volumes no gate is using (through
#               scripts/target-slot.sh, which owns the lease) and the cache
#               volumes; one still mounted is kept. The fuzz corpus is kept: it
#               holds what the fuzzer found, which no rebuild gives back.
#   images      this WORK_TAG's built images. The default `local` is shared by
#               every tree that sets none. Other WORK_TAGs' `shojiku-*` images,
#               the pulled base images and the build cache are listed, not
#               removed: another session or repository may be using them.
#
# The caches and the built images are shared across worktrees, and a gate
# between two of its containers mounts neither, so docker alone would let them
# go. While any target slot is leased (scripts/target-slot.sh busy) both are
# kept. Only engine gates lease a slot; a gui or SDK gate in another tree is
# not seen, and costs a re-run at worst.
set -u

job=${1:-}
removed=0
kept=0

say_removed() { echo "removed  $1"; removed=$((removed + 1)); }
say_kept() { echo "kept     $1 — $2"; kept=$((kept + 1)); }

# Lines another script printed in the same format, counted into the summary.
tally() {
    while IFS= read -r line; do
        case $line in
        '') continue ;;
        removed*) removed=$((removed + 1)) ;;
        kept*) kept=$((kept + 1)) ;;
        esac
        echo "$line"
    done <<EOF
$1
EOF
}

clean_containers() {
    echo "== containers =="
    docker ps -a --no-trunc --format '{{.ID}}	{{.State}}	{{.Image}}	{{.Mounts}}' >"$tmp"
    while IFS='	' read -r id state image mounts; do
        case $image in
        shojiku-*) ;;
        *) printf ',%s,' "$mounts" | grep -q ',shojiku-' || continue ;;
        esac
        short=$(printf '%.12s' "$id")
        case $state in
        exited | dead)
            if err=$(docker rm "$id" 2>&1); then
                say_removed "container $short ($image)"
            else
                say_kept "container $short ($image)" "$err"
            fi
            ;;
        running) say_kept "container $short ($image)" "running; if no gate uses it (make investigate:gates): docker rm -f $short" ;;
        created) say_kept "container $short ($image)" "created, may be a gate starting; if not, it pins its volumes: docker rm $short" ;;
        *) say_kept "container $short ($image)" "state $state, not stopped" ;;
        esac
    done <"$tmp"
}

clean_volumes() {
    echo "== volumes =="
    out=$("$(dirname "$0")/gate-lock.sh" "$(dirname "$0")/target-slot.sh" clean ${SLOT:-} 2>&1)
    case $? in
    0) tally "$out" ;;
    # A usage error (a SLOT that is not a slot number) is the caller's mistake,
    # not a resource to keep.
    2) echo "$out" >&2; exit 2 ;;
    *)
        tally "$out"
        say_kept "target volumes" "scripts/target-slot.sh clean stopped (above)"
        # Refused by this tree's gate lock: a gate runs here, holding a slot or
        # not, so the shared caches and images below stay too.
        busy=${busy:-a gate in this tree}
        ;;
    esac
    # SLOT is the reset for one bad slot; it must not cost the caches minutes
    # to refill.
    [ -z "${SLOT:-}" ] || return 0
    for v in ${SHOJIKU_CACHE_VOLUMES:-}; do
        docker volume inspect "$v" >/dev/null 2>&1 || continue
        if [ -n "$busy" ]; then
            say_kept "volume $v" "a gate is running ($busy; make investigate:gates)"
        elif err=$(docker volume rm "$v" 2>&1); then
            say_removed "volume $v"
        else
            say_kept "volume $v" "$err"
        fi
    done
    if docker volume inspect shojiku-fuzz-corpus >/dev/null 2>&1; then
        say_kept "volume shojiku-fuzz-corpus" "what the fuzzer found does not rebuild (docker volume rm shojiku-fuzz-corpus)"
    fi
}

clean_images() {
    echo "== images =="
    for img in ${SHOJIKU_BUILT_IMAGES:-}; do
        [ -n "$(docker images -q "$img")" ] || continue
        if [ -n "$busy" ]; then
            say_kept "image $img" "a gate is running ($busy; make investigate:gates)"
        elif err=$(docker rmi "$img" 2>&1); then
            say_removed "image $img"
        else
            say_kept "image $img" "$err"
        fi
    done
    for img in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep '^shojiku-' | grep -v ':<none>$'); do
        case " ${SHOJIKU_BUILT_IMAGES:-} " in *" $img "*) continue ;; esac
        say_kept "image $img" "not this WORK_TAG's current build (another WORK_TAG, another SDK version, or an install-proof image): docker rmi $img"
    done
    for img in ${SHOJIKU_PULLED_IMAGES:-}; do
        # `docker images` does not match a digest-pinned reference; the tag does.
        img=${img%%@*}
        [ -n "$(docker images -q "$img")" ] || continue
        say_kept "image $img" "pulled base image; other repositories may use it (docker rmi $img)"
    done
    cache=$(docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}' | sed -n 's/^Build Cache|//p')
    case $cache in
    '' | 0B\|*) ;;
    *) say_kept "build cache ${cache%%|*} (${cache#*|} reclaimable)" "shared by every repository on this daemon (docker builder prune)" ;;
    esac
}

case $job in
containers | volumes | images | all)
    # An unreachable daemon would otherwise read as "nothing to remove".
    if ! docker info >/dev/null 2>&1; then
        echo "docker is not reachable; nothing was checked" >&2
        exit 1
    fi
    ;;
*)
    echo "usage: $0 containers|volumes|images|all" >&2
    exit 2
    ;;
esac

busy=$("$(dirname "$0")/target-slot.sh" busy 2>/dev/null) || busy=
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

case $job in
containers) clean_containers ;;
volumes) clean_volumes ;;
images) clean_images ;;
all)
    # Containers first: a stopped container still holds its volumes and image.
    clean_containers
    clean_volumes
    clean_images
    echo "== summary: $removed removed, $kept kept =="
    ;;
esac

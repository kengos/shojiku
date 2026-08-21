#!/usr/bin/env sh
# Fails if any place that names a shojiku RELEASE COORDINATE disagrees with
# `[workspace.package].version` in engine/Cargo.toml.
#
# Nothing else in the repo can see this. Every gate builds and tests the tree
# it is given; none of them asks whether the version literals scattered across
# nine ecosystems still agree. So a bump lands half-done, and the half that was
# missed surfaces as a registry publishing a file that does not exist, or a
# proof installing the PREVIOUS release and passing. One release shipped with
# four `scripts/` sites stale, found only by CI's java proof one PR later; a
# second left `examples/deploy/java/pom.xml` pinned to the previous version for
# a whole release cycle, found only by the write-back that produced this gate.
#
# Why the rules are TREE-WIDE and structural, not a list of known files. The
# failure this gate exists for IS an incomplete list — the release procedure's
# Versioning section named eight sites and the tree had nine. A gate built on
# another such list reproduces the bug one level down. So each rule below scans
# every tracked file for a SHAPE (a maven dependency whose groupId is
# jp.kengos, a `shojiku-<semver>` artifact filename), and a file nobody thought
# about is covered the moment it is committed.
#
# That leaves one way to fail open — a rule whose shape drifts and quietly
# stops matching, printing the success line forever. Hence the declared MINIMUM
# per rule: a rule that matches fewer lines than it is known to match is a
# FAILURE, not a pass. And hence the self-test below, which runs the real
# scanner over a known-bad fixture, one case per rule, and asserts an exact hit
# count before the real tree is touched.
#
# Not covered, deliberately: an ecosystem nobody has added yet. A new SDK in a
# new packaging format needs a new rule here, the same way it needs an entry in
# the release procedure. The minimum counts are what make that visible — a new
# language moves them.
set -eu

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Paths whose version literals are HISTORY and must not track the current
# release. Each needs a reason; this list is short on purpose, because every
# entry is a hole.
#
#   CHANGELOG.md           every past release is named here, by definition.
#   sbom/                  inventories describe a RELEASED artifact, so they
#                          legitimately lag the working tree.
#   *lock*                 resolver output, not an authored coordinate.
#   this script            its self-test fixture writes deliberately wrong
#                          literals, and its comments quote the stale ones that
#                          caused the incidents. The self-test is what proves
#                          the detector works, so excluding it costs nothing.
is_excluded() {
  case "$1" in
    CHANGELOG.md|sbom/*) return 0 ;;
    scripts/check-versions.sh) return 0 ;;
    *.lock|*lock.json|*lock.yaml|*.lock.json) return 0 ;;
    *) return 1 ;;
  esac
}

# The one place a version literal is allowed to disagree on a single line,
# following the repo's existing `line-budget-exempt: <reason>` shape.
EXEMPT_TOKEN='version-check-exempt:'

# ---------------------------------------------------------------------------
# The scanner. Emits one `<rule>|<file>|<line-no>|<version>` record per hit.
# Shared verbatim by the self-test and the real run, so a rule that stops
# matching fails a fixture rather than passing both at once.
#
# `grep -a` / awk over every file is deliberate: a source file carrying a raw
# NUL is classified BINARY and vanishes from an ordinary grep, which would make
# this gate skip a file while reporting it clean.
# ---------------------------------------------------------------------------
scan_file() {
  # $1 = path relative to the scan root
  # F and EX come through the ENVIRONMENT, not `-v`: awk processes escape
  # sequences in a `-v` value, so a path containing a backslash would reach
  # the two path-anchored rules as a different string than it is on disk.
  SJ_F="$1" SJ_EX="$EXEMPT_TOKEN" awk '
    BEGIN { F = ENVIRON["SJ_F"]; EX = ENVIRON["SJ_EX"] }

    function emit(rule, ver) { printf "%s|%s|%d|%s\n", rule, F, NR, ver }
    index($0, EX) { next }

    # --- cargo -------------------------------------------------------------
    # The workspace version is the truth; it still has to be found.
    /^\[workspace\.package\]/ { in_wp = 1; next }
    /^\[/ && !/^\[workspace\.package\]/ { in_wp = 0 }
    in_wp && match($0, /^version[ \t]*=[ \t]*"[0-9]+\.[0-9]+\.[0-9]+"/) {
      v = $0; sub(/^[^"]*"/, "", v); sub(/".*$/, "", v); emit("cargo-workspace", v); next
    }
    # A path dependency on a workspace crate carries its own version pin.
    /^shojiku-[a-z-]+[ \t]*=[ \t]*\{/ && /path[ \t]*=/ && match($0, /version[ \t]*=[ \t]*"[0-9]+\.[0-9]+\.[0-9]+"/) {
      v = substr($0, RSTART, RLENGTH); sub(/^[^"]*"/, "", v); sub(/".*$/, "", v)
      emit("cargo-path-dep", v); next
    }

    # --- maven -------------------------------------------------------------
    # Block-structured on purpose: <groupId> and <version> sit on different
    # lines, which is exactly what defeated a same-line regex and let a stale
    # example pom survive a release. Runs over ANY tracked file, so the README
    # snippets inside fenced XML are checked too.
    /<dependency>/ { in_dep = 1; dep_gid = 0; dep_ver = ""; dep_line = 0 }
    in_dep && /<groupId>jp\.kengos<\/groupId>/ { dep_gid = 1 }
    in_dep && match($0, /<version>[0-9]+\.[0-9]+\.[0-9]+<\/version>/) {
      v = substr($0, RSTART, RLENGTH); sub(/^<version>/, "", v); sub(/<\/version>$/, "", v)
      dep_ver = v; dep_line = NR
    }
    /<\/dependency>/ {
      if (in_dep && dep_gid && dep_ver != "") printf "%s|%s|%d|%s\n", "maven-dep", F, dep_line, dep_ver
      in_dep = 0; dep_gid = 0; dep_ver = ""
    }
    # The publishable pom names its own coordinate at project level.
    !in_dep && /<groupId>jp\.kengos<\/groupId>/ { proj_gid = 1; next }
    !in_dep && proj_gid && match($0, /<version>[0-9]+\.[0-9]+\.[0-9]+<\/version>/) {
      v = substr($0, RSTART, RLENGTH); sub(/^<version>/, "", v); sub(/<\/version>$/, "", v)
      emit("maven-project", v); proj_gid = 0; next
    }
    # A Gradle/`mvn` one-liner coordinate.
    match($0, /jp\.kengos:shojiku:[0-9]+\.[0-9]+\.[0-9]+/) {
      v = substr($0, RSTART, RLENGTH); sub(/^.*:/, "", v); emit("maven-coordinate", v)
    }
    # The repository layout path the publish step assembles into.
    match($0, /jp\/kengos\/shojiku\/[0-9]+\.[0-9]+\.[0-9]+/) {
      v = substr($0, RSTART, RLENGTH); sub(/^.*\//, "", v); emit("bundle-path", v)
    }

    # --- nuget -------------------------------------------------------------
    match($0, /<PackageReference[^>]*Include="Shojiku"[^>]*Version="[0-9]+\.[0-9]+\.[0-9]+"/) {
      v = substr($0, RSTART, RLENGTH); sub(/^.*Version="/, "", v); sub(/".*$/, "", v)
      emit("nuget-ref", v); next
    }
    /<PackageId>Shojiku<\/PackageId>/ { pack_id = 1 }
    pack_id && match($0, /<Version>[0-9]+\.[0-9]+\.[0-9]+<\/Version>/) {
      v = substr($0, RSTART, RLENGTH); sub(/^<Version>/, "", v); sub(/<\/Version>$/, "", v)
      emit("nuget-project", v); pack_id = 0; next
    }

    # --- the single-constant declarations, one per remaining language -------
    # A JSON manifest'"'"'s own version. NOT path-anchored to sdk/js/package.json:
    # that is how `scripts/install-proof/js.sh` (which writes a platform
    # package manifest in a heredoc) and `site/.data/wasm-source.json` (the
    # homepage'"'"'s pinned engine, re-pinned at release step 2b) both escaped —
    # and the v0.2.0 release commit had to bump BOTH of them.
    #
    # The exclusions are by PATH rather than by the inline hatch because JSON
    # cannot carry a comment, so `version-check-exempt:` is unusable here:
    # `gui/*` packages are deliberately 0.0.0 and unpublished, and a `legacy/`
    # artifact is an imported third-party file with its own numbering. An
    # exclusion list fails in the safe direction — a NEW manifest that should
    # track the engine is caught, and a new deliberately-unversioned one reds
    # the gate until someone says so here.
    F !~ /^gui\// && F !~ /\/legacy\// && match($0, /^[ \t]*"version"[ \t]*:[ \t]*"[0-9]+\.[0-9]+\.[0-9]+"/) {
      v = $0; sub(/^[^:]*:[^"]*"/, "", v); sub(/".*$/, "", v); emit("json-version", v); next
    }
    # One rule for the four languages that declare the version as a lone
    # constant. Anchored on the NAME rather than the line start, because each
    # spells the declaration differently: `VERSION =` (ruby), `__version__ =`
    # (python), `const Version =` (go), `public const VERSION =` (php). A
    # line-start anchor silently missed go and php, which is exactly the shape
    # this gate exists to catch. The `<` guard is what keeps an XML
    # `Version="17.14.1"` attribute on a test-only PackageReference from
    # reading as one of these.
    $0 !~ /</ && match($0, /(^|[ \t])(VERSION|__version__|Version)[ \t]*=[ \t]*["'"'"'][0-9]+\.[0-9]+\.[0-9]+["'"'"']/) {
      v = substr($0, RSTART, RLENGTH)
      sub(/^[^"'"'"']*["'"'"']/, "", v); sub(/["'"'"'].*$/, "", v)
      emit("lang-constant", v); next
    }

    # --- release artifacts and download URLs --------------------------------
    # `shojiku-<semver>` names a file the release actually produces: a gem, a
    # tgz, a jar, a platform tarball. A stale one publishes or unpacks nothing.
    {
      s = $0
      while (match(s, /shojiku-[0-9]+\.[0-9]+\.[0-9]+/)) {
        v = substr(s, RSTART, RLENGTH); sub(/^shojiku-/, "", v)
        emit("artifact-name", v)
        s = substr(s, RSTART + RLENGTH)
      }
      s = $0
      while (match(s, /releases\/download\/v[0-9]+\.[0-9]+\.[0-9]+/)) {
        v = substr(s, RSTART, RLENGTH); sub(/^.*\/v/, "", v)
        emit("download-url", v)
        s = substr(s, RSTART + RLENGTH)
      }
    }
    /assemble\.sh$/ { }
    F ~ /scripts\/release\/assemble\.sh$/ && match($0, /^VERSION=[0-9]+\.[0-9]+\.[0-9]+/) {
      v = $0; sub(/^VERSION=/, "", v); emit("assemble-version", v)
    }
  ' "$1" || {
    # A gate whose justification is "nothing else can see this" must not be
    # able to stop seeing it quietly. An unreadable file used to be swallowed
    # here by `2>/dev/null || true`, which is the exact fail-open the header
    # above forbids: one file drops out and the tree still reads clean.
    echo "FAIL versions: could not scan $1" >&2
    return 1
  }
}

# Every rule and the number of hits it is known to produce, MEASURED against
# the tree rather than estimated. A rule below its minimum has stopped matching
# — that is a gate failure, not a clean tree, and it is the only way this gate
# could otherwise fail open.
#
# These are floors, not equalities: adding a site (another install snippet,
# another example) never reds the gate, while removing one does and is a
# deliberate edit — the same shape as a `line-budget-exempt` waiver.
RULES='cargo-workspace:1
cargo-path-dep:14
maven-dep:8
maven-project:1
maven-coordinate:4
bundle-path:1
nuget-ref:1
nuget-project:1
json-version:3
lang-constant:5
artifact-name:12
download-url:2
assemble-version:1'

# Runs every rule over one tree and reports both kinds of failure. $1 = root,
# $2 = the expected version, $3 = `strict` to enforce the minimums.
# NUL-delimited path listing, used only by the newline guard. Its own function
# because a `case` pattern's `)` inside a `$( … )` substitution is a parser
# trap in some shells.
list_paths_z() {
  if [ "$2" = git ]; then
    ( cd "$1" && git -c core.quotePath=false ls-files -z )
  else
    ( cd "$1" && find . -type f -print0 )
  fi
}

scan_tree() {
  root=$1; want_ver=$2; strict=${3:-}; quiet_scan=${4:-}; lister=${5:-git}
  # The file list is materialized rather than piped so the count below is a
  # count of INPUTS, not of matches — a rule reporting zero is ambiguous
  # between "clean" and "the scan read nothing".
  # `[ -d .git ]` was WRONG here and silently degraded the whole gate: in a
  # LINKED GIT WORKTREE `.git` is a regular FILE (a gitdir pointer), so the
  # test failed and the scan fell back to a filesystem walk — reading build
  # output, node_modules and untracked files, and making the local answer
  # differ from CI's. Every cycle in this repo runs in a worktree, so the
  # designed branch was the one that never ran locally. The lister is now
  # passed in explicitly rather than sniffed, because sniffing is what broke.
  : > "$TMP/missing"
  if [ "$lister" = git ]; then
    # `-c core.quotePath=false`: with the DEFAULT (true, which is what CI's
    # fresh checkout gets) a path with non-ASCII bytes comes back C-quoted as
    # one token, `[ -f ]` then fails, and the file drops out of the scan while
    # the tree still reads clean. This repo ships Japanese examples and
    # `site/ja/`, so such a path is a plausible next commit.
    ( cd "$root" && git -c core.quotePath=false ls-files ) > "$TMP/files"
  else
    ( cd "$root" && find . -type f | sed 's|^\./||' ) > "$TMP/files"
  fi
  # A newline in a path would split one file into two list entries and the
  # scan would silently read neither. Refuse rather than mis-report.
  n_lines=$(wc -l < "$TMP/files" | tr -d ' ')
  [ "$n_lines" -gt 0 ] || { echo "check-versions: the file listing is EMPTY" >&2; return 1; }
  n_paths=$( list_paths_z "$root" "$lister" | tr -cd '\0' | wc -c | tr -d ' ')
  if [ "$n_lines" != "$n_paths" ]; then
    echo "check-versions: a tracked path contains a newline; refusing to scan" >&2
    return 1
  fi
  hits=$(
    cd "$root" || exit 1
    while IFS= read -r f; do
      is_excluded "$f" && continue
      if [ ! -f "$f" ]; then printf '%s\n' "$f" >> "$TMP/missing"; continue; fi
      # `|| exit 1`, not a bare call: a while loop's status is its LAST
      # iteration's, so a failure part-way through the tree would otherwise be
      # overwritten by the files scanned after it.
      scan_file "$f" || exit 1
    done < "$TMP/files"
  ) || return 1
  # A path that listed but could not be read is a hole in the scan, not a
  # staged deletion to wave through. One is normal during a rebase; a handful
  # means the listing and the filesystem disagree and the gate is measuring
  # less than it claims.
  if [ -s "$TMP/missing" ]; then
    printf 'FAIL versions: %s listed path(s) could not be read:\n' \
      "$(wc -l < "$TMP/missing" | tr -d ' ')" >&2
    sed 's/^/  /' "$TMP/missing" >&2
    return 1
  fi
  # The proving count is of the INPUTS. A rule reporting zero is otherwise
  # ambiguous between "clean" and "the scan read nothing at all".
  [ -n "$quiet_scan" ] || printf 'versions: scanned %s tracked files\n' \
    "$(wc -l < "$TMP/files" | tr -d ' ')"
  rc=0
  # The drift half: every literal a rule found must equal the workspace version.
  printf '%s\n' "$hits" | while IFS='|' read -r rule file line ver; do
    [ -n "${rule:-}" ] || continue
    [ "$ver" = "$want_ver" ] && continue
    printf 'VERSION DRIFT %s %s:%s %s (want %s)\n' "$rule" "$file" "$line" "$ver" "$want_ver"
  done > "$TMP/drift"
  if [ -s "$TMP/drift" ]; then cat "$TMP/drift"; rc=1; fi
  # The fail-open half: a rule that has stopped matching.
  if [ "$strict" = strict ]; then
    printf '%s\n' "$RULES" | while IFS=: read -r rule min; do
      n=$(printf '%s\n' "$hits" | grep -c "^$rule|" || true)
      [ "$n" -ge "$min" ] || printf 'VERSION UNDERCOUNT %s matched %s, expected at least %s\n' "$rule" "$n" "$min"
    done > "$TMP/under"
    if [ -s "$TMP/under" ]; then cat "$TMP/under"; rc=1; fi
  fi
  return $rc
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------------------
# Self-test. Runs the REAL scanner over a fixture carrying one wrong version
# per rule, plus the two escape hatches, and asserts an exact hit count. A
# detector that silently stops detecting prints its success line forever, and
# this is the only thing that would notice.
# ---------------------------------------------------------------------------
self_test() {
  fx="$TMP/fixture"
  mkdir -p "$fx/engine" "$fx/sdk/js" "$fx/gui" "$fx/scripts/release" "$fx/sbom"

  printf '[workspace.package]\nversion = "9.9.9"\nedition = "2021"\n' > "$fx/engine/Cargo.toml"
  printf 'shojiku-core = { path = "core", version = "9.9.9" }\n' >> "$fx/engine/Cargo.toml"
  cat > "$fx/pom.xml" <<'XML'
<project>
  <groupId>jp.kengos</groupId>
  <artifactId>shojiku</artifactId>
  <version>9.9.9</version>
  <dependencies>
    <dependency>
      <groupId>jp.kengos</groupId>
      <artifactId>shojiku</artifactId>
      <version>9.9.9</version>
    </dependency>
  </dependencies>
</project>
XML
  printf '<Project>\n<PackageId>Shojiku</PackageId>\n<Version>9.9.9</Version>\n</Project>\n' > "$fx/a.csproj"
  printf '<PackageReference Include="Shojiku" Version="9.9.9" />\n' >> "$fx/a.csproj"
  printf '{\n  "version": "9.9.9"\n}\n' > "$fx/sdk/js/package.json"
  printf '{\n  "version": "0.0.0"\n}\n' > "$fx/gui/package.json"
  printf 'VERSION = "9.9.9"\n' > "$fx/version.rb"
  printf 'tar xzf shojiku-9.9.9-packs.tar.gz\n' > "$fx/README.md"
  printf 'https://github.com/kengos/shojiku/releases/download/v9.9.9/x.tgz\n' >> "$fx/README.md"
  printf "implementation 'jp.kengos:shojiku:9.9.9'\n" >> "$fx/README.md"
  printf 'layout=bundle/jp/kengos/shojiku/9.9.9\n' >> "$fx/README.md"
  printf 'VERSION=9.9.9\n' > "$fx/scripts/release/assemble.sh"
  # The two escape hatches: an exempt LINE and an excluded PATH. Both must
  # produce no hit, or the hatch is decorative.
  printf 'tar xzf shojiku-1.1.1.tar.gz  # version-check-exempt: the hatch itself\n' > "$fx/exempt.md"
  # One case per exclusion CLASS, not one per list. A broken exclusion is a
  # false RED rather than a fail-open, but nothing else would notice it.
  printf 'shojiku-1.1.1.gem released\n' > "$fx/CHANGELOG.md"
  printf '{"component":{"version":"1.1.1"},"name":"shojiku-1.1.1"}\n' > "$fx/sbom/engine.cdx.json"
  printf 'shojiku-1.1.1\n' > "$fx/pnpm-lock.yaml"

  # Every literal above is 9.9.9, so scanning for 9.9.9 must find NO drift...
  if ! scan_tree "$fx" 9.9.9 "" quiet find > "$TMP/clean" 2>&1; then
    echo "FAIL versions self-test: a consistent fixture reported drift" >&2
    cat "$TMP/clean" >&2; return 1
  fi
  # ...and scanning for anything else must find exactly one per rule.
  scan_tree "$fx" 0.0.0 "" quiet find > "$TMP/dirty" 2>&1 || true
  got=$(grep -c '^VERSION DRIFT ' "$TMP/dirty" || true)
  want=$(printf '%s\n' "$RULES" | wc -l | tr -d ' ')
  if [ "$got" != "$want" ]; then
    echo "FAIL versions self-test: expected $want drift lines, got $got" >&2
    cat "$TMP/dirty" >&2; return 1
  fi
  # One case per rule, named — a count alone would pass if two rules fired
  # twice and one not at all.
  printf '%s\n' "$RULES" | while IFS=: read -r rule _; do
    grep -q "^VERSION DRIFT $rule " "$TMP/dirty" || {
      echo "FAIL versions self-test: rule $rule matched nothing" >&2; exit 1; }
  done || return 1
  # The hatches produced no hit at all.
  # Three hatches, three fixture cases: an exempt LINE, an excluded PATH, and
  # the rule-scoped `gui/` skip that exists because JSON cannot carry the
  # inline token at all.
  if grep -qE 'exempt\.md|history\.md|gui/package\.json|CHANGELOG|sbom/|lock\.yaml' "$TMP/dirty"; then
    echo "FAIL versions self-test: an exempt line, excluded path or gui manifest was scanned" >&2
    cat "$TMP/dirty" >&2; return 1
  fi
  # A rule that has stopped matching must FAIL rather than read as clean.
  if scan_tree "$fx" 9.9.9 strict quiet find > "$TMP/under" 2>&1; then
    echo "FAIL versions self-test: the minimum counts did not fire on a small tree" >&2
    return 1
  fi
  grep -q '^VERSION UNDERCOUNT ' "$TMP/under" || {
    echo "FAIL versions self-test: undercount produced no UNDERCOUNT line" >&2
    cat "$TMP/under" >&2; return 1; }
  echo "versions self-test: $want rules, three escape hatches, undercount guard"
}

self_test || exit 1

TRUTH=$(awk '/^\[workspace\.package\]/{w=1;next} /^\[/{w=0} w && /^version[ \t]*=/{gsub(/[^0-9.]/,"");print;exit}' \
  "$REPO_ROOT/engine/Cargo.toml")
[ -n "$TRUTH" ] || { echo "check-versions: could not read [workspace.package] version" >&2; exit 1; }
echo "versions: workspace is $TRUTH"

scan_tree "$REPO_ROOT" "$TRUTH" strict || {
  echo "check-versions: a release coordinate disagrees with the workspace version." >&2
  echo "  Bump it, or mark the line \`$EXEMPT_TOKEN <reason>\` if it is history." >&2
  exit 1
}
echo "versions: every release coordinate agrees"

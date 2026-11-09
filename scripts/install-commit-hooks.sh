#!/bin/sh
# Installs the secret-scanning git hooks (pre-commit, pre-merge-commit) into
# the shared hooks directory of a clone: `git rev-parse --git-common-dir`/hooks,
# which every worktree of the clone uses.
#
#   scripts/install-commit-hooks.sh <hooks-source-dir> <repository-dir>
#
# `make secrets:install` passes the two files as committed in HEAD (or in
# origin/main when HEAD has no `.githooks/`); the hook
# self-test (scripts/check-hooks.sh) passes this checkout's `.githooks`.
#
# The script checks two conditions before it changes anything, and refuses
# when either holds:
#   - core.hooksPath is set in any config file to anything other than a local
#     `.githooks` value, because git then runs no hook from the shared hooks
#     directory;
#   - the hooks directory already holds a pre-commit or pre-merge-commit that
#     is not an installed copy of these hooks (an installed copy holds the
#     line `# shojiku-secret-scan-hook`).
# When neither holds, it removes a local core.hooksPath=.githooks (which an
# earlier version of `make secrets:install` wrote) and installs the two hooks.

set -eu

src=$1
repo=$2
marker='# shojiku-secret-scan-hook'

for f in pre-commit pre-merge-commit; do
	grep -qxF -- "$marker (scripts/install-commit-hooks.sh recognises an" "$src/$f" || {
		echo "install-commit-hooks: $src/$f is not the secret-scanning hook" >&2
		exit 1
	}
done

# Every core.hooksPath value with its scope, one per line ("local\t.githooks").
others=$(git -C "$repo" config --show-scope --get-all core.hooksPath |
	grep -v "^local$(printf '\t').githooks\$" || true)
if [ -n "$others" ]; then
	echo "install-commit-hooks: core.hooksPath is set ($(printf '%s' "$others" | tr '\t\n' ': ')), so git would not run the hooks installed in the shared hooks directory. Remove that setting, then run this again." >&2
	exit 1
fi

common=$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)
for f in pre-commit pre-merge-commit; do
	dest="$common/hooks/$f"
	if [ -e "$dest" ] && ! grep -q -- "^$marker" "$dest"; then
		echo "install-commit-hooks: $dest already exists and is not an installed copy of the secret-scanning hook. Rename or delete it (or add what it does to .githooks/$f), then run this again." >&2
		exit 1
	fi
done

if [ "$(git -C "$repo" config --local --get core.hooksPath || true)" = .githooks ]; then
	git -C "$repo" config --local --unset core.hooksPath
	echo "install-commit-hooks: removed core.hooksPath=.githooks from the local config"
fi
mkdir -p "$common/hooks"
for f in pre-commit pre-merge-commit; do
	cp -- "$src/$f" "$common/hooks/$f.new"
	chmod 755 "$common/hooks/$f.new"
	mv -- "$common/hooks/$f.new" "$common/hooks/$f"
	echo "install-commit-hooks: installed $common/hooks/$f"
done

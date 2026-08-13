#!/usr/bin/env bash
#
# Per-session git worktrees.
#
# Why this exists: several Claude sessions used to share one checkout. When one
# session ran `git checkout` while another was mid-task, the second session's
# commits landed on the wrong branch — and a later `reset --hard` threw them
# away. That happened four times; once it cost a 22-file implementation that
# only came back via reflog. A worktree per session makes branch state private,
# so no session can move another's HEAD.
#
# Usage:
#   scripts/session-worktree.sh new <name> [base]   # create (base defaults to origin/main)
#   scripts/session-worktree.sh list                # show worktrees + dirty/unpushed state
#   scripts/session-worktree.sh remove <name>       # remove, refusing to discard work
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
COMMON_DIR="$(git rev-parse --git-common-dir)"
# The primary checkout owns the gitignored runtime files (secrets/) that a fresh
# worktree has no copy of.
PRIMARY="$(cd "$(dirname "$COMMON_DIR")" && pwd)"
WORKTREE_HOME="${SESSION_WORKTREE_HOME:-$HOME/orca/worktrees/ivyusa-talktalk}"
BRANCH_PREFIX="session"

die() { echo "error: $*" >&2; exit 1; }
info() { echo "==> $*"; }

cmd_new() {
  local name="${1:-}" base="${2:-origin/main}"
  [ -n "$name" ] || die "usage: session-worktree.sh new <name> [base]"
  # A worktree name becomes a path and a branch name; keep it boring.
  [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "name must be lowercase letters, digits and dashes: $name"

  local dest="$WORKTREE_HOME/$name"
  local branch="$BRANCH_PREFIX/$name"
  [ -e "$dest" ] && die "already exists: $dest"
  git show-ref --verify --quiet "refs/heads/$branch" && die "branch already exists: $branch"

  info "fetching origin"
  git fetch -q origin

  mkdir -p "$WORKTREE_HOME"
  info "creating worktree at $dest (branch $branch, from $base)"
  git worktree add -b "$branch" "$dest" "$base"

  # node_modules is ~700MB and a fresh `npm ci` takes minutes. An APFS clone is
  # seconds and costs almost no disk (copy-on-write), and — the part that
  # matters — it copies node_modules/@ivy/* as the *relative* symlinks they are,
  # so they resolve to THIS worktree's apps/ and packages/. A plain symlink of
  # the whole node_modules directory would resolve them to the source worktree
  # instead, silently building the wrong code.
  # Prefer this worktree's own node_modules, then the primary checkout's — a
  # session worktree created from another session worktree has none of its own.
  local nm_src=""
  [ -d "$REPO_ROOT/node_modules" ] && nm_src="$REPO_ROOT/node_modules"
  [ -z "$nm_src" ] && [ -d "$PRIMARY/node_modules" ] && nm_src="$PRIMARY/node_modules"

  if [ -n "$nm_src" ]; then
    info "cloning node_modules from ${nm_src/#$HOME/~} (APFS copy-on-write)"
    if ! cp -Rc "$nm_src" "$dest/node_modules" 2>/dev/null; then
      rm -rf "$dest/node_modules"   # a partial copy is worse than none
      info "clone unavailable on this filesystem — falling back to npm ci"
      (cd "$dest" && npm ci)
    fi
  else
    info "no node_modules to clone — running npm ci"
    (cd "$dest" && npm ci)
  fi

  # secrets/ is gitignored, so a fresh worktree has none — which is why a deploy
  # from one silently loses its SSH details. Linked, not copied: one file to
  # rotate, and nothing extra on disk to leak.
  if [ -d "$PRIMARY/secrets" ] && [ ! -e "$dest/secrets" ]; then
    ln -s "$PRIMARY/secrets" "$dest/secrets"
    info "linked secrets/ from the primary checkout"
  fi

  echo
  info "ready. Work here:"
  echo "  cd \"$dest\""
  echo
  echo "  branch: $branch (tracking nothing — push with -u when you open the PR)"
}

cmd_list() {
  git worktree list --porcelain | awk '/^worktree /{print substr($0,10)}' | while read -r wt; do
    [ -d "$wt" ] || continue

    local branch dirty unpushed flags=""
    branch="$(git -C "$wt" branch --show-current 2>/dev/null)"
    [ -n "$branch" ] || branch="(detached)"

    dirty="$(git -C "$wt" status --porcelain 2>/dev/null | grep -c '' || true)"
    # Commits that exist only here are the ones a careless reset would destroy.
    # A branch with no upstream reports nothing rather than a spurious count.
    if git -C "$wt" rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then
      unpushed="$(git -C "$wt" log --oneline '@{u}..HEAD' 2>/dev/null | grep -c '' || true)"
    else
      unpushed=0
    fi

    [ "$dirty" = "0" ] || flags="$flags dirty:$dirty"
    [ "$unpushed" = "0" ] || flags="$flags unpushed:$unpushed"
    printf '%-56s %-38s%s\n' "${wt/#$HOME/~}" "$branch" "$flags"
  done
}

cmd_remove() {
  local name="${1:-}"
  [ -n "$name" ] || die "usage: session-worktree.sh remove <name>"
  local dest="$WORKTREE_HOME/$name"
  [ -d "$dest" ] || die "no such worktree: $dest"

  # Refuse rather than ask: this script exists because work got thrown away, and
  # a prompt is exactly what an automated caller answers wrongly.
  local dirty unpushed
  dirty="$(git -C "$dest" status --porcelain | wc -l | tr -d ' ')"
  unpushed="$(git -C "$dest" log --oneline '@{u}..HEAD' 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
  [ "$dirty" = "0" ] || die "$name has $dirty uncommitted change(s) — commit or discard them yourself first"
  [ "$unpushed" = "0" ] || die "$name has $unpushed unpushed commit(s) — push them or delete the worktree by hand"

  local branch
  branch="$(git -C "$dest" branch --show-current)"
  info "removing $dest"
  rm -rf "$dest/node_modules"   # the clone; git worktree remove would refuse otherwise
  git worktree remove "$dest"
  info "worktree removed. The branch $branch is kept — delete it with: git branch -d $branch"
}

case "${1:-}" in
  new)    shift; cmd_new "$@" ;;
  list)   shift; cmd_list "$@" ;;
  remove) shift; cmd_remove "$@" ;;
  *)      sed -n '2,20p' "$0" | sed 's/^#\s\?//'; exit 1 ;;
esac

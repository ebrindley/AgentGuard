#!/bin/zsh
# usage: scripts/release.sh [--dev] [--out DIR] VERSION
# Builds agent-guard-VERSION.tar.gz, its .sha256 and the bootstrap install.sh in
# DIR (default dist/). The archive holds the files listed below, VERSION and COMMIT.
# Without --dev the checkout must be clean and COMMIT is its HEAD. --dev also accepts
# a dirty or non-git tree (COMMIT is then "dev"); such a build is not for publishing.
# Every build runs scripts/check-seams.zsh on what it packages and stops if it fails.
emulate -L zsh
setopt err_exit no_unset pipe_fail extended_glob

usage() { print -u2 'usage: scripts/release.sh [--dev] [--out DIR] VERSION'; exit 2 }
die() { print -ru2 -- "$*"; exit 1 }
dev=0 out=
while (( $# )); do
  case $1 in
    (--dev) dev=1; shift ;;
    (--out) (( $# >= 2 )) || usage; out=$2; shift 2 ;;
    (-*) usage ;;
    (*) break ;;
  esac
done
(( $# == 1 )) || usage
version=$1
[[ $version == [0-9A-Za-z][0-9A-Za-z.+-]# ]] || { print -ru2 -- "invalid version: $version"; exit 2 }
tag="v$version"

root=${0:A:h:h}
name="agent-guard-$version"
dist=${out:-$root/dist}
files=(
  install.sh
  LICENSE
  engine/launch
  engine/account.zsh
  engine/agent-guard
  engine/profile.sb
  engine/vendor/THIRD-PARTY-NOTICES
  profiles/opencode/harness.zsh
  profiles/opencode/hooks.zsh
  profiles/opencode/protected.sb
  profiles/opencode/plugin.js
  profiles/opencode/opencode
  profiles/opencode/opencode-gui
  profiles/opencode/install.sh
  profiles/opencode/uninstall.sh
  profiles/opencode/assets/AgentGuard.icns
  installer/lib.zsh
  installer/actions.zsh
  installer/harness/opencode.zsh
  installer/migrate/opencode-guard.zsh
)
# Folders shipped whole, apart from Finder and AppleDouble files.
trees=(
  engine/vendor/cc-safety-net
  profiles/opencode/templates
)

for f in $files; do
  [[ -f $root/$f ]] || die "missing: $f"
done
for t in $trees; do
  [[ -d $root/$t ]] || die "missing: $t/"
  files+=(${(f)"$(cd "$root" && /usr/bin/find "$t" -type f ! -name .DS_Store ! -name '._*' | /usr/bin/sort)"})
done

# COMMIT: HEAD of a clean checkout. A tree inside another checkout (a test copy) is not one.
commit=
if top=$(/usr/bin/git -C "$root" rev-parse --show-toplevel 2>/dev/null) && [[ ${top:A} == ${root:A} ]]; then
  if [[ -z $(/usr/bin/git -C "$root" status --porcelain) ]]; then
    commit=$(/usr/bin/git -C "$root" rev-parse HEAD)
  elif (( dev )); then
    commit=dev
  else
    die "uncommitted changes in $root; commit them or pass --dev"
  fi
elif (( dev )); then
  commit=dev
else
  die "$root is not a git checkout; pass --dev"
fi

# The account lookup: the function from its "account_home() {" line through the
# first line holding only "}". It must occur once per file.
account_function() {
  local l n=0 on=0
  local -a lines body
  lines=("${(@f)$(<$1)}")
  for l in $lines; do
    [[ $l == 'account_home() {' ]] && { n=$((n + 1)); on=1 }
    (( on == 1 )) && body+=("$l")
    (( on == 1 )) && [[ $l == '}' ]] && on=2
  done
  (( n == 1 && on == 2 )) || return 1
  REPLY=${(F)body}
}
account_function "$root/engine/launch" || die "engine/launch: account_home() not found once"
from_launch=$REPLY
account_function "$root/engine/account.zsh" || die "engine/account.zsh: account_home() not found once"
[[ $from_launch == "$REPLY" ]] || die "engine/account.zsh and engine/launch define different account_home functions"
account=$REPLY

stage=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/agent-guard-release.XXXXXX")
trap '/bin/rm -rf "$stage"' EXIT
for f in $files; do
  /bin/mkdir -p "$stage/$name/${f:h}"
  /bin/cp -pX "$root/$f" "$stage/$name/$f"
done
print -r -- "$version" > "$stage/$name/VERSION"
print -r -- "$commit" > "$stage/$name/COMMIT"

# The bootstrap: each placeholder must occur exactly once in the template.
text=$(<"$root/scripts/bootstrap.zsh")
for p v in @TAG@ "$tag" @VERSION@ "$version" @ACCOUNT_HOME@ "$account"; do
  parts=("${(@ps:$p:)text}")
  (( $#parts == 2 )) || die "scripts/bootstrap.zsh: $p occurs $(( $#parts - 1 )) times, expected once"
  text=${parts[1]}$v${parts[2]}
done
print -r -- "$text" > "$stage/install.sh"
/bin/zsh -n "$stage/install.sh" || die "the filled bootstrap does not parse"

/bin/zsh "$root/scripts/check-seams.zsh" "$stage/$name" "$stage/install.sh" || die "seam check failed"

/bin/mkdir -p "$dist"
archive="$name.tar.gz"
# Only files are listed, so the archive has no folder entries. The fixed owner
# keeps the builder's account name out of the archive.
(cd "$stage" && COPYFILE_DISABLE=1 /usr/bin/tar -czf "$archive" --no-xattrs --no-acls --no-fflags \
  --uid 0 --gid 0 --uname root --gname wheel "$name/VERSION" "$name/COMMIT" "${files[@]/#/$name/}")
(cd "$stage" && /usr/bin/shasum -a 256 "$archive" > "$archive.sha256")
/bin/mv -f "$stage/$archive" "$stage/$archive.sha256" "$stage/install.sh" "$dist/"
print -r -- "$dist/$archive"
print -r -- "$dist/$archive.sha256"
print -r -- "$dist/install.sh"

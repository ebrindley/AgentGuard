#!/bin/zsh
# usage: scripts/release.sh VERSION
# Builds dist/agent-guard-VERSION.tar.gz and its .sha256 from the files listed below.
emulate -L zsh
setopt err_exit no_unset pipe_fail extended_glob

(( $# == 1 )) || { print -u2 'usage: scripts/release.sh VERSION'; exit 2 }
version=$1
[[ $version == [0-9A-Za-z][0-9A-Za-z.+-]# ]] || { print -ru2 -- "invalid version: $version"; exit 2 }

root=${0:A:h:h}
name="agent-guard-$version"
dist="$root/dist"
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
)
# Folders shipped whole, apart from Finder and AppleDouble files.
trees=(
  engine/vendor/cc-safety-net
  profiles/opencode/templates
)

for f in $files; do
  [[ -f $root/$f ]] || { print -ru2 -- "missing: $f"; exit 1 }
done
for t in $trees; do
  [[ -d $root/$t ]] || { print -ru2 -- "missing: $t/"; exit 1 }
  files+=(${(f)"$(cd "$root" && /usr/bin/find "$t" -type f ! -name .DS_Store ! -name '._*' | /usr/bin/sort)"})
done

stage=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/agent-guard-release.XXXXXX")
trap '/bin/rm -rf "$stage"' EXIT
for f in $files; do
  /bin/mkdir -p "$stage/$name/${f:h}"
  /bin/cp -pX "$root/$f" "$stage/$name/$f"
done
print -r -- "$version" > "$stage/$name/VERSION"

/bin/mkdir -p "$dist"
archive="$name.tar.gz"
# Only files are listed, so the archive has no folder entries. The fixed owner
# keeps the builder's account name out of the archive.
(cd "$stage" && COPYFILE_DISABLE=1 /usr/bin/tar -czf "$archive" --no-xattrs --no-acls --no-fflags \
  --uid 0 --gid 0 --uname root --gname wheel "$name/VERSION" "${files[@]/#/$name/}")
(cd "$stage" && /usr/bin/shasum -a 256 "$archive" > "$archive.sha256")
/bin/mv -f "$stage/$archive" "$stage/$archive.sha256" "$dist/"
print -r -- "$dist/$archive"
print -r -- "$dist/$archive.sha256"

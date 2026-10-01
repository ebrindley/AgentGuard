#!/bin/zsh
# Builds the 0.0.0-test release, checks its contents and checksum, then runs
# test.sh against the unpacked archive. Runs outside any sandbox, from a checkout.
emulate -L zsh
setopt no_unset pipe_fail

source_root=${0:A:h:h}
version=0.0.0-test
name="agent-guard-$version"
archive="$source_root/dist/$name.tar.gz"
fails=0
pass() { print -r -- "ok   $*" }
fail() { print -r -- "FAIL $*"; fails=$((fails + 1)) }

/bin/zsh "$source_root/scripts/release.sh" $version >/dev/null || { print -ru2 'release.sh failed'; exit 1 }

# The file list from the backlog item: named files, VERSION, and every tracked
# file in the two folders shipped whole.
expected=(
  VERSION install.sh LICENSE
  engine/launch engine/profile.sb engine/vendor/THIRD-PARTY-NOTICES
  profiles/opencode/{harness.zsh,hooks.zsh,protected.sb,plugin.js,opencode,opencode-gui,install.sh,uninstall.sh}
  profiles/opencode/assets/AgentGuard.icns
  ${(f)"$(/usr/bin/git -C "$source_root" ls-files -- engine/vendor/cc-safety-net profiles/opencode/templates)"}
)
listed=$(/usr/bin/tar -tzf "$archive") || fail "archive readable"
if [[ ${(F)${(o)${(f)listed}}} == ${(F)${(o)expected/#/$name/}} ]]; then
  pass "archive lists exactly the release files"
else
  fail "archive lists exactly the release files"
  /usr/bin/diff <(print -rl -- ${(o)expected/#/$name/}) <(print -rl -- ${(o)${(f)listed}})
fi
unwanted=(${(M)${(f)listed}:#(*/|)(test|docs|backlog|.poetic)/*} ${(M)${(f)listed}:#*(.DS_Store|/._*)})
(( $#unwanted == 0 )) && pass "no test, docs, backlog, .poetic, .DS_Store or AppleDouble entries" || fail "unwanted entries: $unwanted"
(cd "${archive:h}" && /usr/bin/shasum -a 256 -c "${archive:t}.sha256" >/dev/null 2>&1) && pass "shasum -a 256 -c accepts the .sha256" || fail "checksum"
[[ $(/usr/bin/tar -xOzf "$archive" "$name/VERSION") == $version ]] && pass "VERSION holds $version" || fail "VERSION"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-release-XXXXXX")
/usr/bin/tar -xzf "$archive" -C "$run" || fail "unpack"
print -r -- "integration checks against the unpacked archive:"
/bin/zsh "$source_root/test/test.sh" --source "$run/$name" || fails=$((fails + 1))
/bin/rm -rf "$run"

print -r -- "$fails release failure(s)"
(( fails == 0 ))

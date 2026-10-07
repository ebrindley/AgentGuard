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

# --dev so a checkout with uncommitted changes can be tested; COMMIT then reads "dev".
# release.sh stops when the seam check fails, with --dev too.
built=$(/bin/zsh "$source_root/scripts/release.sh" --dev $version 2>&1 >/dev/null) || { print -ru2 "release.sh failed: $built"; exit 1 }
pass "release.sh passed the seam check: production seam forms present, no AG_TEST_"

# The file list from the backlog item: named files, VERSION, COMMIT, and every
# tracked file in the folders shipped whole.
expected=(
  VERSION COMMIT install.sh LICENSE
  engine/launch engine/account.zsh engine/agent-guard engine/profile.sb engine/vendor/THIRD-PARTY-NOTICES
  engine/peers.zsh engine/peer-runtime.sb
  profiles/opencode/{harness.zsh,hooks.zsh,skills.zsh,protected.sb,plugin.js,opencode,opencode-gui,install.sh,uninstall.sh}
  installer/{lib.zsh,actions.zsh,harness/{opencode,pi}.zsh,migrate/{opencode-guard,pi-sandbox-guard}.zsh}
  profiles/opencode/assets/AgentGuard.icns
  profiles/pi/{LICENSE,launchers/{pi,example-custom},sandbox/{pi-sandbox.sb,pi-sandbox-preamble.zsh}}
  profiles/pi/src/{index.mjs,guard-core.mjs,validate-bash-command.sh}
  profiles/pi/scripts/{extension-entry.ts,test-sandbox-profile.sh,check-launchers.mjs,bind-executable.sh,lib-ops.sh}
  profiles/pi/commands/{bind,doctor,wrapper}.zsh
  ${(f)"$(/usr/bin/git -C "$source_root" ls-files -- engine/vendor/cc-safety-net engine/peers profiles/opencode/templates)"}
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
if [[ -z $(/usr/bin/git -C "$source_root" status --porcelain) ]]; then want=$(/usr/bin/git -C "$source_root" rev-parse HEAD); else want=dev; fi
[[ $(/usr/bin/tar -xOzf "$archive" "$name/COMMIT") == $want ]] && pass "COMMIT holds $want" || fail "COMMIT"
bootstrap="$source_root/dist/install.sh"
[[ $(/usr/bin/grep -c "local tag='v$version' version='$version'" "$bootstrap") == 1 ]] && ! /usr/bin/grep -qE '@[A-Z_]+@' "$bootstrap" &&
  /bin/zsh -n "$bootstrap" && pass "dist/install.sh names v$version, has no placeholder and parses" || fail "dist/install.sh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-release-XXXXXX")
/usr/bin/tar -xzf "$archive" -C "$run" || fail "unpack"
print -r -- "integration checks against the unpacked archive:"
/bin/zsh "$source_root/test/test.sh" --source "$run/$name" || fails=$((fails + 1))
/bin/rm -rf "$run"

print -r -- "$fails release failure(s)"
(( fails == 0 ))

#!/bin/zsh
# agent-guard bind, agent-guard wrapper add|remove|list and the Pi checks of
# agent-guard doctor and doctor --json (docs/DESIGN.md section 11, Commands), in a
# disposable home. The release's Pi files and the installed copies are
# profiles/pi's, with the preamble's directory lookup pointed at the disposable
# home; the Pi and OMP runtimes are fakes. Runs outside any sandbox, from a checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
unset AGENT_GUARD_RELEASE AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED
command -v node >/dev/null || { print -ru2 'Node is required for the checker and the wrapper check'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
integer fails=0 checks=0
label=
out=
pass() { checks+=1; print -r -- "ok   ${label:+$label: }$*" }
fail() { checks+=1; fails+=1; print -r -- "FAIL ${label:+$label: }$*" }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-pi-XXXXXX")
run=${run:A}
finish() {
  /bin/chmod -R u+w "$run" 2>/dev/null
  /bin/rm -rf "$run"
  print -r -- "$checks checks, $fails failure(s)"
  (( fails == 0 ))
  exit
}
new_home "$run/home"
home=$REPLY
engine="$home/Library/Application Support/AgentGuard"
lb="$home/.local/bin"
ext="$home/.pi/agent/extensions/pi-sandbox-guard"
conf="$home/.config/pi-sandbox-guard/executables.conf"
wrec="$engine/state/wrappers.json"
stamp="$engine/state/stamp.json"
rid=0.2.0-20261002T000000Z
rel="$engine/releases/$rid"

# replace_once FILE FROM TO: FROM occurs exactly once in FILE.
replace_once() {
  local text=$(<"$1")
  (( ${#text} - ${#${text//$2/}} == ${#2} )) || { print -ru2 -- "seam must occur once in $1: $2"; exit 1 }
  print -r -- "${text/$2/$3}" > "$1"
}

# The test tree: engine/launch and engine/account.zsh take the disposable home, and
# the OpenCode launcher looks for its CLI only inside it, so launch check skips the
# plugin check whatever this Mac has installed.
/bin/mkdir -p "$run/tree"
node "$adapter" stage "$source_root" "$run/tree" "$home" || { fail 'cannot stage the tree'; finish }
node "$adapter" isolate "$run/tree" || { fail 'cannot isolate harness discovery'; finish }

# The release folder, as the installer lays it out, with profiles/pi's files, the
# vendored cc-safety-net and the checker's templates.
/bin/mkdir -p "$rel/bin" "$rel/profiles/opencode" "$rel/profiles/pi/scripts" "$engine/state" "$home/Agent Guard" "$home/.cc-safety-net"
/bin/cp "$run/tree/engine/"{launch,profile.sb,account.zsh,updates.zsh,peers.zsh,peer-runtime.sb} "$run/tree/profiles/opencode/"{install.sh,uninstall.sh} "$rel/"
/bin/cp -R "$run/tree/engine/peers" "$rel/peers"
/bin/cp -R "$run/tree/engine/checker" "$rel/checker"
/bin/cp -R "$run/tree/engine/vendor" "$rel/vendor"
/bin/cp -R "$run/tree/profiles/opencode/templates" "$rel/profiles/opencode/templates"
/bin/cp -R "$run/tree/profiles/opencode/templates/cc-safety-net/." "$home/.cc-safety-net/"
/bin/cp -R "$run/tree/installer" "$rel/"
/bin/cp "$run/tree/engine/agent-guard" "$run/tree/profiles/opencode/"{opencode,opencode-gui} "$rel/bin/"
/bin/cp "$run/tree/profiles/opencode/"{harness.zsh,hooks.zsh,runtime.zsh,browser.zsh,skills.zsh,protected.sb,credentials.sb,plugin.js} "$rel/profiles/opencode/"
/bin/cp -R "$run/tree/profiles/pi/commands" "$rel/profiles/pi/"
/bin/cp "$run/tree/profiles/pi/scripts/"{bind-executable.sh,lib-ops.sh} "$rel/profiles/pi/scripts/"
/bin/cp -R "$source_root/profiles/pi/"{launchers,sandbox,src} "$rel/profiles/pi/"
/bin/cp "$run/tree/profiles/pi/scripts/"{extension-entry.ts,check-launchers.mjs,test-sandbox-profile.sh} "$rel/profiles/pi/scripts/"
print -r -- $rid > "$rel/RELEASE"
print -r -- 0.2.0 > "$rel/VERSION"
print -r -- dev > "$rel/COMMIT"
/bin/ln -s "releases/$rid" "$engine/current"
/bin/ln -s current/bin "$engine/bin"
/bin/ln -s "$lb/pi" "$rel/bin/pi"
/bin/ln -s "$lb/omp" "$rel/bin/omp"
/bin/cp "$run/tree/profiles/opencode/templates/Guard List.txt" "$home/Agent Guard/"
write_stamp() { /usr/bin/jq -cn --arg r $rid '{version: "0.2.0", tag: "v0.2.0", commit: "dev", release: $r, installed_at: 0,
  harnesses: $ARGS.positional, files: {}, links: {}}' --args "$@" > "$stamp" }
write_stamp opencode pi
# A permission record: the wrapper commands load the installer, whose variables name it.
print -r -- '{"/x/opencode.json":{}}' > "$engine/state/permissions.json"

# The preamble finds the home through dscl; the test copy asks a fake that names the
# disposable home. The release copy and the installed copy are the same file.
print -r -- "#!/bin/zsh -f
print -r -- ${(qq):-NFSHomeDirectory: $home}" > "$run/dscl"
/bin/chmod 755 "$run/dscl"
replace_once "$rel/profiles/pi/sandbox/pi-sandbox-preamble.zsh" 'typeset -r DSCL_BIN="/usr/bin/dscl"' "typeset -r DSCL_BIN=${(qq)run}/dscl"

# What the installer puts in place.
/bin/mkdir -p "$lb" "$ext/src"
/bin/cp "$rel/profiles/pi/launchers/pi" "$lb/pi"
/bin/cp "$rel/profiles/pi/launchers/pi" "$lb/omp"
/bin/chmod 755 "$lb/pi" "$lb/omp"
/bin/cp "$rel/profiles/pi/sandbox/"{pi-sandbox.sb,pi-sandbox-preamble.zsh} "$lb/"
/bin/cp "$rel/profiles/pi/scripts/extension-entry.ts" "$ext/index.ts"
/bin/cp "$rel/profiles/pi/src/index.mjs" "$ext/src/"
print -r -- 'export PATH="$HOME/.local/bin:$PATH"' > "$home/.zprofile"

# Fake runtimes outside every sandbox-writable root.
runtime() {  # PATH BODY
  /bin/mkdir -p "${1:h}"
  print -r -- "#!/bin/zsh -f
$2" > "$1"
  /bin/chmod 755 "$1"
}
fake_pi="$home/opt/pi/bin/pi" fake_omp="$home/opt/omp/bin/omp"
runtime "$fake_pi" 'print -r -- "fake pi 1.0.0"'
runtime "$fake_omp" 'print -r -- "fake omp 2.0.0"'

# Node through a folder of its own, so no other program on its folder (CI's npm
# global opencode) is on PATH.
node_bin=${$(command -v node):A}
/bin/mkdir -p "$run/nodebin"
/bin/ln -s "$node_bin" "$run/nodebin/node"
darwin_temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
base="$run/nodebin:/usr/bin:/bin:/usr/sbin:/sbin"
# The Node bind records: the resolved node, or its Homebrew opt link.
stable_node() {
  local r=${1:A} s
  if [[ $r == (#b)(/opt/homebrew|/usr/local)/Cellar/(node(|@<->))/[^/]##/bin/node ]]; then
    s="$match[1]/opt/$match[2]/bin/node"
    [[ ${s:A} == $r ]] && { print -r -- $s; return }
  fi
  print -r -- $r
}
want_node=$(stable_node "$node_bin")

# ag ARGS...: agent-guard from the installed release in a clean environment; extra
# NAME=VALUE words before ARGS are added to it.
ag() {
  local -a env=()
  while [[ ${1:-} == [A-Z_]##=* ]]; do env+=("$1"); shift; done
  /usr/bin/env -i "HOME=$home" "USER=${USER:-}" "LOGNAME=${LOGNAME:-}" "PATH=$base" "TMPDIR=$darwin_temp/" $env \
    /bin/zsh "$engine/bin/agent-guard" "$@"
}
# runs NAME STATUS TEXT ARGS...: agent-guard ARGS exits STATUS and prints TEXT.
runs() {
  local name=$1 want=$2 text=$3
  integer rc=0
  shift 3
  out=$(ag "$@" 2>&1 </dev/null) || rc=$?
  if (( rc == want )) && [[ $out == *"$text"* ]]; then pass "$name"
  else fail "$name (exit $rc)"; print -r -- "$out" | /usr/bin/sed 's/^/     /'
  fi
}
mode() { /usr/bin/stat -f %Lp "$1" }
sha() { local s=$(/usr/bin/shasum -a 256 < "$1"); print -r -- ${s[1,64]} }

# --- bind
label=bind
runs 'show without a record' 3 "no binding recorded ($conf)" bind --show
runs 'records explicit paths; PI_SANDBOX_CONFIG_DIR is ignored' 0 "recorded in $conf" \
  PI_SANDBOX_CONFIG_DIR="$run/elsewhere" bind --pi "$fake_pi" --omp "$fake_omp" --yes
[[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$fake_pi"$'\n'"omp=$fake_omp" ]] && pass 'the record holds pi= and omp=' || fail 'the record holds pi= and omp='
[[ $(mode "$conf") == 600 && ! -e $run/elsewhere ]] && pass 'mode 600, in the account home only' || fail 'mode 600, in the account home only'
# A startup file bash reads before the script cannot set the variable again.
print -r -- "export PI_SANDBOX_CONFIG_DIR=${(qq)run}/elsewhere" > "$run/bash-env"
runs 'BASH_ENV cannot redirect the record' 0 "recorded in $conf" BASH_ENV="$run/bash-env" ENV="$run/bash-env" \
  bind --pi "$fake_pi" --omp "$fake_omp" --yes
[[ ! -e $run/elsewhere ]] && pass 'nothing is written where BASH_ENV points' || fail 'nothing is written where BASH_ENV points'
# A record that is a link to a folder: mv would move the new file into the folder.
/bin/mv "$conf" "$run/conf"
/bin/mkdir "$run/conf-dir"
/bin/ln -s "$run/conf-dir" "$conf"
runs 'refuses a record that is a link' 2 "$conf is a symbolic link or not a regular file" bind --pi "$fake_pi" --omp "$fake_omp" --yes
[[ -z $(print -l "$run/conf-dir"/*(DN) "${conf:h}"/executables.conf.*(DN)) ]] && pass 'nothing is written through the link' || fail 'nothing is written through the link'
/bin/rm "$conf"
/bin/mv "$run/conf" "$conf"
/usr/bin/grep -q '^# pi-sandbox-guard executable binding — written by agent-guard bind\.$' "$conf" && pass 'the record header names agent-guard bind' ||
  fail 'the record header names agent-guard bind'
runs 'show prints the bindings' 0 "pi   = $fake_pi"$'\n'"omp  = $fake_omp" bind --show
[[ $out != *"checker node"* ]] && pass 'show prints no checker Node' || fail 'show prints no checker Node'
runs 'check passes' 0 "binding ok: $fake_pi"$'\n'"omp: $fake_omp" bind --check
/bin/mv "$home/opt/omp" "$home/opt/omp.off"
runs 'check finds a stale binding' 3 "invalid: omp does not exist: $fake_omp"$'\n'"  re-record: agent-guard bind --detect" bind --check
/bin/mv "$home/opt/omp.off" "$home/opt/omp"
runtime "$home/.cache/x/pi" ':'
runs 'refuses a runtime in a sandbox-writable root' 2 "pi is inside a sandbox-writable root ($home/.cache/x/pi)" bind --pi "$home/.cache/x/pi" --yes
runs 'refuses an unknown argument' 2 'unknown argument: --bogus' bind --bogus
runs 'show works without node on PATH' 0 "pi   = $fake_pi" PATH=/usr/bin:/bin bind --show
runs 'refuses without node on PATH' 2 'node is not on PATH; agent-guard bind runs it to resolve paths' PATH=/usr/bin:/bin bind --check

# Detection, with the layouts in the disposable home.
system_pi=(/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js(N) /usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js(N)
           /opt/homebrew/Cellar/pi-coding-agent/*/bin/pi(N) /usr/local/Cellar/pi-coding-agent/*/bin/pi(N)
           /opt/homebrew/bin/omp(N) /usr/local/bin/omp(N) /opt/homebrew/Cellar/omp/*/bin/omp(N) /usr/local/Cellar/omp/*/bin/omp(N))
if (( $#system_pi )); then
  print -r -- "skip detection: this Mac has a Pi or OMP install that detection proposes first: $system_pi"
else
  runs 'detect names agent-guard bind when nothing is found' 2 'agent-guard bind --pi "$(command -v pi)"' bind --detect --yes
  [[ $out != *'npm run'* ]] && pass 'no message names npm run' || fail 'no message names npm run'
  cli="$home/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
  /bin/mkdir -p "${cli:h}"
  print -r -- '#!/usr/bin/env node' > "$cli"
  /bin/chmod 755 "$cli"
  runtime "$home/.bun/bin/omp" ':'
  runs 'detect records the npm layout, OMP and the Node for a Node script' 0 "recorded in $conf" bind --detect --yes
  [[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$cli"$'\n'"omp=$home/.bun/bin/omp"$'\n'"node=$want_node" ]] &&
    pass "pi=, omp= and node=$want_node" || { fail "pi=, omp= and node=$want_node"; /bin/cat "$conf" }
  /bin/rm -rf "$home/.npm-global" "$home/.bun"
fi
runs 're-records the fakes; node= goes with a native target' 0 "recorded in $conf" bind --pi "$fake_pi" --omp "$fake_omp" --yes
[[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$fake_pi"$'\n'"omp=$fake_omp" ]] && pass 'the record holds pi= and omp= only' || fail 'the record holds pi= and omp= only'

# OMP alone binds and checks without a Pi binding. A recorded value that no longer
# validates is not kept, so it cannot block re-recording.
/bin/rm "$conf"
runs 'records OMP alone' 0 "recorded in $conf" bind --omp "$fake_omp" --yes
[[ $(/usr/bin/grep -v '^#' "$conf") == "omp=$fake_omp" ]] && pass 'the record holds omp= only' || fail 'the record holds omp= only'
runs 'check passes with OMP alone' 0 "omp: $fake_omp" bind --check
print -r -- "pi=$fake_pi"$'\n'"omp=$home/opt/gone/omp" > "$conf"
runs 'a stale omp does not block recording Pi' 0 'the recorded omp is no longer usable' bind --pi "$fake_pi" --yes
[[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$fake_pi" ]] && pass 'the stale omp is dropped' || fail 'the stale omp is dropped'
node_pi="$home/opt/nodepi/cli.js"
/bin/mkdir -p "${node_pi:h}"
print -r -- '#!/usr/bin/env node' > "$node_pi"
/bin/chmod 755 "$node_pi"
print -r -- "pi=$fake_pi"$'\n'"node=$home/opt/gone/node" > "$conf"
runs 'a stale node is replaced' 0 'the recorded node is no longer usable' bind --pi "$node_pi" --yes
[[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$node_pi"$'\n'"node=$want_node" ]] && pass 'the node is detected again' || fail 'the node is detected again'
runs 'restores both bindings' 0 "recorded in $conf" bind --pi "$fake_pi" --omp "$fake_omp" --yes

# --checker-node is accepted and ignored, with one line, and records nothing.
runs 'checker-node is ignored' 0 '--checker-node is ignored' bind --checker-node "$run/nodebin/node" --yes
[[ ! -e $ext/.guard-node ]] && pass 'nothing is recorded' || fail 'nothing is recorded'
runs 'checker-node without a path is ignored' 0 '--checker-node is ignored' bind --checker-node
runs 'checker-node beside another mode is ignored' 0 "recorded in $conf" bind --pi "$fake_pi" --omp "$fake_omp" --checker-node --yes
[[ ! -e $ext/.guard-node && $(/usr/bin/grep -v '^#' "$conf") == "pi=$fake_pi"$'\n'"omp=$fake_omp" ]] && pass 'only the bindings are recorded' || fail 'only the bindings are recorded'

# --- wrapper
label=wrapper
w="$run/wrappers"
/bin/mkdir -p "$w"/{bad,dir,dupA,dupB,dupC,reserved,case,case2}
wrapper() {  # PATH ARGS...: a wrapper that passes ARGS to the pi next to it
  local f=$1
  shift
  print -r -- '#!/bin/zsh -f
set -euo pipefail
PI_SHIM="${0:A:h}/pi"
exec "$PI_SHIM" '"$*"' "$@"' > "$f"
  /bin/chmod 755 "$f"
}
wrapper "$w/good" --model local
wrapper "$w/good2" --model other
wrapper "$w/dir/w1" --model w1
print -r -- '# docs' > "$w/dir/README.md"
/bin/cp "$w/dir/w1" "$w/dir/w1.bak.1"
wrapper "$w/dupA/dup"
wrapper "$w/dupB/dup"
wrapper "$w/dupC/DUP"
for f in pi omp opencode opencode-gui agent-guard pi-sandbox.sb pi-sandbox-preamble.zsh; do wrapper "$w/reserved/$f"; done
wrapper "$w/case/PI"
wrapper "$w/case/PI-SANDBOX.SB"
wrapper "$w/case2/GOOD"
wrapper "$w/linked"
wrapper "$w/folder"
wrapper "$w/bad/bad@name"
print -r -- '#!/bin/sh
exec "${0%/*}/pi" "$@"' > "$w/bad/shebang"
print -r -- '#!/bin/zsh -f
/opt/homebrew/bin/pi "$@"' > "$w/bad/direct"
print -r -- '#!/bin/zsh -f
/bin/sh -c "echo hi"
PI_SHIM="${0:A:h}/pi"
exec "$PI_SHIM" "$@"' > "$w/bad/helper"
print -r -- '#!/bin/zsh -f
PI_SHIM="${0:A:h}/pi"
print "no handoff"' > "$w/bad/nohandoff"
/bin/ln -s "$w/good" "$w/bad/link"
/usr/bin/mkfifo "$w/bad/fifo"
wline() { printf '%-24s %-10s %s' "$@" }
wstate() { listing "$lb"; [[ -f $wrec ]] && /bin/cat "$wrec"; listing "$engine/state" }

runs 'list without a record' 0 'no custom wrappers recorded' wrapper list
runs 'usage without a subcommand' 2 'usage: agent-guard wrapper' wrapper
runs 'list takes no names' 2 'usage: agent-guard wrapper' wrapper list good
before=$(wstate)
refused() {  # NAME TEXT ARGS...: wrapper add refuses with TEXT and changes nothing
  local name=$1 text=$2
  shift 2
  runs "$name" 1 "$text" wrapper add "$@"
  [[ $(wstate) == "$before" ]] && pass "$name: nothing changed" || fail "$name: nothing changed"
}
refused 'refuses a symlink' "refusing symlink (install real files only): $w/bad/link" "$w/bad/link"
refused 'refuses a file that is not regular' "not a regular file: $w/bad/fifo" "$w/bad/fifo"
refused 'refuses a missing file' "no such file or folder: $w/nope" "$w/nope"
refused 'refuses a name outside [A-Za-z0-9._-]' "wrapper name must match [A-Za-z0-9._-]: $w/bad/bad@name" "$w/bad/bad@name"
for f in "$w"/reserved/*; do refused "refuses the reserved name ${f:t}" "'${f:t}' is reserved" "$f"; done
for f in "$w"/case/*; do refused "refuses ${f:t}: reserved names are compared ignoring case" "'${f:t}' is reserved, ignoring case" "$f"; done
refused 'refuses a duplicate name' "duplicate wrapper name 'dup', ignoring case: $w/dupB/dup" "$w/dupA" "$w/dupB"
refused 'refuses names that differ only in case' "duplicate wrapper name 'DUP', ignoring case: $w/dupC/DUP" "$w/dupA" "$w/dupC"
# A destination that is a link to a folder, or a folder: mv would move the new file
# into the folder.
/bin/mkdir "$run/link-target" "$lb/folder"
/bin/ln -s "$run/link-target" "$lb/linked"
before=$(wstate)
refused 'refuses a destination that is a link' "$lb/linked is a symbolic link; remove it, or choose another name" "$w/linked"
refused 'refuses a destination that is a folder' "$lb/folder is not a regular file; remove it, or choose another name" "$w/folder"
[[ -z $(print -l "$run/link-target"/*(DN) "$lb/folder"/*(DN)) ]] && pass 'nothing is written through the link or into the folder' ||
  fail 'nothing is written through the link or into the folder'
/bin/rm "$lb/linked"
/bin/rmdir "$lb/folder"
before=$(wstate)
# A startup preload that ends node before the check runs cannot pass a wrapper.
print -r -- 'process.exit(0)' > "$run/preload.cjs"
runs 'NODE_OPTIONS cannot skip the check' 1 'wrapper check failed; nothing installed' NODE_OPTIONS="--require $run/preload.cjs" wrapper add "$w/bad/nohandoff"
[[ $(wstate) == "$before" ]] && pass 'NODE_OPTIONS cannot skip the check: nothing changed' || fail 'NODE_OPTIONS cannot skip the check: nothing changed'
refused 'refuses a wrapper without /bin/zsh -f' "$w/bad/shebang does not use the trusted /bin/zsh -f interpreter" "$w/good" "$w/bad/shebang"
refused 'refuses a wrapper that runs Pi directly' "$w/bad/direct invokes Pi directly instead of the sibling protected shim" "$w/bad/direct"
refused 'refuses an unsafe helper before the sandbox' "$w/bad/helper invokes unsafe absolute helper '/bin/sh' before the protected shim" "$w/bad/helper"
refused 'refuses a wrapper that does not hand off' "$w/bad/nohandoff does not hand off to the sibling protected pi shim" "$w/bad/nohandoff"
[[ $out == *'wrapper check failed; nothing installed'* ]] && pass 'the check failure says nothing was installed' || fail 'the check failure says nothing was installed'
write_stamp opencode
refused 'refuses when Pi is not installed' 'Pi is not installed' "$w/good"
write_stamp opencode pi

runs 'adds a wrapper' 0 "installed $lb/good" wrapper add "$w/good"
/usr/bin/cmp -s "$w/good" "$lb/good" && [[ $(mode "$lb/good") == 755 ]] && pass 'the copy matches, mode 755' || fail 'the copy matches, mode 755'
/usr/bin/jq -e --arg h "$(sha "$w/good")" '.wrappers == {good: {sha256: $h}} and .historical == []' "$wrec" >/dev/null &&
  pass 'wrappers.json records its hash' || { fail 'wrappers.json records its hash'; /bin/cat "$wrec" }
runs 'adding the same content again makes no backup' 0 "installed $lb/good" wrapper add "$w/good"
[[ $out != *'backed up'* && ! -e $engine/state/wrapper-backups ]] && pass 'no backup' || fail 'no backup'
before=$(wstate)
refused 'refuses a name that differs only in case from a recorded one' "'GOOD' differs only in case from the recorded name 'good'" "$w/case2/GOOD"
print -r -- '#!/bin/sh
echo something else' > "$lb/good2"
/bin/chmod 755 "$lb/good2"
/bin/cp "$lb/good2" "$run/old-good2"
# The record and the backup folder as links to folders.
/bin/mkdir "$run/link-target2"
/bin/mv "$wrec" "$run/wrec"
/bin/ln -s "$run/link-target2" "$wrec"
before=$(wstate)
refused 'refuses a wrapper record that is a link' "$wrec is a symbolic link; remove it first" "$w/good2"
/bin/rm "$wrec"
/bin/mv "$run/wrec" "$wrec"
/bin/ln -s "$run/link-target2" "$engine/state/wrapper-backups"
before=$(wstate)
refused 'refuses a backup folder that is a link' "$engine/state/wrapper-backups is a symbolic link; remove it first" "$w/good2"
/bin/rm "$engine/state/wrapper-backups"
[[ -z $(print -l "$run/link-target2"/*(DN)) ]] && pass 'nothing is written through either link' || fail 'nothing is written through either link'
runs 'backs up a different file it replaces' 0 "backed up $lb/good2 to $engine/state/wrapper-backups/good2." wrapper add "$w/good2"
backups=("$engine/state/wrapper-backups"/good2.*(N))
(( $#backups == 1 )) && /usr/bin/cmp -s "$backups[1]" "$run/old-good2" && /usr/bin/cmp -s "$w/good2" "$lb/good2" &&
  pass 'the backup holds the old file and the wrapper is installed' || fail 'the backup holds the old file and the wrapper is installed'
runs 'adds the files of a folder' 0 "installed $lb/w1" wrapper add "$w/dir"
[[ ! -e $lb/README.md && ! -e $lb/w1.bak.1 ]] && pass 'documents and backups in the folder are skipped' || fail 'documents and backups in the folder are skipped'
runs 'lists recorded wrappers' 0 "$(wline good recorded 'hash matches')"$'\n'"$(wline good2 recorded 'hash matches')"$'\n'"$(wline w1 recorded 'hash matches')" wrapper list
runs 'removes a wrapper' 0 "removed $lb/w1" wrapper remove w1
[[ ! -e $lb/w1 ]] && /usr/bin/jq -e '(.wrappers | has("w1") | not) and .historical == ["w1"]' "$wrec" >/dev/null &&
  pass 'w1 is gone and historical' || fail 'w1 is gone and historical'
runs 'lists a historical name' 0 "$(wline w1 historical absent)" wrapper list
/bin/cp "$w/dir/w1" "$lb/w1"
runs 'lists a historical name that is still executable' 0 "$(wline w1 historical 'still executable')" wrapper list
/bin/chmod 644 "$lb/w1"
runs 'lists a historical name that is not executable' 0 "$(wline w1 historical 'present, not executable')" wrapper list
/bin/rm -f "$lb/w1"
print -r -- '# edited' >> "$lb/good2"
runs 'lists a changed wrapper' 0 "$(wline good2 recorded 'changed since recorded')" wrapper list
before=$(wstate)
runs 'leaves a changed wrapper' 1 "$lb/good2 changed since it was recorded; left in place" wrapper remove good2
[[ $(wstate) == "$before" ]] && pass 'the changed wrapper and its record are unchanged' || fail 'the changed wrapper and its record are unchanged'
runs 'refuses a name it did not record' 1 'not a recorded wrapper: nope' wrapper remove nope
runs 'refuses a historical name' 1 'not a recorded wrapper: w1' wrapper remove w1
runs 'backs up a recorded wrapper changed in place' 0 "backed up $lb/good2 to" wrapper add "$w/good2"
backups=("$engine/state/wrapper-backups"/good2.*(N))
(( $#backups == 2 )) && pass 'a second backup' || fail "a second backup ($#backups)"
runs 're-adding a historical name records it again' 0 "installed $lb/w1" wrapper add "$w/dir/w1"
/usr/bin/jq -e '(.wrappers | has("w1")) and .historical == []' "$wrec" >/dev/null && pass 'w1 is recorded and not historical' || fail 'w1 is recorded and not historical'
/bin/rm -f "$lb/w1"
runs 'removes a wrapper that is already absent' 0 "$lb/w1 was already absent" wrapper remove w1
/usr/bin/jq -e '.historical == ["w1"]' "$wrec" >/dev/null && pass 'w1 is historical' || fail 'w1 is historical'
runs "pi-sandbox-guard's example wrapper passes the check" 0 "installed $lb/example-custom" wrapper add "$run/tree/profiles/pi/launchers/example-custom"
runs 'removes it' 0 "removed $lb/example-custom" wrapper remove example-custom
[[ -z $(print -l "$engine/state"/.wrapper-stage.*(DN)) ]] && pass 'no staging folder is left' || fail 'no staging folder is left'
[[ $(<"$engine/state/permissions.json") == '{"/x/opencode.json":{}}' ]] && pass 'the permission record is untouched' || fail 'the permission record is untouched'

# --- doctor
# doctor_fails NAME PATTERN... [-- NAME=VALUE...]: agent-guard doctor exits 1 and its
# FAIL lines are one per PATTERN; with no PATTERN it exits 0 with none.
# A PATTERN is the line after "FAIL ", or its start when it ends in "*".
doctor_fails() {
  local name=$1 p l
  local -a pats env extra missing got
  integer rc=0 hit
  shift
  while (( $# )) && [[ $1 != -- ]]; do pats+=("$1"); shift; done
  (( $# )) && shift
  env=("$@")
  out=$(ag $env doctor 2>&1 </dev/null) || rc=$?
  got=(${(M)${(f)out}:#FAIL *})
  fail_is() { if [[ $2 == *'*' ]]; then [[ $1 == "FAIL ${2%\*}"* ]]; else [[ $1 == "FAIL $2" ]]; fi }
  for p in $pats; do
    hit=0
    for l in $got; do fail_is "$l" "$p" && hit=1; done
    (( hit )) || missing+=("$p")
  done
  for l in $got; do
    hit=0
    for p in $pats; do fail_is "$l" "$p" && hit=1; done
    (( hit )) || extra+=("$l")
  done
  if (( rc == ($#pats ? 1 : 0) && $#missing == 0 && $#extra == 0 )); then pass "$name"
  else
    fail "$name (exit $rc)"
    (( $#missing )) && print -rl -- "     missing: "$^missing
    print -r -- "$out" | /usr/bin/sed 's/^/     /'
  fi
}
# json_is NAME FILTER [NAME=VALUE...]: doctor --json's object passes FILTER.
json_is() {
  local name=$1 filter=$2
  shift 2
  out=$(ag "$@" doctor --json 2>/dev/null </dev/null)
  if /usr/bin/jq -e "$filter" <<< "$out" >/dev/null 2>&1; then pass "$name"
  else fail "$name"; print -r -- "$out" | /usr/bin/sed 's/^/     /'
  fi
}
label=doctor
# doctor never changes ~/.cc-safety-net: the probe's audit log goes to its scratch folder.
cc_tree() { ( cd "$home/.cc-safety-net" && /usr/bin/find . -exec /usr/bin/stat -f '%N %Sp %z %m' {} + | /usr/bin/sort; /usr/bin/find . -type f -exec /usr/bin/shasum -a 256 {} + | /usr/bin/sort ) }
/bin/mkdir -p "$home/.cc-safety-net/logs"
print -r -- '{"existing":"entry"}' > "$home/.cc-safety-net/logs/existing.jsonl"
cc_before=$(cc_tree)
doctor_fails 'all checks pass'
[[ $(cc_tree) == "$cc_before" ]] && pass '~/.cc-safety-net, with an existing log, is unchanged by doctor' || fail '~/.cc-safety-net changed'
for l in 'ok   protected write denied' 'ok   ~/.local/bin/pi matches the release' 'ok   ~/.local/bin/omp matches the release' \
    'ok   ~/.pi/agent/extensions/pi-sandbox-guard/src/index.mjs matches the release' \
    'ok   ~/Library/Application Support/AgentGuard/bin/pi links to ~/.local/bin/pi' \
    "ok   pi resolves to the guard in a login shell ($lb/pi)" "ok   omp resolves to the guard in a login shell ($lb/omp)" \
    "ok   bindings valid: pi=$fake_pi, omp=$fake_omp" \
    'ok   wrapper ~/.local/bin/good matches its recorded hash' "ok   good resolves to ~/.local/bin/good in a login shell ($lb/good)" \
    'ok   profile self-test of ~/.local/bin/pi-sandbox.sb' \
    "ok   the checker's session copy is built from ~/.cc-safety-net" 'ok   the installed extension allows ls -la' \
    'ok   the installed extension blocks rm -rf /' "ok   the installed extension blocks git config core.hooksPath by Agent Guard's Git rules" \
    'ok   pi --version through ~/.local/bin/pi: fake pi 1.0.0' 'ok   omp --version through ~/.local/bin/omp: fake omp 2.0.0'; do
  outl=(${(f)out})
  (( ${outl[(Ie)$l]} )) && pass "prints: $l" || fail "prints: $l"
done
[[ -z $(print -l "$darwin_temp"/agent-guard-doctor.*(DN)) ]] && pass 'the scratch folder is removed' || fail 'the scratch folder is removed'
[[ -z $(print -l "$engine/state/pi"/doctor.*(DN)) ]] && pass 'the checker session folder is removed' || fail 'the checker session folder is removed'
json_is '--json: status.sh fields and every check' "
  .guard_present == 1 and .launchers_present == 1 and .release_match == \"match\"
  and .guard_release_id == \"$rid\" and .launchers_release_id == \"$rid\"
  and .runtime_binding == \"ok\" and .pi_binding == \"ok\"
  and .pi_binding_path == \"$fake_pi\" and .omp_binding_path == \"$fake_omp\" and .drift == 0 and .ok == true
  and ([.checks[] | select(.harness == \"pi\")] | length) > 20
  and any(.checks[]; . == {harness: \"opencode\", result: \"ok\", check: \"protected write denied\"})
  and any(.checks[]; . == {harness: \"pi\", result: \"ok\", check: \"the installed extension allows ls -la\"})
  and ([.checks[].result] - [\"ok\", \"skip\", \"warn\"]) == []"
[[ $(/usr/bin/jq -r 'keys_unsorted[0:10] | join(",")' <<< "$out") == guard_present,launchers_present,release_match,guard_release_id,launchers_release_id,runtime_binding,pi_binding,pi_binding_path,omp_binding_path,drift ]] &&
  pass "--json keeps status.sh's field order" || fail "--json keeps status.sh's field order"

print -r -- '# changed' >> "$lb/omp"
doctor_fails 'a launcher copy that differs' "~/.local/bin/omp differs from the release's profiles/pi/launchers/pi"
json_is '--json: a differing file is drift' '.drift == 1 and .ok == false and .runtime_binding == "ok"'
/bin/cp "$rel/profiles/pi/launchers/pi" "$lb/omp"
/bin/rm "$rel/bin/pi"
/bin/ln -s "$rel/profiles/pi/launchers/pi" "$rel/bin/pi"
doctor_fails "a bin/pi that does not link to ~/.local/bin/pi" '~/Library/Application Support/AgentGuard/bin/pi does not link to ~/.local/bin/pi'
/bin/rm "$rel/bin/pi"
/bin/ln -s "$lb/pi" "$rel/bin/pi"
runtime "$home/shadow/pi" 'print real'
print -r -- 'export PATH="$HOME/shadow:$HOME/.local/bin:$PATH"' > "$home/.zprofile"
doctor_fails 'an entry point that resolves elsewhere' "pi resolves to $home/shadow/pi in a login shell, not to the guard*"
# Startup files from another folder cannot hide it.
/bin/mkdir -p "$run/zdot"
print -r -- 'export PATH="$HOME/.local/bin:$PATH"' > "$run/zdot/.zprofile"
doctor_fails 'ZDOTDIR cannot hide an entry point that resolves elsewhere' "pi resolves to $home/shadow/pi in a login shell, not to the guard*" -- \
  ZDOTDIR="$run/zdot"
print -r -- 'export PATH="$HOME/.local/bin:$PATH"' > "$home/.zprofile"
runtime "$home/shadow2/good" 'print real'
print -r -- 'export PATH="$HOME/shadow2:$HOME/.local/bin:$PATH"' > "$home/.zprofile"
doctor_fails 'a wrapper that resolves elsewhere' "good resolves to $home/shadow2/good in a login shell, not to ~/.local/bin/good*"
print -r -- 'export PATH="$HOME/.local/bin:$PATH"' > "$home/.zprofile"
/bin/chmod 644 "$lb/good"
doctor_fails 'a wrapper that is not executable' 'wrapper ~/.local/bin/good is not executable' 'good is not on PATH in a login shell'
json_is '--json: a wrapper that is not executable is drift' '.drift == 1'
/bin/chmod 755 "$lb/good"

/bin/mv "$home/opt/omp" "$home/opt/omp.off"
doctor_fails 'a stale binding' "bindings stale: omp does not exist: $fake_omp; re-record with agent-guard bind" \
  "omp --version: recorded OMP binding is no longer usable: '$fake_omp'; re-record it with agent-guard bind"
json_is '--json: a stale binding is not drift' '.runtime_binding == "stale" and .pi_binding == "stale" and .drift == 0 and .ok == false'
# A startup file bash reads before bind --check cannot point it at a valid record.
/bin/mkdir -p "$run/valid-conf"
print -r -- "pi=$fake_pi" > "$run/valid-conf/executables.conf"
print -r -- "export PI_SANDBOX_CONFIG_DIR=${(qq)run}/valid-conf" > "$run/bash-env"
doctor_fails 'BASH_ENV cannot make a stale binding pass' "bindings stale: omp does not exist: $fake_omp; re-record with agent-guard bind" \
  "omp --version: recorded OMP binding is no longer usable: '$fake_omp'; re-record it with agent-guard bind" -- BASH_ENV="$run/bash-env"
/bin/mv "$home/opt/omp.off" "$home/opt/omp"
/usr/bin/sed -i '' '/^omp=/d' "$conf"
if [[ -e /opt/homebrew/bin/omp || -e /usr/local/bin/omp ]]; then
  print -r -- 'skip: an OMP CLI on the launcher PATH is found without a binding'
else
  doctor_fails 'a runtime with no binding and no CLI is skipped'
  [[ $out == *'skip omp --version: no OMP binding and no OMP CLI found'* ]] && pass 'the skip names OMP' || fail 'the skip names OMP'
  json_is '--json: no omp binding' '.omp_binding_path == "" and .runtime_binding == "ok" and .ok == true'
fi
/bin/mv "$conf" "$run/conf"
if [[ -e /opt/homebrew/bin/pi || -e /usr/local/bin/pi || -e /opt/homebrew/bin/omp || -e /usr/local/bin/omp ]]; then
  print -r -- 'skip: a Pi or OMP CLI on the launcher PATH is found without a binding'
else
  doctor_fails 'no bindings at all'
  [[ $out == *'skip bindings: no Pi binding recorded in ~/.config/pi-sandbox-guard/executables.conf'* &&
     $out == *'skip pi --version: no Pi binding and no Pi CLI found'* ]] && pass 'both runtimes are skipped and named' || fail 'both runtimes are skipped and named'
  json_is '--json: unbound' '.runtime_binding == "unbound" and .pi_binding == "unbound" and .pi_binding_path == "" and .drift == 0'
fi
/bin/mv "$run/conf" "$conf"
runs 'restores the omp binding' 0 recorded bind --pi "$fake_pi" --omp "$fake_omp" --yes
# OMP alone is a valid binding.
if [[ -e /opt/homebrew/bin/pi || -e /usr/local/bin/pi ]]; then
  print -r -- 'skip: a Pi CLI on the launcher PATH is found without a binding'
else
  /usr/bin/sed -i '' '/^pi=/d' "$conf"
  doctor_fails 'OMP alone'
  [[ $out == *"ok   bindings valid: omp=$fake_omp"* ]] && pass 'the OMP binding is checked' || fail 'the OMP binding is checked'
  json_is '--json: OMP alone' ".runtime_binding == \"ok\" and .pi_binding_path == \"\" and .omp_binding_path == \"$fake_omp\""
  runs 'restores the pi binding' 0 recorded bind --pi "$fake_pi" --omp "$fake_omp" --yes
fi

# The checker: the session copy and the installed extension's verdicts.
/bin/cp "$home/.cc-safety-net/rules/rule.json" "$run/rule.json"
print -r -- 'not json' > "$home/.cc-safety-net/rules/rule.json"
doctor_fails 'a checker configuration that cannot be copied' "the checker's session copy cannot be built*"
[[ -z $(print -l "$engine/state/pi"/doctor.*(DN)) ]] && pass 'its session folder is removed' || fail 'its session folder is left'
/bin/cp "$run/rule.json" "$home/.cc-safety-net/rules/rule.json"
/bin/mv "$rel/vendor" "$run/vendor"
doctor_fails 'a release without cc-safety-net' 'the installed extension blocks ls -la: [pi-sandbox-guard] Guard unavailable: cc-safety-net failed to load*'
/bin/mv "$run/vendor" "$rel/vendor"
/bin/cp "$rel/checker/agent-guard-git/rulebook.json" "$run/rulebook.json"
/usr/bin/jq '.rules = []' "$run/rulebook.json" > "$rel/checker/agent-guard-git/rulebook.json"
doctor_fails "a release without Agent Guard's Git rules" 'the installed extension blocks ls -la: [pi-sandbox-guard] Guard unavailable: cc-safety-net did not load Agent Guard*'
/bin/cp "$run/rulebook.json" "$rel/checker/agent-guard-git/rulebook.json"
doctor_fails 'the checker passes again'

print -r -- '# edited' >> "$lb/good"
/bin/rm "$lb/good2"
/bin/cp "$w/dir/w1" "$lb/w1"
doctor_fails 'wrappers: changed, missing, historical still executable' 'wrapper ~/.local/bin/good changed since it was recorded' \
  'wrapper ~/.local/bin/good2 is missing' '~/.local/bin/w1 was removed as a wrapper but is still executable'
json_is '--json: wrapper problems are drift' '.drift == 1'
/bin/rm "$lb/w1"
runs 'restores the wrappers' 0 installed wrapper add "$w/good" "$w/good2"
print -r -- '{"wrappers": []}' > "$run/bad.json"
/bin/cp "$wrec" "$run/wrappers.json"
/bin/cp "$run/bad.json" "$wrec"
doctor_fails 'an unreadable wrapper record' 'cannot read ~/Library/Application Support/AgentGuard/state/wrappers.json'
runs 'wrapper list refuses it too' 1 "cannot read $wrec" wrapper list
/bin/cp "$run/wrappers.json" "$wrec"

# OMP refuses a relocated PI_CODING_AGENT_DIR.
doctor_fails 'relocation variables' 'PI_CODING_AGENT_DIR is set*' 'PI_PACKAGE_DIR is set*' \
  'omp --version through ~/.local/bin/omp exited 1: protected OMP does not support relocating PI_CODING_AGENT_DIR.' -- \
  PI_CODING_AGENT_DIR="$home/.pi/agent-work" PI_PACKAGE_DIR="$run/pkg"
json_is '--json: relocation is drift' '.drift == 1' PI_PACKAGE_DIR="$run/pkg"

/bin/cp "$lb/pi-sandbox.sb" "$run/profile"
print -r -- '(allow file-write* (subpath (param "HOME")))' >> "$lb/pi-sandbox.sb"
doctor_fails 'a profile that fails the self-test' "~/.local/bin/pi-sandbox.sb differs from the release's profiles/pi/sandbox/pi-sandbox.sb" \
  'profile self-test of ~/.local/bin/pi-sandbox.sb: SECURITY: *'
/bin/mv "$run/profile" "$lb/pi-sandbox.sb"

/bin/mv "$ext/src/index.mjs" "$run/index.mjs"
doctor_fails 'an extension without its entry file' '~/.pi/agent/extensions/pi-sandbox-guard/src/index.mjs is missing' \
  'the installed extension did not run*'
/bin/mv "$run/index.mjs" "$ext/src/index.mjs"

runtime "$fake_pi" 'print -ru2 -- boom; exit 3'
runtime "$fake_omp" '/bin/sleep 90'
doctor_fails 'a runtime that fails and one that hangs' 'pi --version through ~/.local/bin/pi exited 3: boom' \
  'omp --version through ~/.local/bin/omp did not finish within 20 seconds'
runtime "$fake_pi" 'print -r -- "fake pi 1.0.0"'
runtime "$fake_omp" 'print -r -- "fake omp 2.0.0"'

doctor_fails 'all checks pass again'
write_stamp opencode
doctor_fails 'without Pi in the stamp, no Pi checks'
[[ $out != *'~/.local/bin/pi'* ]] && pass 'no Pi lines' || fail 'no Pi lines'
json_is '--json without Pi: OpenCode checks only' '(has("runtime_binding") | not) and .ok == true and all(.checks[]; .harness == "opencode")'
/bin/rm "$stamp"
doctor_fails 'without a stamp, no Pi checks'
[[ $out != *'~/.local/bin/pi'* ]] && pass 'no Pi lines' || fail 'no Pi lines'
write_stamp opencode pi
runs 'doctor takes only --json' 2 'usage: agent-guard' doctor --bogus

finish

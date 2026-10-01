#!/bin/zsh
# Migration cases from design section 9.5 (step 5): M1-M14, the refusal inside
# OpenCode Guard's guard and the static check that the old uninstaller is never
# called. The profile difference is test/golden.mjs. Each case starts from a real
# install of OpenCode Guard v1.0.4, v1.0.3, v1.0.1 or v1.0.0 made by the tag's own
# install.sh (test/fixtures/installs) with HOME set to a disposable home, or from
# v1.0.0 upgraded in place by v1.0.4's install.sh, then migrates it with
# test releases served by test/release-server.mjs, the fake CLI
# (test/fake-opencode.mjs) and a fake OpenCode.app. The list import is answered on
# a terminal made by /usr/bin/expect (test/tty.exp). Cases test/install.sh covers
# for Agent Guard alone are not repeated. Runs outside any sandbox, from a
# checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
unset AGENT_GUARD_RELEASE AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED
command -v node >/dev/null || { print -ru2 'Node is required for the release server and the fake CLI'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
fixtures="$source_root/test/fixtures/installs"
integer fails=0 checks=0
label=
pass() { checks+=1; print -r -- "ok   ${label:+$label: }$*" }
fail() { checks+=1; fails+=1; print -r -- "FAIL ${label:+$label: }$*" }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-migrate-XXXXXX")
run=${run:A}
served="$run/served"
/bin/mkdir -p "$served"
node "$source_root/test/release-server.mjs" "$served" > "$run/port" 2> "$run/server.log" &
server=$!
for i in {1..100}; do [[ -s $run/port ]] && break; sleep 0.05; done
port=$(<"$run/port")
[[ $port == <-> ]] || { print -ru2 "release server did not start: $(<"$run/server.log")"; kill $server; exit 1 }
url="http://127.0.0.1:$port/ebrindley/AgentGuard"
typeset -a exercised
finish() {
  local p
  local -a missing
  # Every migration test point (test/lib.zsh) was exercised here.
  label=coverage
  for p in $migrate_points; do (( ${exercised[(Ie)$p]} )) || missing+=("$p"); done
  (( $#missing == 0 )) && pass "all $#migrate_points migration test points are exercised" || fail "migration test points not exercised: $missing"
  kill $server 2>/dev/null
  wait $server 2>/dev/null
  /bin/chmod -R u+w "$run" 2>/dev/null
  /bin/rm -rf "$run"
  print -r -- "$checks checks, $fails failure(s)"
  (( fails == 0 ))
  exit
}

new_home "$run/home"
home=$REPLY
engine="$home/Library/Application Support/AgentGuard"
state="$engine/state"
ocg="$home/Library/Application Support/OpenCodeGuard"
plugins="$home/.config/opencode/plugins"
plugin="$plugins/agent-guard.js"
old_plugin="$plugins/opencode-guard.js"
cc="$home/.cc-safety-net/rules"
app="$home/Applications/Agent Guard.app"
old_app="$home/Applications/OpenCode Guard.app"
cfg="$home/.config/opencode/opencode.json"
cfg2="$home/.config/opencode/config.json"
list="$home/Agent Guard/Guard List.txt"
old_list="$home/OpenCode Guard/Guard List.txt"
out="$run/out"

# The fake CLI first on PATH, as in test/install.sh.
node_bin=${$(command -v node):A}
fake="$source_root/test/fake-opencode.mjs"
fakebin="$run/fakebin"
/bin/mkdir -p "$fakebin"
print -r -- "#!/bin/sh
exec '$node_bin' '$fake' \"\$@\"" > "$fakebin/opencode"
/bin/chmod 755 "$fakebin/opencode"
system_path=/usr/bin:/bin:/usr/sbin:/sbin
base="$fakebin:$system_path"
old_path="$ocg/bin:$base"

# Releases: A (v0.0.1) from this checkout, and A whose profile lets the guard write
# the engine's state folder (design A14), which fails the staged check.
build() { node "$adapter" release "$1" "$served" "$home" "v$2" "$2" "$url" >/dev/null }
build "$source_root" 0.0.1 || { print -ru2 'cannot build v0.0.1'; finish }
/bin/mkdir -p "$run/src-broken"
/bin/cp -R "$source_root"/{engine,profiles,scripts,install.sh,LICENSE} "$run/src-broken/"
/usr/bin/sed -i '' '/^  (subpath (h "\/Library\/Application Support\/AgentGuard"))$/d' "$run/src-broken/engine/profile.sb"
/usr/bin/sed -i '' 's|^writable=(|writable=("$engine/state" |' "$run/src-broken/profiles/opencode/harness.zsh"
build "$run/src-broken" 0.0.3-broken || { print -ru2 'cannot build v0.0.3-broken'; finish }
print -r -- v0.0.1 > "$served/latest.txt"

point= pgrep_status= boot_at=
# note_point: records the test points named in $point as exercised.
note_point() { local p; for p in ${=point}; do exercised+=("${p#*:}"); done }
# envv: the environment of a run, from point, pgrep_status and boot_at.
envv() {
  reply=(/usr/bin/env -i HOME="$home" PATH="${tpath:-$base}" AG_TEST_POINT="$point")
  [[ -n $pgrep_status ]] && reply+=(AG_TEST_PGREP="$pgrep_status")
  [[ -n $boot_at ]] && reply+=(AG_TEST_BOOT_TIME="$boot_at")
  return 0
}
# boot ANSWER [ARGS...]: the one-liner for v0.0.1 run from a terminal, with ANSWER
# typed ahead ("" types nothing). BOOT_TAG chooses another release.
boot() {
  local answer=$1 text
  shift
  text=$(/usr/bin/curl -fsSL "$url/releases/download/${BOOT_TAG:-v0.0.1}/install.sh") || return 99
  note_point
  envv
  run_timeout 240 /usr/bin/expect -f "$source_root/test/tty.exp" "$out" "$answer" $reply /bin/zsh -c "$text" install.sh --projects "$home/Projects" "$@"
}
# boot_notty [ARGS...]: the same without a terminal.
boot_notty() {
  local text
  text=$(/usr/bin/curl -fsSL "$url/releases/download/v0.0.1/install.sh") || return 99
  note_point
  envv
  run_timeout 240 $reply /bin/zsh -c "$text" install.sh --projects "$home/Projects" "$@" < /dev/null > "$out" 2>&1
}
# ag ARGS...: the installed agent-guard command.
ag() {
  note_point
  envv
  run_timeout 240 $reply "$engine/bin/agent-guard" "$@" < /dev/null > "$out" 2>&1
}
save() { /bin/rm -rf "$run/saved-$1"; /bin/cp -Rp "$home" "$run/saved-$1" }
restore() { /bin/chmod -R u+w "$home" 2>/dev/null; /bin/rm -rf "$home"; /bin/cp -Rp "$run/saved-$1" "$home" }
sha() { /usr/bin/shasum -a 256 < "$1" 2>/dev/null }
show() { print -r -- "$(<"$out")" | /usr/bin/sed 's/^/    | /' }
same_snapshot() {  # NAME FILE: the home's snapshot equals the one in FILE
  local now
  now=$(snapshot "$home")
  if [[ $now == "$(<$2)" ]]; then pass "$1"
  else fail "$1"; /usr/bin/diff <(print -r -- "$(<$2)") <(print -r -- "$now") | /usr/bin/sed 's/^/    /'
  fi
}
# ocg_files: path and hash (or link target) of every OpenCode Guard file, startup
# file and config, for the byte-identical cases.
ocg_files() {
  local f
  for f in "$ocg"/**/*(DN) "$old_plugin"(N) "$old_app"/**/*(DN) "$cc"/opencode-guard/**/*(DN) "$cc/rule.json"(N) \
           "$home"/{.zprofile,.zshrc,.bash_profile}(N) "$home/dotfiles/zshrc"(N) "$cfg"(N) "$cfg2"(N) "$home/OpenCode Guard"/*(DN); do
    if [[ -L $f ]]; then print -r -- "$f -> $(/usr/bin/readlink "$f")"
    elif [[ -f $f ]]; then print -r -- "$f $(sha "$f")"
    else print -r -- "$f/"; fi
  done
}
same_ocg() {  # NAME FILE
  local now
  now=$(ocg_files)
  if [[ $now == "$(<$2)" ]]; then pass "$1"
  else fail "$1"; /usr/bin/diff <(print -r -- "$(<$2)") <(print -r -- "$now") | /usr/bin/sed 's/^/    /' | /usr/bin/head -20
  fi
}
guard_plugins() { reply=("$plugins"/(agent-guard|opencode-guard).js(N)); reply=(${reply:t}) }
# old_guarded NAME: a new terminal runs opencode under OpenCode Guard's launcher.
old_guarded() {
  /bin/rm -f "$home/Documents/escaped" "$home/Projects/app/launched" "$home/OpenCode Guard/last-launch.log"
  run_timeout 20 /usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh -l -i -c opencode >/dev/null 2>&1
  [[ -e $home/Projects/app/launched && ! -e $home/Documents/escaped && $(/usr/bin/head -1 "$home/OpenCode Guard/last-launch.log" 2>/dev/null) == 'OpenCode Guard cli '* ]] &&
    pass "$1: E1 runs opencode guarded by OpenCode Guard" || fail "$1: E1 runs opencode guarded by OpenCode Guard"
}
old_check() {  # NAME: OpenCode Guard's own launch check passes
  run_timeout 60 /usr/bin/env -i HOME="$home" PATH="$base" "$ocg/launch" check > "$run/check.out" 2>&1 &&
    pass "$1: OpenCode Guard's launch check passes" || { fail "$1: OpenCode Guard's launch check passes"; /usr/bin/sed 's/^/    | /' "$run/check.out" }
}

# --- The disposable home before OpenCode Guard: a .zprofile that puts the fake CLI
# first, a symlinked .zshrc with mode 600, two OpenCode configs, a rule.json with
# another rule, the fake app.
/bin/mkdir -p "$home/dotfiles" "$cc"
print -r -- "path=(\"$fakebin\" \$path)" > "$home/.zprofile"
print -r -- 'export EDITOR=vi' > "$home/dotfiles/zshrc"
/bin/chmod 600 "$home/dotfiles/zshrc"
/bin/ln -s "$home/dotfiles/zshrc" "$home/.zshrc"
pre_cfg='{"model":"m","permission":{"bash":{"ls *":"allow","*":"ask"},"task":"ask"}}'
pre_cfg2='{"theme":"x"}'
print -r -- "$pre_cfg" > "$cfg"
print -r -- "$pre_cfg2" > "$cfg2"
print -r -- '{"version":1,"rules":["custom"],"overrides":{"custom":{"x":1}},"transparent_wrappers":["env"]}' > "$cc/rule.json"
fake_app="$home/Applications/OpenCode.app"
/bin/mkdir -p "$fake_app/Contents/MacOS"
print -r -- '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>FakeOpenCodeApp</string></dict></plist>' > "$fake_app/Contents/Info.plist"
/bin/cp "$fakebin/opencode" "$fake_app/Contents/MacOS/FakeOpenCodeApp"
save clean

# The OpenCode Guard releases with a fixture, newest first. v1.0.2 needs none: its
# install.sh and every file it installs equal v1.0.3's, apart from the list template,
# which equals v1.0.1's.
versions=(1.0.4 1.0.3 1.0.1 1.0.0)
# ocg_install VERSION: OpenCode Guard VERSION installed by its own installer.
# user_edits: the user edits a config: bash changed and edit removed in
# opencode.json, a key added to config.json.
ocg_install() {
  run_timeout 120 /usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh "$fixtures/opencode-guard-$1/install.sh" --projects "$home/Projects" < /dev/null > "$out" 2>&1
}
user_edits() {
  /usr/bin/jq -c '.permission.bash = "ask" | del(.permission.edit)' "$cfg" > "$cfg.new" && /bin/mv "$cfg.new" "$cfg"
  /usr/bin/jq -c '.permission.webfetch = "deny"' "$cfg2" > "$cfg2.new" && /bin/mv "$cfg2.new" "$cfg2"
}
for v in $versions; do
  label="setup $v"
  restore clean
  ocg_install $v || { fail "OpenCode Guard $v's install.sh (exit $?)"; show; finish }
  user_edits
  [[ -x $ocg/launch && -f $ocg/state/permissions.json && -f $old_plugin && -d $old_app && -d $cc/opencode-guard ]] &&
    /usr/bin/grep -qFx '# >>> opencode-guard >>>' "$home/.zprofile" && pass "OpenCode Guard $v installed by its own installer" ||
    { fail "OpenCode Guard $v installed by its own installer"; show; finish }
  /bin/cp "$ocg/state/permissions.json" "$run/record-$v"
  /bin/cp "$old_list" "$run/list-$v"
  save "ocg-$v"
  ocg_files > "$run/ocg-$v.files"
  snapshot "$home" > "$run/ocg-$v.snapshot"
  # What OpenCode Guard's own uninstaller leaves in the configs (M9).
  run_timeout 60 /usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh "$fixtures/opencode-guard-$v/uninstall.sh" < /dev/null > "$out" 2>&1 ||
    { fail "OpenCode Guard $v's uninstall.sh (exit $?)"; show }
  /usr/bin/jq -S . "$cfg" > "$run/twin-$v.cfg"
  /usr/bin/jq -S . "$cfg2" > "$run/twin-$v.cfg2"
done

# --- M1: a real install of each version migrates, and afterwards every entry point
# is guarded or refuses. M7 rides on v1.0.3 (a backup left by an earlier failed
# uninstall); a sampler lists the plugin folder every 10 ms during each run (I1).
for v in $versions; do
  label="M1 $v"
  restore "ocg-$v"
  if [[ $v == 1.0.3 ]]; then
    print -r -- '{"/nowhere/opencode.json":{"edit":{"orig":"ask","wrote":"allow"}}}' > "$home/OpenCode Guard/permissions-backup.json"
  fi
  point=
  boot y &
  bpid=$!
  integer both=0 samples=0
  while kill -0 $bpid 2>/dev/null; do
    guard_plugins
    (( $#reply == 2 )) && both=1
    samples+=1
    sleep 0.01
  done
  wait $bpid
  rc=$?
  (( rc == 0 )) && pass 'migrated (exit 0)' || { fail "migration (exit $rc)"; show; continue }
  (( both == 0 && samples > 20 )) && pass "I1: the plugin folder never held both plugins ($samples samples)" || fail "I1: both plugins seen ($samples samples)"
  guard_plugins
  [[ $reply == agent-guard.js ]] && [[ $(/usr/bin/readlink "$plugin") == "$engine/current/profiles/opencode/plugin.js" ]] &&
    pass "agent-guard.js, Agent Guard's link, is the only guard plugin" || fail "guard plugins: $reply"
  [[ $(/usr/bin/readlink "$ocg/bin/opencode") == "$engine/bin/opencode" && $(/usr/bin/readlink "$ocg/bin/opencode-gui") == "$engine/bin/opencode-gui" ]] &&
    pass 'forwarders at both old command paths link to Agent Guard' || fail 'forwarders at both old command paths'
  ! /usr/bin/grep -qF 'opencode-guard' "$home/.zprofile" "$home/dotfiles/zshrc" &&
    [[ $(/usr/bin/grep -cFx '# >>> agent-guard >>>' "$home/.zprofile") == 1 && $(/usr/bin/grep -cFx '# >>> agent-guard >>>' "$home/dotfiles/zshrc") == 1 ]] &&
    [[ -L $home/.zshrc ]] && pass "only Agent Guard's PATH blocks; .zshrc is still a link" || fail "only Agent Guard's PATH blocks"
  [[ $(/usr/bin/plutil -extract CFBundleIdentifier raw "$app/Contents/Info.plist" 2>/dev/null) == io.github.ebrindley.agentguard && ! -e $old_app ]] &&
    pass "Agent Guard.app with bundle ID io.github.ebrindley.agentguard; no OpenCode Guard.app" || fail 'apps'
  /usr/bin/cmp -s "$state/opencode-guard-permissions.json" "$run/record-$v" &&
    /usr/bin/jq -e --slurpfile o "$run/record-$v" '. == $o[0]' "$state/permissions.json" >/dev/null &&
    pass "OpenCode Guard's record imported, and its unchanged copy kept" || fail 'imported record'
  /usr/bin/jq -e '.from == "opencode-guard" and (.switched_at | type) == "number" and .retired == true' "$state/migration.json" >/dev/null &&
    pass 'switch time recorded; retirement finished' || fail 'migration.json'
  /usr/bin/cmp -s "$list" "$old_list" && pass 'A9 the imported list equals the old list byte for byte' || fail 'A9 imported list'
  /usr/bin/grep -q 'Import this list? \[y/N\]' "$out" && /usr/bin/grep -q 'is no longer read' "$out" &&
    pass 'the list import was shown and confirmed' || fail 'list import prompt'
  [[ $(listing "$ocg") == $'bin\nbin/opencode -> '"$engine/bin/opencode"$'\nbin/opencode-gui -> '"$engine/bin/opencode-gui" ]] &&
    pass "retired: OpenCode Guard's engine folder holds only the forwarders" || { fail 'retired engine folder'; listing "$ocg" | /usr/bin/sed 's/^/    /' }
  [[ ! -e $cc/opencode-guard ]] && /usr/bin/jq -e '(.rules | index("opencode-guard") == null) and (.transparent_wrappers | index("env") != null)' "$cc/rule.json" >/dev/null &&
    pass "retired: rulebook and rule.json entry gone, transparent_wrappers kept" || fail 'retired rulebook'
  [[ -f "$home/OpenCode Guard/Moved to Agent Guard.txt" && -f $old_list ]] && pass '~/OpenCode Guard kept, with the note' || fail '~/OpenCode Guard note'
  [[ $(ocg_files | /usr/bin/grep -E '/\.config/opencode/(opencode|config)\.json ') == $(/usr/bin/grep -E '/\.config/opencode/(opencode|config)\.json ' "$run/ocg-$v.files") ]] &&
    pass 'M9 no permission value was written' || fail 'M9 a config changed'
  /usr/bin/grep -qF "left as is: $cfg bash was changed after OpenCode Guard's install" "$out" && /usr/bin/grep -qF "kept $cfg external_directory" "$out" &&
    pass "the import reports kept and changed keys" || { fail 'import report'; show }
  /usr/bin/grep -q 'Dock item for OpenCode Guard.app' "$out" && pass 'says to replace the Dock item' || fail 'Dock message'
  save "M1-$v"
  snapshot "$home" > "$run/M1-$v.snapshot"
  # After the save, so the saved state has none of the probe's launches.
  probe_entry_points "$home" "$base" "$old_path"
  if [[ $v == 1.0.3 ]]; then
    label="M7 $v"
    /usr/bin/grep -q 'permissions-backup.json is from an earlier OpenCode Guard uninstall' "$out" &&
      /usr/bin/jq -e 'has("/nowhere/opencode.json") | not' "$state/permissions.json" >/dev/null &&
      pass 'permissions-backup.json reported and not merged' || fail 'permissions-backup.json'
  fi
done
for v in $versions; do
  [[ -d $run/saved-M1-$v ]] || { print -ru2 'M1 failed; the other cases start from it'; finish }
done

# --- M10: a rerun after a finished migration changes nothing.
label=M10
restore M1-1.0.4
kept_files() {
  local f
  for f in "$cfg" "$cfg2" "$state/permissions.json" "$state/opencode-guard-permissions.json" "$state/migration.json"; do print -r -- "$f $(sha "$f")"; done
  listing "$ocg"
}
before=$(kept_files)
point= boot y
rc=$?
(( rc == 0 )) && pass 'rerun exits 0' || { fail "rerun (exit $rc)"; show }
[[ $(kept_files) == "$before" ]] && pass 'configs, both records, the switch time and the forwarders are byte-identical' || fail 'something changed'
! /usr/bin/grep -qE 'Import this list|Entries in the old list|migrating from OpenCode Guard|permissions: ' "$out" &&
  pass 'no list output and no second import' || { fail 'list output or a second import'; show }
same_snapshot 'the rest is as after the migration' "$run/M1-1.0.4.snapshot"

# --- M11: a terminal opened before the switch, with OpenCode Guard's bin first, and
# with both bin folders in either order.
label=M11
restore M1-1.0.4
for p name in "$ocg/bin:$base" "OpenCode Guard's bin" "$ocg/bin:$engine/bin:$base" "both, OpenCode Guard's first" \
              "$engine/bin:$ocg/bin:$base" "both, Agent Guard's first"; do
  /bin/rm -f "$home/Documents/escaped" "$home/Projects/app/launched"
  run_timeout 20 /usr/bin/env -i HOME="$home" PATH="$p" /bin/zsh -f -c opencode >/dev/null 2>&1
  rc=$?
  (( rc == 0 )) && [[ -e $home/Projects/app/launched && ! -e $home/Documents/escaped ]] &&
    [[ $(/usr/bin/head -1 "$home/Agent Guard/last-launch-opencode.log") == 'Agent Guard cli '* ]] &&
    pass "PATH with $name: opencode runs sandboxed by Agent Guard and returns" || fail "PATH with $name (exit $rc)"
done

# --- M13: the forwarders stay until a boot after the switch, then update removes
# them and OpenCode Guard's engine folder, also when the install is current.
label=M13
restore M1-1.0.4
sw=$(/usr/bin/jq -r .switched_at "$state/migration.json")
for b in $(( sw - 10 )) not-a-number; do
  point= boot_at=$b ag update
  rc=$?
  (( rc == 0 )) && /usr/bin/grep -q 'is current' "$out" && [[ -L $ocg/bin/opencode && -L $ocg/bin/opencode-gui ]] &&
    pass "boot time $b: update is current and keeps the forwarders" || { fail "boot time $b (exit $rc)"; show }
done
# One forwarder is already gone, as after a run stopped while removing them: the
# stamp must still lose both.
/bin/rm "$ocg/bin/opencode-gui"
point= boot_at=$(( sw + 10 )) ag update
rc=$?
boot_at=
(( rc == 0 )) && [[ ! -e $ocg ]] && pass "a boot after the switch: update removes the forwarders and $ocg" || { fail "boot after the switch (exit $rc)"; show }
[[ ! -e $old_plugin && ! -e $old_app && ! -e $cc/opencode-guard ]] && ! /usr/bin/grep -qF opencode-guard "$home/.zprofile" "$home/dotfiles/zshrc" "$cc/rule.json" &&
  pass 'no OpenCode Guard file is left outside ~/OpenCode Guard' || fail 'OpenCode Guard files left'
point= ag version
rc=$?
(( rc == 0 )) && pass 'agent-guard version reports no drift afterwards' || { fail "version (exit $rc)"; show }

# --- M8: a config that cannot be parsed at uninstall: the record is kept.
label=M8
restore M1-1.0.4
print -r -- '{not json' > "$cfg"
point= ag uninstall
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "$cfg" "$out" && pass "exit $rc, the config named" || { fail "uninstall (exit $rc)"; show }
/usr/bin/jq -e --arg f "$cfg" 'has($f)' "$home/Agent Guard/permissions-backup.json" >/dev/null 2>&1 &&
  /usr/bin/cmp -s "$home/Agent Guard/opencode-guard-permissions.json" "$run/record-1.0.4" &&
  pass "the record and OpenCode Guard's record are kept in ~/Agent Guard" || fail 'records kept'

# --- M1, M9, M5: uninstall after the migration, then the way back with the same
# OpenCode Guard build's installer.
restored_values() {  # the configs hold the pre-guard values and the user's edits
  /usr/bin/jq -e --argjson p "$pre_cfg" '. == ($p | .permission = {"bash": "ask", "task": "ask"})' "$cfg" >/dev/null &&
    /usr/bin/jq -e '. == {"theme": "x", "permission": {"webfetch": "deny"}}' "$cfg2" >/dev/null &&
    pass "pre-guard values back where unchanged; the user's bash, removed edit and added key kept" || fail 'restored values'
}
for v in $versions; do
  label="M1 $v uninstall"
  restore "M1-$v"
  point= ag uninstall
  rc=$?
  (( rc == 0 )) && pass 'exit 0' || { fail "uninstall (exit $rc)"; show }
  restored_values
  label="M9 $v"
  [[ $(/usr/bin/jq -S . "$cfg") == "$(<$run/twin-$v.cfg)" && $(/usr/bin/jq -S . "$cfg2") == "$(<$run/twin-$v.cfg2)" ]] &&
    pass "the configs equal what OpenCode Guard's own uninstall.sh leaves" || fail 'configs differ from the twin'
  label="M1 $v uninstall"
  [[ ! -e $ocg && ! -e $engine && ! -e $plugin && ! -L $plugin && ! -e $app ]] && pass "forwarders, $ocg, the engine, plugin and app gone" || fail 'removed'
  [[ -f $old_list && -f $list ]] && pass '~/OpenCode Guard and ~/Agent Guard kept' || fail 'list folders kept'
  snapshot "$home" > "$run/uninstalled-$v.snapshot"
  label="M5 $v"
  ocg_install $v
  rc=$?
  (( rc == 0 )) && pass "OpenCode Guard $v's install.sh runs again" || { fail "reinstall (exit $rc)"; show }
  old_check "way back"
  old_guarded "way back"
  /usr/bin/jq -e --arg f "$cfg" --arg g "$cfg2" '.[$f].edit.orig == null and .[$f].external_directory.orig == null and .[$f].bash.orig == "ask"
      and ([.[$g][].orig] == [null, null, null])' "$ocg/state/permissions.json" >/dev/null &&
    pass "its record's orig values are the pre-guard values, and the user's for bash" || fail "record orig: $(<"$ocg/state/permissions.json")"
done

# --- The forwarders' uninstall step killed, then a rerun. Before the plugin goes,
# every entry point is guarded or refuses (design A2).
label='kill:uninstall-forwarders'
restore M1-1.0.4
point=kill:uninstall-forwarders ag uninstall
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
probe_entry_points "$home" "$base" "$old_path"
point= ag uninstall
rc=$?
(( rc == 0 )) && pass 'rerun exits 0' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals one full uninstall' "$run/uninstalled-1.0.4.snapshot"

# --- v1.0.0 upgraded in place by v1.0.4's installer, which keeps the record entries
# and the list it finds. The migration imports both, and uninstall puts back the
# values from before v1.0.0's install.
label='upgrade 1.0.0 to 1.0.4'
restore clean
ocg_install 1.0.0 && ocg_install 1.0.4
rc=$?
(( rc == 0 )) && pass "v1.0.4's install.sh over v1.0.0's install" || { fail "install (exit $rc)"; show }
user_edits
/usr/bin/jq -e --slurpfile o "$run/record-1.0.0" 'map_values(map_values(.orig)) == ($o[0] | map_values(map_values(.orig)))' "$ocg/state/permissions.json" >/dev/null &&
  pass "the record keeps v1.0.0's orig values" || fail "record: $(<"$ocg/state/permissions.json")"
/usr/bin/cmp -s "$old_list" "$run/list-1.0.0" && ! /usr/bin/cmp -s "$old_list" "$run/list-1.0.4" &&
  pass "the list is v1.0.0's, which differs from v1.0.4's" || fail "the list is not v1.0.0's"
/bin/cp "$ocg/state/permissions.json" "$run/record-upgrade"
point= boot y
rc=$?
(( rc == 0 )) && pass 'migrated (exit 0)' || { fail "migration (exit $rc)"; show }
/usr/bin/cmp -s "$state/opencode-guard-permissions.json" "$run/record-upgrade" &&
  /usr/bin/jq -e --slurpfile o "$run/record-upgrade" '. == $o[0]' "$state/permissions.json" >/dev/null &&
  pass "OpenCode Guard's record imported, and its unchanged copy kept" || fail 'imported record'
/usr/bin/cmp -s "$list" "$run/list-1.0.0" && pass "v1.0.0's list imported byte for byte" || fail 'imported list'
probe_entry_points "$home" "$base" "$old_path"
point= ag uninstall
rc=$?
(( rc == 0 )) && pass 'uninstall exits 0' || { fail "uninstall (exit $rc)"; show }
restored_values

# --- M2: failures before the switch leave OpenCode Guard as it was and working.
pre_switch() {  # NAME
  same_ocg "$1: OpenCode Guard's files, startup files and configs are byte-identical" "$run/ocg-1.0.4.files"
  guard_plugins
  [[ $reply == opencode-guard.js ]] && pass "$1: only opencode-guard.js in the plugin folder" || fail "$1: guard plugins: $reply"
  [[ ! -e $engine ]] && pass "$1: no Agent Guard engine folder" || { fail "$1: Agent Guard engine folder left"; listing "$engine" | /usr/bin/head -5 }
  old_guarded "$1"
  old_check "$1"
}
for p in txn-open assemble build list-import list import selftest-staged; do
  label="M2 fail:$p"
  restore ocg-1.0.4
  point=fail:$p boot y
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -q "stopped at $p" "$out" && pass "exit $rc" || { fail "exit $rc"; show }
  pre_switch after
done
point=
for s text in 0 'opencode is running' 3 'cannot list processes'; do
  label="M2 pgrep exits $s"
  restore ocg-1.0.4
  pgrep_status=$s boot y
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -q "$text" "$out" && pass "exit $rc: $text" || { fail "exit $rc"; show }
  pre_switch after
done
pgrep_status=
label='M2 staged check fails'
restore ocg-1.0.4
BOOT_TAG=v0.0.3-broken boot y
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'FAIL protected write allowed' "$out" && pass "exit $rc, FAIL protected write allowed" || { fail "exit $rc"; show }
pre_switch after
label='M2 import declined'
restore ocg-1.0.4
boot n
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'Nothing changed' "$out" && pass "exit $rc, Nothing changed" || { fail "exit $rc"; show }
[[ ! -e "$home/Agent Guard" ]] && pass 'no ~/Agent Guard' || fail '~/Agent Guard created'
pre_switch after
label='M2 no terminal'
restore ocg-1.0.4
boot_notty
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'Nothing changed' "$out" && [[ ! -e $list ]] && pass "exit $rc, the list is not imported without a terminal" || { fail "exit $rc"; show }

# --- M3: a failure after each switch action and after the live doctor rolls back.
# OpenCode Guard's files that were links during the switch are regular files again,
# byte-identical (design A1).
a1_files() {  # NAME [VERSION]: compared with VERSION's install, v1.0.4's by default
  local f bad= v=${2:-1.0.4}
  for f in "$old_plugin" "$ocg/bin/opencode" "$ocg/bin/opencode-gui"; do
    [[ -f $f && ! -L $f ]] && /usr/bin/cmp -s "$f" "$run/saved-ocg-$v${f#$home}" || bad+=" ${f:t}"
  done
  [[ -z $bad ]] && pass "$1: opencode-guard.js and both old shims are regular files as before" || fail "$1: changed:$bad"
}
rolled_back() {  # VERSION POINT: a failure at POINT from VERSION's install
  local want='Agent Guard: the switch failed'
  [[ $2 == (doctor-live|launch-check) ]] && want="stopped at $2"
  restore "ocg-$1"
  /bin/rm -f -- "$out"
  point=fail:$2 boot y
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -qF "$want" "$out" && pass "exit $rc, $want" || { fail "exit $rc"; show }
  a1_files after $1
  same_ocg "the state is as before the switch" "$run/ocg-$1.files"
  [[ ! -e $engine && $(guard_plugins; print -r -- $reply) == opencode-guard.js ]] && pass 'no engine folder; only opencode-guard.js' || fail 'engine or plugins left'
  old_guarded after
}
for p in rulebook rulejson current fwd-cli fwd-gui plugin-take plugin-name rc app app-old switch-time doctor-live launch-check; do
  label="M3 fail:$p"
  rolled_back 1.0.4 $p
done
# A late rollback, at the live doctor after every switch action, from v1.0.1's and
# v1.0.0's installs.
for v in 1.0.1 1.0.0; do
  label="M3 $v fail:doctor-live"
  rolled_back $v doctor-live
done

# A rollback writes nothing into the release it discards: killed just before the
# discard, the release's files still have the hashes M1's stamp gives them.
label='M3 A1 release'
restore ocg-1.0.4
point='fail:switch-time kill:discard' boot y
rc=$?
(( rc == 137 )) && pass 'killed before the discard of the rolled back release' || { fail "exit $rc"; show }
rels=("$engine"/releases/*(N/))
m1_stamp="$run/saved-M1-1.0.4/Library/Application Support/AgentGuard/state/stamp.json"
m1_rel="$engine/releases/$(/usr/bin/jq -r .release "$m1_stamp")/"
if (( $#rels == 1 )); then
  want=$(/usr/bin/jq -r --arg p "$m1_rel" '.files | to_entries[] | select(.key | startswith($p)) | "\(.key[($p | length):]) \(.value)"' "$m1_stamp" |
    /usr/bin/grep -v '^RELEASE ' | /usr/bin/sort)
  got=$(cd "$rels[1]" && for f in **/*(.DN); do [[ $f == RELEASE ]] || print -r -- "$f ${$(/usr/bin/shasum -a 256 < "$f")%% *}"; done | /usr/bin/sort)
  [[ -n $want && $got == "$want" && $(<"$rels[1]/RELEASE") == ${rels[1]:t} ]] && pass "the release's $(print -r -- "$got" | /usr/bin/wc -l | /usr/bin/tr -d ' ') files are as assembled" ||
    { fail 'the release was written'; /usr/bin/diff <(print -r -- "$want") <(print -r -- "$got") | /usr/bin/head -10 }
else
  fail "releases: ${rels:t}"
fi
a1_files 'rolled back'
probe_entry_points "$home" "$base" "$old_path"
point= boot y
rc=$?
(( rc == 0 )) && pass 'the rerun finishes the rollback and migrates' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals an uninterrupted migration' "$run/M1-1.0.4.snapshot"

# A kill at each point from the list import to the cleanup: every entry point is
# guarded or refuses, never both plugins, and the rerun ends as M1 did.
for p in list-import import rulebook rulejson current fwd-cli fwd-gui plugin-take plugin-name rc app app-gap app-old switch-time \
         doctor-live launch-check stamp retire-rulejson retire-rulebook retire-compare retire-engine retire-note cleanup; do
  label="M3 kill:$p"
  restore ocg-1.0.4
  point=kill:$p boot y
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show; continue }
  probe_entry_points "$home" "$base" "$old_path"
  point= boot y
  rc=$?
  (( rc == 0 )) && pass 'rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
  same_snapshot 'final state equals an uninterrupted migration' "$run/M1-1.0.4.snapshot"
done
# The same from v1.0.0's install, killed with the CLI forwarder in place while
# v1.0.0's GUI shim, launcher and plugin are still in use.
label='M3 1.0.0 kill:fwd-gui'
restore ocg-1.0.0
point=kill:fwd-gui boot y
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
probe_entry_points "$home" "$base" "$old_path"
point= boot y
rc=$?
(( rc == 0 )) && pass 'rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals an uninterrupted migration' "$run/M1-1.0.0.snapshot"

# An interrupted switch is neither finished nor undone while OpenCode runs.
label='M3 kill:fwd-cli, then OpenCode running'
restore ocg-1.0.4
point=kill:fwd-cli boot y
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
snapshot "$home" > "$run/killed.snapshot"
journal_hash=$(sha "$state/txn/journal")
pgrep_status=0 point= boot y
rc=$?
pgrep_status=
(( rc != 0 )) && /usr/bin/grep -q 'opencode is running' "$out" && pass "exit $rc: opencode is running" || { fail "exit $rc"; show }
[[ $(sha "$state/txn/journal") == "$journal_hash" ]] && pass 'the transaction is kept as it was' || fail 'the journal changed'
same_snapshot 'nothing changed' "$run/killed.snapshot"
point= boot y
rc=$?
(( rc == 0 )) && pass 'after OpenCode quits, the rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals an uninterrupted migration' "$run/M1-1.0.4.snapshot"

# --- M4: retirement fails on a rule.json that cannot be written; Agent Guard stays
# active, and the rerun after a fix finishes with no second import.
label=M4
restore ocg-1.0.4
point=kill:retire-rulejson boot y
rc=$?
(( rc == 137 )) && pass 'killed after the commit' || { fail "killed (exit $rc)"; show }
rj=${${:-$cc/rule.json}:A}
/bin/chmod 444 "$rj"
record_hash=$(sha "$state/permissions.json")
point= boot y
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "$cc/rule.json cannot be written" "$out" && pass "exit $rc, rule.json named" || { fail "exit $rc"; show }
point= ag doctor
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.retired == false' "$state/migration.json" >/dev/null && [[ -d $cc/opencode-guard ]] &&
  pass 'Agent Guard active (doctor passes); the old rulebook and entry stay' || { fail "doctor (exit $rc)"; show }
save M4-stuck
/bin/chmod 644 "$rj"
point= boot y
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.retired == true' "$state/migration.json" >/dev/null && [[ ! -e $cc/opencode-guard ]] &&
  pass 'the rerun finishes retirement' || { fail "rerun (exit $rc)"; show }
[[ $(sha "$state/permissions.json") == "$record_hash" ]] && pass 'no second import: the record is unchanged' || fail 'the record changed'
# Uninstall is not held up by the unfinished retirement: it removes Agent Guard and
# names what it could not retire.
restore M4-stuck
point= ag uninstall
rc=$?
(( rc != 0 )) && [[ ! -e $engine && ! -e $ocg && -d $cc/opencode-guard ]] && /usr/bin/grep -qF "$cc/rule.json cannot be written" "$out" &&
  pass "uninstall with retirement unfinished: exit $rc, Agent Guard and the forwarders gone, rule.json named" || { fail "uninstall (exit $rc)"; show }
/bin/chmod 644 "$rj"

# --- Forwarders without OpenCode Guard and without Agent Guard (forwarders-only):
# a fresh install records them as retired, and a boot after it removes them.
label=forwarders-only
restore clean
/bin/mkdir -p "$ocg/bin"
/bin/ln -s "$engine/bin/opencode" "$ocg/bin/opencode"
/bin/ln -s "$engine/bin/opencode-gui" "$ocg/bin/opencode-gui"
point= boot ''
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.retired == true and (.switched_at | type) == "number"' "$state/migration.json" >/dev/null &&
  [[ -L $ocg/bin/opencode ]] && pass 'installed; the forwarders are recorded as retired and kept until a boot' || { fail "exit $rc"; show }
sw=$(/usr/bin/jq -r .switched_at "$state/migration.json" 2>/dev/null)
point= boot_at=$(( sw + 10 )) ag update
rc=$?
boot_at=
(( rc == 0 )) && [[ ! -e $ocg ]] && pass 'update after a boot removes them' || { fail "update (exit $rc)"; show }

# --- M6: v1.0.0's failed restore deleted the engine and its record; only
# ~/OpenCode Guard is left. A fresh install imports the list and says the originals
# are lost, naming each config.
label=M6
restore ocg-1.0.4
/bin/rm -rf "$ocg" "$old_plugin" "$old_app" "$cc/opencode-guard"
/usr/bin/jq '.rules -= ["opencode-guard"]' "$cc/rule.json" > "$run/rule.json" && /bin/cp "$run/rule.json" "$cc/rule.json"
for f in "$home/.zprofile" "$home/dotfiles/zshrc"; do
  /usr/bin/sed '/^# >>> opencode-guard >>>$/,/^# <<< opencode-guard <<<$/d' "$f" > "$run/rc" && /bin/cp "$run/rc" "$f"
done
point= boot y
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'Import this list?' "$out" && /usr/bin/cmp -s "$list" "$old_list" &&
  pass 'installed; the list import was offered and the list copied' || { fail "exit $rc"; show }
/usr/bin/grep -q 'no permission record of it exists, so the values it wrote cannot be restored' "$out" &&
  /usr/bin/grep -qF "$cfg" "$out" && /usr/bin/grep -qF "$cfg2" "$out" && pass 'says the originals are lost and names each config' || { fail 'message'; show }

# --- M12: an OpenCode Guard start marker without its end marker.
label=M12
restore ocg-1.0.4
/usr/bin/sed -i '' '/^# <<< opencode-guard <<<$/d' "$home/.zprofile"
before=$(ocg_files)
snap=$(snapshot "$home")
point= boot y
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "$home/.zprofile has a start marker" "$out" && pass "exit $rc, the file named" || { fail "exit $rc"; show }
[[ $(ocg_files) == "$before" && $(snapshot "$home") == "$snap" && ! -e $engine ]] && pass 'nothing changed' || fail 'something changed'

# --- M14: OpenCode Guard's record is not an object of per-file entries.
label=M14
restore ocg-1.0.4
print -r -- '[]' > "$ocg/state/permissions.json"
before=$(ocg_files)
point= boot y
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "$ocg/state/permissions.json" "$out" && pass "exit $rc, the record named" || { fail "exit $rc"; show }
[[ $(ocg_files) == "$before" && ! -e $engine ]] && pass 'OpenCode Guard unchanged' || fail 'something changed'
old_guarded 'OpenCode Guard keeps working'

# --- Run inside OpenCode Guard's guard: refused before any change.
label='inside OpenCode Guard'
restore ocg-1.0.4
temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A} cache=${$(/usr/bin/getconf DARWIN_USER_CACHE_DIR):A}
profile=$(/usr/bin/env -i HOME="$home" PATH="$base" "$ocg/launch" profile 2>/dev/null)
before=$(ocg_files)
text=$(/usr/bin/curl -fsSL "$url/releases/download/v0.0.1/install.sh")
run_timeout 60 /usr/bin/sandbox-exec -D "HOME=$home" -D "DARWIN_TEMP=$temp" -D "DARWIN_CACHE=$cache" -D GUI=0 -p "$profile" \
  /usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh -c "$text" install.sh --projects "$home/Projects" < /dev/null > "$out" 2>&1
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'outside any guard or sandbox' "$out" && pass "refused (exit $rc)" || { fail "exit $rc"; show }
[[ $(ocg_files) == "$before" && ! -e $engine ]] && pass 'nothing changed' || fail 'something changed'

# --- The migration never runs OpenCode Guard's uninstaller.
label=static
found=$(/usr/bin/grep -rn 'OpenCodeGuard/uninstall.sh' "$source_root/profiles" "$source_root/engine")
[[ -z $found ]] && pass "no reference to OpenCodeGuard/uninstall.sh in profiles/ or engine/" || fail "found: $found"

finish

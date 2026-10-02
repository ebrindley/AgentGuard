#!/bin/zsh
# The Pi harness and the move from pi-sandbox-guard 7ad441f (docs/DESIGN.md section
# 11, The adoption): the migration, a failure and a kill at each test point before,
# during and after its switch with reruns, the rollback, custom wrappers, a running
# Pi refusing the migration, uninstall with the legacy copy, fresh installs over a
# real Pi's npm link and over an OMP binary, updates, and a Mac with both old guards.
# Each migration starts from a real pi-sandbox-guard install made by its own deploy
# scripts (test/fixtures/installs/pi-sandbox-guard-7ad441f) with HOME set to a
# disposable home, a fake Pi (a Node script in npm's layout) and a fake OMP; test
# releases are served by test/release-server.mjs. The deploy scripts run from a copy
# whose preamble, like the test release's (test/engines/zsh.mjs), takes the home
# from a fake directory service and pins PATH to the system folders, so no launcher
# looks up the account or finds a Pi of the test Mac. Runs outside any sandbox, from
# a checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
unset AGENT_GUARD_RELEASE AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED
command -v node >/dev/null || { print -ru2 'Node is required for the release server, the analyzer and the fake Pi'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
fixtures="$source_root/test/fixtures/installs"
integer fails=0 checks=0
label=
pass() { checks+=1; print -r -- "ok   ${label:+$label: }$*" }
fail() { checks+=1; fails+=1; print -r -- "FAIL ${label:+$label: }$*" }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-migrate-pi-XXXXXX")
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
  # Every Pi test point (test/lib.zsh) was exercised here.
  label=coverage
  for p in $pi_points; do (( ${exercised[(Ie)$p]} )) || missing+=("$p"); done
  (( $#missing == 0 )) && pass "all $#pi_points Pi test points are exercised" || fail "Pi test points not exercised: $missing"
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
lb="$home/.local/bin"
ext="$home/.pi/agent/extensions/pi-sandbox-guard"
conf="$home/.config/pi-sandbox-guard/executables.conf"
seclog="$home/.pi/agent/security-events.log"
legacy="$state/legacy/pi-sandbox-guard"
replaced="$state/legacy/replaced"
wrec="$state/wrappers.json"
copy="$home/Agent Guard/pi-sandbox-guard-legacy"
project="$home/Projects/app"
out="$run/out"
darwin_temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}

# The fake OpenCode CLI (test/fake-opencode.mjs) and Node, each through a folder of
# its own, so no other program on Node's folder (CI's npm global opencode) is on PATH.
node_bin=${$(command -v node):A}
fakebin="$run/fakebin" nodebin="$run/nodebin"
/bin/mkdir -p "$fakebin" "$nodebin"
print -r -- "#!/bin/sh
exec '$node_bin' '$source_root/test/fake-opencode.mjs' \"\$@\"" > "$fakebin/opencode"
/bin/chmod 755 "$fakebin/opencode"
/bin/ln -s "$node_bin" "$nodebin/node"
base="$fakebin:$nodebin:/usr/bin:/bin:/usr/sbin:/sbin"
# The analyzer's Node as deploy-local.sh records it: the resolved node, or its
# Homebrew opt link.
stable_node() {
  local r=${1:A} s
  if [[ $r == (#b)(/opt/homebrew|/usr/local)/Cellar/(node(|@<->))/[^/]##/bin/node ]]; then
    s="$match[1]/opt/$match[2]/bin/node"
    [[ ${s:A} == $r ]] && { print -r -- $s; return }
  fi
  print -r -- $r
}
want_node=$(stable_node "$node_bin")

# Releases: v0.0.1 and v0.0.2 from this checkout, the same files apart from VERSION,
# and v0.0.3 whose Pi profile has one more comment line.
build() { node "$adapter" release "$1" "$served" "$home" "v$2" "$2" "$url" >/dev/null }
build "$source_root" 0.0.1 || { print -ru2 'cannot build v0.0.1'; finish }
build "$source_root" 0.0.2 || { print -ru2 'cannot build v0.0.2'; finish }
/bin/mkdir -p "$run/src-c"
/bin/cp -R "$source_root"/{engine,profiles,installer,scripts,install.sh,LICENSE} "$run/src-c/"
print -r -- ';; v0.0.3' >> "$run/src-c/profiles/pi/sandbox/pi-sandbox.sb"
build "$run/src-c" 0.0.3 || { print -ru2 'cannot build v0.0.3'; finish }
print -r -- v0.0.1 > "$served/latest.txt"

point= pgrep_status= pi_path=
typeset -a extra_env
# note_point: records the test points named in $point as exercised.
note_point() { local p; for p in ${=point}; do exercised+=("${p#*:}"); done }
# envv: the environment of a run, from point, pgrep_status, pi_path and extra_env.
envv() {
  reply=(/usr/bin/env -i HOME="$home" PATH="$base" TMPDIR="$darwin_temp/" AG_TEST_POINT="$point")
  [[ -n $pgrep_status ]] && reply+=(AG_TEST_PGREP="$pgrep_status")
  [[ -n $pi_path ]] && reply+=(AG_TEST_PI_PATH="$pi_path")
  reply+=($extra_env)
  return 0
}
# boot [TAG]: the one-liner of TAG (v0.0.1), without a terminal.
boot() {
  local text
  text=$(/usr/bin/curl -fsSL "$url/releases/download/${1:-v0.0.1}/install.sh") || return 99
  note_point
  envv
  run_timeout 600 $reply /bin/zsh -c "$text" install.sh --projects "$home/Projects" < /dev/null > "$out" 2>&1
}
# ag ARGS...: the installed agent-guard command.
ag() {
  note_point
  envv
  run_timeout 600 $reply "$engine/bin/agent-guard" "$@" < /dev/null > "$out" 2>&1
}
save() { /bin/rm -rf "$run/saved-$1"; /bin/cp -Rp "$home" "$run/saved-$1" }
restore() { /bin/chmod -R u+w "$home" 2>/dev/null; /bin/rm -rf "$home"; /bin/cp -Rp "$run/saved-$1" "$home" }
saved() { REPLY="$run/saved-$1${2#$home}" }
sha() { /usr/bin/shasum -a 256 < "$1" 2>/dev/null }
show() { print -r -- "$(<"$out")" | /usr/bin/sed 's/^/    | /' }
replace_once() {  # FILE FROM TO
  local text=$(<"$1")
  (( ${#text} - ${#${text//$2/}} == ${#2} )) || { print -ru2 -- "must occur once in $1: $2"; finish }
  print -r -- "${text/$2/$3}" > "$1"
}

# pi_files: every file and link under ~/.local/bin, ~/.local/lib (npm's user prefix),
# ~/.pi and ~/.config/pi-sandbox-guard, with mode and hash or link target.
pi_files() {
  local f
  for f in "$home"/.local/{bin,lib}/**/*(DN) "$home"/.pi/**/*(DN) "$home"/.config/pi-sandbox-guard/**/*(DN); do
    if [[ -L $f ]]; then print -r -- "${f#$home/} -> $(/usr/bin/readlink "$f")"
    elif [[ -f $f ]]; then print -r -- "${f#$home/} $(/usr/bin/stat -f %Lp "$f") $(sha "$f")"
    else print -r -- "${f#$home/}/"; fi
  done
}
# pi_state: pi_files, the shell startup files, the legacy bundles, the wrapper
# records, the migration records without switch times and the stamp's version and
# harnesses, for comparing two runs that end in the same state.
pi_state() {
  local f
  pi_files
  for f in "$home"/{.zprofile,.zshrc}(N) "$state"/legacy/**/*(DN) "$wrec"(N); do
    if [[ -L $f ]]; then print -r -- "${f#$home/} -> $(/usr/bin/readlink "$f")"
    elif [[ -f $f ]]; then print -r -- "${f#$home/} $(sha "$f")"
    else print -r -- "${f#$home/}/"; fi
  done
  [[ -f $state/migration.json ]] && print -r -- "migration $(/usr/bin/jq -c 'if type == "object" then [.] else . end | map(del(.switched_at))' "$state/migration.json")"
  [[ -f $state/stamp.json ]] && print -r -- "stamp $(/usr/bin/jq -c '[.version, .harnesses]' "$state/stamp.json")"
  return 0
}
home_snapshot() { snapshot "$home" }
same() {  # NAME FILE FUNCTION: FUNCTION's output equals FILE
  local now
  now=$($3)
  if [[ $now == "$(<$2)" ]]; then pass "$1"
  else fail "$1"; /usr/bin/diff <(print -r -- "$(<$2)") <(print -r -- "$now") | /usr/bin/sed 's/^/    /' | /usr/bin/head -20
  fi
}

# pi_probe NAME CMD...: one start of an agent session in the project. Guarded: the
# fake runtime ran with the guard's extension and could not write outside the
# project. Refused: it exited non-zero without running.
pi_probe() {
  local name=$1
  integer rc
  shift
  /bin/rm -f -- "$home/Documents/escaped" "$project/launched"
  ( cd "$project" && run_timeout 30 /usr/bin/env -i HOME="$home" PATH="$base" TMPDIR="$darwin_temp/" PI_PROJECT="$project" "$@" ) >/dev/null 2>"$run/probe.err"
  rc=$?
  if [[ -e $home/Documents/escaped ]]; then fail "$name: escaped the sandbox"
  elif (( rc == 124 )); then fail "$name: timed out"
  elif [[ -f $project/launched ]]; then
    [[ $(<"$project/launched") == *"--extension $ext/index.ts"* ]] && pass "$name: guarded" ||
      fail "$name: ran without the guard's extension: $(<"$project/launched")"
  elif (( rc != 0 )); then pass "$name: refused"
  else fail "$name: exit 0 without running"
  fi
  /bin/rm -f -- "$project/launched"
}
# pi_entry_points: every way to start Pi or OMP is guarded or refused (design
# section 11, The adoption, item 5).
pi_entry_points() {
  local f
  pi_probe 'new terminal: pi' /bin/zsh -l -i -c pi
  pi_probe 'new terminal: omp' /bin/zsh -l -i -c omp
  for f in "$lb"/{pi,omp,pi-local}(N) "$engine"/bin/{pi,omp}(N); do pi_probe "${f/#$home/~}" "$f"; done
}

# --- The disposable home: a .zprofile that puts the fake CLI and ~/.local/bin first,
# the fake OpenCode.app and a tool of the user's in ~/.local/bin (bare), then a fake
# Pi in an npm user prefix and a fake OMP outside every folder a Pi session can
# write (clean).
/bin/mkdir -p "$lb"
print -r -- "path=(\"$fakebin\" \"\$HOME/.local/bin\" \$path)" > "$home/.zprofile"
print -r -- 'export EDITOR=vi' > "$home/.zshrc"
fake_app="$home/Applications/OpenCode.app"
/bin/mkdir -p "$fake_app/Contents/MacOS"
print -r -- '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>FakeOpenCodeApp</string></dict></plist>' > "$fake_app/Contents/Info.plist"
/bin/cp "$fakebin/opencode" "$fake_app/Contents/MacOS/FakeOpenCodeApp"
print -r -- '#!/bin/sh' > "$lb/mytool"
/bin/chmod 755 "$lb/mytool"
/bin/cp "$lb/mytool" "$lb/mytool.bak.20260101000000.1"
save bare
pkg=lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js
# fake_pi PATH: Pi's dist/cli.js stand-in. --version prints a version; --wait runs
# until killed, as a session; anything else tries to write ~/Documents/escaped,
# which the guard denies, then writes its arguments to launched in the project.
fake_pi() {
  /bin/mkdir -p "${1:h}"
  print -r -- '#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
if (args.includes("--version")) { console.log("fake pi 0.70.0"); process.exit(0); }
if (args.includes("--wait")) { setInterval(() => {}, 1000); } else {
  try { fs.writeFileSync(`${process.env.HOME}/Documents/escaped`, "x"); } catch {}
  fs.writeFileSync("launched", args.join(" "));
}' > "$1"
  /bin/chmod 755 "$1"
}
# fake_omp PATH: the same for OMP's native binary.
fake_omp() {
  /bin/mkdir -p "${1:h}"
  print -r -- '#!/bin/zsh -f
if (( ${argv[(Ie)--version]} )); then print -r -- "fake omp 17.2.10"; exit 0; fi
{ print x > "$HOME/Documents/escaped" } 2>/dev/null
print -r -- "$*" > launched' > "$1"
  /bin/chmod 755 "$1"
}
pi_bin="$home/.npm-global/$pkg" omp_bin="$home/opt/omp/bin/omp"
fake_pi "$pi_bin"
fake_omp "$omp_bin"
save clean

# --- pi-sandbox-guard 7ad441f, installed by its own deploy scripts as its README's
# npm run setup does, from a copy of the fixture with the preamble's seams: the
# extension twice (the second deploy moves the first into extension-backups), the
# launchers twice with custom wrappers (the second deploy changes pi-local, which
# leaves pi-local.bak.*, and drops pi-old, which the user then deletes), and the
# bindings.
psg_src="$run/psg-src"
/bin/cp -R "$fixtures/pi-sandbox-guard-7ad441f" "$psg_src"
print -r -- "#!/bin/sh
printf '%s\n' ${(qq):-NFSHomeDirectory: $home}" > "$run/dscl"
/bin/chmod 755 "$run/dscl"
replace_once "$psg_src/sandbox/pi-sandbox-preamble.zsh" 'typeset -r DSCL_BIN="/usr/bin/dscl"' "typeset -r DSCL_BIN=${(qq)run}/dscl"
replace_once "$psg_src/sandbox/pi-sandbox-preamble.zsh" 'PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"' 'PATH="/usr/bin:/bin:/usr/sbin:/sbin"'
# wrapper PATH ARGS...: a custom wrapper that passes ARGS to the pi next to it.
wrapper() {
  local f=$1
  shift
  /bin/mkdir -p "${f:h}"
  print -r -- '#!/bin/zsh -f
set -euo pipefail
PI_SHIM="${0:A:h}/pi"
exec "$PI_SHIM" '"$*"' "$@"' > "$f"
  /bin/chmod 755 "$f"
}
wrapper "$run/wrappers-1/pi-local" --model local
wrapper "$run/wrappers-1/pi-old" --model old
wrapper "$run/wrappers-2/pi-local" --model local2
psg() {  # SCRIPT ARGS...: one of its scripts, as from a terminal in its checkout
  ( cd "$psg_src" && run_timeout 300 /usr/bin/env -i HOME="$home" PATH="$base" TMPDIR="$darwin_temp/" /bin/bash "scripts/$1" "${@:2}" ) >> "$out" 2>&1
}
psg_install() {
  : > "$out"
  psg deploy-local.sh --skip-tests --release-id fixture-1 &&
    psg deploy-launchers.sh --release-id fixture-1 --extra-launchers "$run/wrappers-1" &&
    psg bind-executable.sh --pi "$pi_bin" --omp "$omp_bin" --node "$node_bin" --yes &&
    psg deploy-local.sh --skip-tests --release-id fixture-2 &&
    psg deploy-launchers.sh --release-id fixture-2 --extra-launchers "$run/wrappers-2" &&
    /bin/rm "$lb/pi-old"
}
label=setup
psg_install || { fail "pi-sandbox-guard's deploy scripts (exit $?)"; show; finish }
# The analyzer logs the blocked command of deploy-local.sh's check.
[[ -f $lb/pi && -f $lb/omp && -f $lb/pi-sandbox.sb && -f $lb/pi-sandbox-preamble.zsh && -f $lb/.pi-sandbox-launchers-version && -f $lb/pi-local ]] &&
  [[ -f $ext/.deployed-version && $(<"$ext/.guard-node") == "$want_node" && -n $(print -l "$home"/.pi/agent/extension-backups/pi-sandbox-guard.bak.*(N)) ]] &&
  [[ -n $(print -l "$lb"/pi-local.bak.*(N)) && -f $seclog ]] && /usr/bin/grep -qx "pi=$pi_bin" "$conf" &&
  pass 'pi-sandbox-guard installed by its own deploy scripts' || { fail 'pi-sandbox-guard installed by its own deploy scripts'; show; listing "$home/.local" | /usr/bin/sed 's/^/    /'; finish }
psg_ext_backup=$(print -l "$home"/.pi/agent/extension-backups/*(N))
psg_bak=$(print -l "$lb"/pi*.bak.<->.<->(N:t))
pi_probe "pi-sandbox-guard's pi" "$lb/pi"
pi_probe "pi-sandbox-guard's omp" "$lb/omp"
pi_probe "pi-sandbox-guard's wrapper" "$lb/pi-local"
save psg
pi_files > "$run/psg.files"

# psg_kept NAME: pi-sandbox-guard is as before the run and still guards.
psg_kept() {
  same "$1: pi-sandbox-guard's files are byte-identical" "$run/psg.files" pi_files
  [[ ! -e $engine ]] && pass "$1: no engine folder" || { fail "$1: engine folder left"; listing "$engine" | /usr/bin/head -5 | /usr/bin/sed 's/^/    /' }
  pi_probe "$1: pi-sandbox-guard's pi" "$lb/pi"
}

# --- M1: the migration.
label=M1
restore psg
point= boot
rc=$?
(( rc == 0 )) && /usr/bin/grep -qF 'migrating from pi-sandbox-guard' "$out" && pass 'migrated (exit 0)' || { fail "migration (exit $rc)"; show; finish }
cur="$engine/current/profiles/pi"
/usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null && pass 'the stamp lists opencode and pi' || fail "stamp harnesses: $(/usr/bin/jq -c .harnesses "$state/stamp.json")"
bad=
for f rel in pi launchers/pi omp launchers/pi pi-sandbox.sb sandbox/pi-sandbox.sb pi-sandbox-preamble.zsh sandbox/pi-sandbox-preamble.zsh; do
  [[ -f $lb/$f && ! -L $lb/$f ]] && /usr/bin/cmp -s "$lb/$f" "$cur/$rel" || bad+=" $f"
done
for f rel in index.ts scripts/extension-entry.ts src/index.mjs src/index.mjs src/guard-core.mjs src/guard-core.mjs src/validate-bash-command.sh src/validate-bash-command.sh; do
  /usr/bin/cmp -s "$ext/$f" "$cur/$rel" || bad+=" $f"
done
[[ -z $bad ]] && pass "the launchers, profile, preamble and extension are the release's copies" || fail "not the release's:$bad"
[[ $(/usr/bin/stat -f %Lp "$lb/pi") == 755 && $(/usr/bin/stat -f %Lp "$lb/pi-sandbox.sb") == 644 && $(/usr/bin/stat -f %Lp "$ext/src/validate-bash-command.sh") == 755 ]] &&
  pass 'modes 755 for the launchers and the analyzer, 644 for the profile' || fail 'modes'
saved psg "$ext/.guard-node"
/usr/bin/cmp -s "$ext/.guard-node" "$REPLY" && [[ ! -e $ext/.deployed-version ]] && pass '.guard-node kept; no .deployed-version' || fail '.guard-node or .deployed-version'
[[ $(/usr/bin/readlink "$engine/current/bin/pi") == "$lb/pi" && $(/usr/bin/readlink "$engine/current/bin/omp") == "$lb/omp" ]] &&
  pass "bin/pi and bin/omp link to ~/.local/bin" || fail 'bin/pi and bin/omp'
h=$(sha "$run/wrappers-2/pi-local")
/usr/bin/jq -e --arg h "${h%% *}" '. == {wrappers: {"pi-local": {sha256: $h}}, historical: ["pi-old"]}' "$wrec" >/dev/null &&
  pass 'wrappers.json: pi-local with its hash, pi-old historical' || fail "wrappers.json: $(<"$wrec")"
/usr/bin/jq -e '.from == "pi-sandbox-guard" and (.switched_at | type) == "number" and .retired == true' "$state/migration.json" >/dev/null &&
  pass 'migration record: switched and retired' || fail "migration.json: $(<"$state/migration.json")"
bad=
for f in pi omp pi-sandbox.sb pi-sandbox-preamble.zsh .pi-sandbox-launchers-version ${(f)psg_bak}; do
  saved psg "$lb/$f"
  /usr/bin/cmp -s "$legacy/local-bin/$f" "$REPLY" || bad+=" $f"
done
saved psg "$ext"
/usr/bin/diff -r "$legacy/extension/pi-sandbox-guard" "$REPLY" >/dev/null || bad+=' extension'
saved psg "$psg_ext_backup"
/usr/bin/diff -r "$legacy/extension-backups/${psg_ext_backup:t}" "$REPLY" >/dev/null || bad+=' extension-backups'
[[ -z $bad ]] && pass "the legacy bundle holds pi-sandbox-guard's files, its stamp, launcher backups and extension backups" || fail "legacy bundle:$bad"
[[ ! -e $lb/.pi-sandbox-launchers-version && -z $(print -l "$lb"/pi*.bak.*(N)) && ! -e $home/.pi/agent/extension-backups ]] &&
  pass 'none of them is left where Pi sessions can reach it' || fail 'left behind'
saved psg "$seclog"
/usr/bin/cmp -s "$seclog" "$REPLY" && saved psg "$conf" && /usr/bin/cmp -s "$conf" "$REPLY" && [[ -f $lb/mytool && -f $lb/mytool.bak.20260101000000.1 ]] &&
  pass "the security event log, executables.conf and the user's own files stay" || fail 'log, bindings or user files'
point= ag version
rc=$?
(( rc == 0 )) && pass 'agent-guard version reports no drift' || { fail "version (exit $rc)"; show }
point= ag doctor
rc=$?
(( rc == 0 )) && /usr/bin/grep -qF 'ok   wrapper ~/.local/bin/pi-local matches its recorded hash' "$out" && pass 'agent-guard doctor passes' || { fail "doctor (exit $rc)"; show }
save M1
pi_state > "$run/M1.state"
pi_entry_points

# Drift in a Pi file outside the engine folder is named by version and doctor.
label=drift
print -r -- '# edited' >> "$lb/pi-sandbox-preamble.zsh"
point= ag version
rc=$?
(( rc == 1 )) && /usr/bin/grep -qF "$lb/pi-sandbox-preamble.zsh" "$out" && pass 'agent-guard version names the changed preamble' || { fail "version (exit $rc)"; show }
restore M1

# --- A rerun after the migration changes nothing.
label=rerun
point= boot
rc=$?
(( rc == 0 )) && ! /usr/bin/grep -qF 'migrating from pi-sandbox-guard' "$out" && pass 'exit 0, no second migration' || { fail "rerun (exit $rc)"; show }
same 'the state is as after the migration' "$run/M1.state" pi_state

# --- Failures before the switch leave pi-sandbox-guard as it was.
for p in psg-wrappers selftest-staged; do
  label="fail:$p"
  restore psg
  point=fail:$p boot
  rc=$?
  (( rc != 0 )) && pass "exit $rc" || { fail "exit $rc"; show }
  psg_kept after
done
label='pgrep exits 3'
restore psg
pgrep_status=3 boot
rc=$?
pgrep_status=
(( rc != 0 )) && /usr/bin/grep -qF 'cannot list processes' "$out" && /usr/bin/grep -qF 'outside any sandbox' "$out" && pass "exit $rc: cannot list processes" || { fail "exit $rc"; show }
psg_kept after

# --- A failure at each point of the switch, and at the live doctor, rolls back to
# pi-sandbox-guard's files byte for byte.
for p in pi-bindings pi-preamble pi-profile pi-launcher-pi pi-launcher-omp pi-extension pi-extension-gap current psg-switch-time doctor-live; do
  label="fail:$p"
  restore psg
  point=fail:$p boot
  rc=$?
  want='the switch failed'
  [[ $p == doctor-live ]] && want='stopped at doctor-live'
  (( rc != 0 )) && /usr/bin/grep -qF "$want" "$out" && pass "exit $rc, $want" || { fail "exit $rc"; show }
  psg_kept 'rolled back'
done

# --- After the stamp: a failure leaves Agent Guard active and the next run finishes.
for p in pi-keep psg-keep psg-retire-launchers psg-retire-backups cleanup; do
  label="fail:$p"
  restore psg
  point=fail:$p boot
  rc=$?
  if [[ $p == cleanup ]]; then (( rc == 0 )) && pass 'exit 0; cleanup is left to the next run' || { fail "exit $rc"; show }
  else (( rc != 0 )) && pass "exit $rc" || { fail "exit $rc"; show }
  fi
  point= ag doctor
  rc=$?
  (( rc == 0 )) && pass 'Agent Guard is active (doctor passes)' || { fail "doctor (exit $rc)"; show }
  pi_entry_points
  # agent-guard update at the installed version finishes it, as the one-liner does.
  point= ag update
  rc=$?
  (( rc == 0 )) && pass 'agent-guard update finishes it' || { fail "update (exit $rc)"; show }
  same 'the state is as after an uninterrupted migration' "$run/M1.state" pi_state
done

# --- A kill at each point from the wrapper import to the cleanup: every entry
# point is guarded or refuses, and the rerun ends as M1 did.
for p in psg-wrappers pi-bindings pi-preamble pi-profile pi-launcher-pi pi-launcher-omp pi-extension pi-extension-gap \
         current psg-switch-time stamp pi-keep psg-keep psg-retire-launchers psg-retire-backups cleanup; do
  label="kill:$p"
  restore psg
  point=kill:$p boot
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show; continue }
  pi_entry_points
  point= boot
  rc=$?
  (( rc == 0 )) && pass 'rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
  same 'the state is as after an uninterrupted migration' "$run/M1.state" pi_state
done

# --- A running Pi session refuses the migration, also when it holds an interrupted
# switch; a session's process is node, so its argument list names the bound Pi.
session() { /usr/bin/env -i HOME="$home" PATH="$base" "$node_bin" "$pi_bin" --wait >/dev/null 2>&1 & session_pid=$! }
label='a Pi session runs'
restore psg
session
pgrep_status=real boot
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "a running process runs $pi_bin. Quit every Pi and OMP session" "$out" && pass "exit $rc, the bound Pi named" || { fail "exit $rc"; show }
kill $session_pid; wait $session_pid 2>/dev/null
psg_kept after
# A session the launcher started with another accepted executable (PI_EXECUTABLE)
# does not name the bound Pi; its argument list names the guard's extension.
label='a Pi session runs another executable'
restore psg
fake_pi "$home/other/cli.js"
/usr/bin/env -i HOME="$home" PATH="$base" "$node_bin" "$home/other/cli.js" --wait --extension "$ext/index.ts" >/dev/null 2>&1 &
session_pid=$!
pgrep_status=real boot
rc=$?
kill $session_pid; wait $session_pid 2>/dev/null
(( rc != 0 )) && /usr/bin/grep -qF "a running process runs $ext/index.ts. Quit every Pi and OMP session" "$out" &&
  pass "exit $rc, the guard's extension named" || { fail "exit $rc"; show }
same 'nothing changed' "$run/psg.files" pi_files
label='kill:pi-launcher-omp, then a Pi session runs'
restore psg
point=kill:pi-launcher-omp boot
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
pi_files > "$run/killed.files"
journal_hash=$(sha "$state/txn/journal")
session
point= pgrep_status=real boot
rc=$?
kill $session_pid; wait $session_pid 2>/dev/null
(( rc != 0 )) && /usr/bin/grep -qF 'Quit every Pi and OMP session' "$out" && pass "exit $rc, refused" || { fail "exit $rc"; show }
[[ $(sha "$state/txn/journal") == "$journal_hash" ]] && pass 'the transaction is kept as it was' || fail 'the journal changed'
same 'nothing changed' "$run/killed.files" pi_files
point= pgrep_status=real boot
rc=$?
pgrep_status=
(( rc == 0 )) && pass 'after the session ends, the rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
same 'the state is as after an uninterrupted migration' "$run/M1.state" pi_state

# --- Custom wrappers the import cannot record refuse the migration before any
# change; a recorded wrapper that is gone becomes a historical name.
label=wrappers
restore psg
print -r -- '# edited' >> "$lb/pi-local"
pi_files > "$run/edited.files"
point= boot
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF '~/.local/bin/pi-local changed since pi-sandbox-guard installed it' "$out" && /usr/bin/grep -qF 'Nothing changed' "$out" &&
  pass "a changed wrapper: exit $rc, named" || { fail "changed wrapper (exit $rc)"; show }
same 'nothing changed' "$run/edited.files" pi_files
restore psg
/bin/cp "$run/wrappers-1/pi-old" "$lb/pi-old"
point= boot
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF '~/.local/bin/pi-old was a pi-sandbox-guard wrapper and is still executable' "$out" &&
  pass "a removed wrapper still executable: exit $rc, named" || { fail "historical wrapper (exit $rc)"; show }
[[ ! -e $engine ]] && pass 'no engine folder' || fail 'engine folder left'
restore psg
/bin/rm "$lb/pi-local"
point= boot
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '. == {wrappers: {}, historical: ["pi-local", "pi-old"]}' "$wrec" >/dev/null &&
  pass 'a recorded wrapper that is gone is imported as historical' || { fail "exit $rc: $(<"$wrec")"; show }
restore M1
point= ag wrapper list
rc=$?
(( rc == 0 )) && /usr/bin/grep -qE '^pi-local +recorded +hash matches' "$out" && /usr/bin/grep -qE '^pi-old +historical +absent' "$out" &&
  pass 'agent-guard wrapper list shows the imported records' || { fail "wrapper list (exit $rc)"; show }

# --- Uninstall after the migration: the Pi pieces go, the legacy bundle is copied to
# ~/Agent Guard, and its printed steps put pi-sandbox-guard back.
label=uninstall
restore M1
/bin/cp -Rp "$legacy" "$run/legacy-M1"
point= ag uninstall
rc=$?
(( rc == 0 )) && pass 'exit 0' || { fail "uninstall (exit $rc)"; show }
[[ ! -e $engine && ! -e $lb/pi && ! -e $lb/omp && ! -e $lb/pi-sandbox.sb && ! -e $lb/pi-sandbox-preamble.zsh && ! -e $ext ]] &&
  pass 'the engine, launchers, profile, preamble and extension are gone' || fail 'left behind'
saved psg "$conf"
[[ -f $lb/pi-local && -f $seclog ]] && /usr/bin/cmp -s "$conf" "$REPLY" && pass 'the wrapper, the security event log and executables.conf stay' || fail 'kept files'
/usr/bin/grep -qF "custom wrappers left in ~/.local/bin: pi-local" "$out" && pass 'names the wrapper it leaves' || { fail 'wrapper message'; show }
/usr/bin/diff -r "$copy" "$run/legacy-M1" >/dev/null && pass "the legacy bundle is copied to ~/Agent Guard/pi-sandbox-guard-legacy" || fail 'legacy copy'
steps=(${(M)${(f)"$(<"$out")"}:#  /bin/cp *})
(( $#steps == 2 )) && pass 'prints the steps that reinstate pi-sandbox-guard' || { fail 'reinstate steps'; show }
snapshot "$home" > "$run/uninstalled.snapshot"
label='way back'
/usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh -fc "${(F)steps}" >/dev/null 2>&1 && pass 'the printed steps run' || fail 'the printed steps fail'
saved psg "$lb/pi"
/usr/bin/cmp -s "$lb/pi" "$REPLY" && saved psg "$lb/pi-sandbox.sb" && /usr/bin/cmp -s "$lb/pi-sandbox.sb" "$REPLY" && saved psg "$ext" &&
  /usr/bin/diff -r "$ext" "$REPLY" >/dev/null && pass "pi-sandbox-guard's files are back" || fail "pi-sandbox-guard's files"
pi_probe "pi-sandbox-guard's pi" "$lb/pi"
pi_probe "pi-sandbox-guard's wrapper" "$lb/pi-local"
# A failed copy keeps the engine; the rerun finishes. A kill there, then a rerun.
label='uninstall copy fails'
restore M1
/bin/chmod 555 "$home/Agent Guard"
point= ag uninstall
rc=$?
/bin/chmod 755 "$home/Agent Guard"
(( rc == 1 )) && [[ -d $engine && -f $lb/pi ]] && /usr/bin/grep -qF "could not copy pi-sandbox-guard's files" "$out" &&
  pass 'exit 1, the engine and the Pi files kept' || { fail "uninstall (exit $rc)"; show }
point= ag uninstall
rc=$?
(( rc == 0 )) && [[ ! -e $engine ]] && /usr/bin/diff -r "$copy" "$run/legacy-M1" >/dev/null && pass 'the rerun copies it and removes Agent Guard' || { fail "rerun (exit $rc)"; show }
for p in fail:psg-uninstall-copy kill:psg-uninstall-copy; do
  label="uninstall $p"
  restore M1
  point=$p ag uninstall
  rc=$?
  (( rc != 0 )) && [[ -d $engine && -f $lb/pi && ! -e $copy ]] && pass "exit $rc, the engine kept" || { fail "uninstall (exit $rc)"; show }
  pi_entry_points
  point= ag uninstall
  rc=$?
  (( rc == 0 )) && pass 'the rerun finishes' || { fail "rerun (exit $rc)"; show }
  same 'the end state is as after one uninstall' "$run/uninstalled.snapshot" home_snapshot
done

# --- Updates: the same Pi files are left alone; a changed one is replaced by the
# same switch actions while a Pi session runs; a kill there is recovered.
label='update, Pi files unchanged'
restore M1
inodes() { /usr/bin/stat -f '%N %i' "$lb"/{pi,omp,pi-sandbox.sb,pi-sandbox-preamble.zsh} "$ext" "$ext"/**/*(DN) }
before=$(inodes)
print -r -- v0.0.2 > "$served/latest.txt"
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.version == "0.0.2"' "$state/stamp.json" >/dev/null && pass 'updated to 0.0.2' || { fail "update (exit $rc)"; show }
[[ $(inodes) == "$before" ]] && pass 'no Pi file was replaced' || fail 'a Pi file was replaced'
point= ag version
rc=$?
(( rc == 0 )) && pass 'no drift' || { fail "version (exit $rc)"; show }
label='update, the profile changed'
restore M1
print -r -- v0.0.3 > "$served/latest.txt"
session
point= pgrep_status=real ag update
rc=$?
pgrep_status=
kill $session_pid; wait $session_pid 2>/dev/null
(( rc == 0 )) && /usr/bin/grep -qx ';; v0.0.3' "$lb/pi-sandbox.sb" && /usr/bin/cmp -s "$lb/pi-sandbox.sb" "$engine/current/profiles/pi/sandbox/pi-sandbox.sb" &&
  pass 'updated while a Pi session runs; the profile is replaced' || { fail "update (exit $rc)"; show }
save updated
pi_state > "$run/updated.state"
label='update kill:pi-profile'
restore M1
point=kill:pi-profile ag update
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
pi_entry_points
point= ag update
rc=$?
(( rc == 0 )) && pass 'rerun recovers and updates' || { fail "rerun (exit $rc)"; show }
same 'the state is as after an uninterrupted update' "$run/updated.state" pi_state
print -r -- v0.0.1 > "$served/latest.txt"

# --- Fresh install over a real Pi in npm's user prefix: ~/.local/bin/pi is npm's
# relative link to dist/cli.js. It is recorded, replaced, kept and put back.
label='fresh install over npm link'
restore bare
fake_pi "$home/.local/$pkg"
/bin/ln -s "../$pkg" "$lb/pi"
save npm
pi_files > "$run/npm.files"
# The install inherits BASH_ENV and NODE_OPTIONS=--require naming files that log
# each bash and node that loads them. No bash or node the Pi harness starts loads
# them; OpenCode's fake CLI, a Node script, may.
hooks="$run/hooks"
/bin/mkdir -p "$hooks"
print -r -- "printf 'bash %s\n' \"\$0 \${BASH_EXECUTION_STRING:-}\" >> '$hooks/ran' 2>/dev/null" > "$hooks/bash-env.sh"
print -r -- "try { require('fs').appendFileSync('$hooks/ran', 'node ' + process.argv.slice(1).concat(process.execArgv).join(' ') + '\n'); } catch {}" > "$hooks/require.cjs"
extra_env=(BASH_ENV="$hooks/bash-env.sh" NODE_OPTIONS="--require \"$hooks/require.cjs\"")
/usr/bin/env -i PATH="$base" $extra_env /bin/bash -c : && /usr/bin/env -i PATH="$base" $extra_env "$node_bin" -e 0
ran=(${(f)"$(<"$hooks/ran")"})
(( $#ran == 2 )) && pass 'a bash and a node started with these variables run the files' || fail "the files ran: ${(j:; :)ran}"
: > "$hooks/ran"
point= boot
rc=$?
extra_env=()
(( rc == 0 )) && /usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null && pass 'installed with Pi (exit 0)' || { fail "install (exit $rc)"; show; }
ran=(${(f)"$(<"$hooks/ran")"})
ran=(${ran:#node $source_root/test/fake-opencode.mjs*})
(( $#ran == 0 )) && pass "no bash or node the Pi harness started ran them" || fail "they ran in: ${(j:; :)ran}"
[[ -f $lb/pi && ! -L $lb/pi && -f $lb/omp ]] && /usr/bin/cmp -s "$lb/pi" "$engine/current/profiles/pi/launchers/pi" && pass "the guard's launchers in ~/.local/bin" || fail 'launchers'
[[ $(/usr/bin/grep -v '^#' "$conf") == "pi=$home/.local/$pkg"$'\n'"node=$want_node" && $(/usr/bin/stat -f %Lp "$conf") == 600 ]] &&
  pass 'executables.conf records pi= and the node its shebang needs, mode 600' || { fail 'executables.conf'; /bin/cat "$conf" 2>&1 | /usr/bin/sed 's/^/    /' }
[[ -L $replaced/pi && $(/usr/bin/readlink "$replaced/pi") == "../$pkg" ]] && pass 'the replaced link is kept with its original target text' || fail 'replaced link'
/usr/bin/grep -qF "~/.local/bin/pi was not the guard's launcher; it is replaced and kept in" "$out" && pass 'the replacement is reported' || { fail 'report'; show }
[[ $(<"$ext/.guard-node") == "$want_node" ]] && pass ".guard-node holds $want_node" || fail ".guard-node: $(<"$ext/.guard-node")"
/usr/bin/grep -qF 'ok   pi --version through bin/pi: fake pi 0.70.0' "$out" && /usr/bin/grep -qF 'skip omp --version through bin/omp' "$out" &&
  pass 'the gate runs Pi and skips OMP, which has no binding and no CLI' || { fail 'gate'; show }
pi_state > "$run/npm.state"
pi_probe '~/.local/bin/pi' "$lb/pi"
point= ag uninstall
rc=$?
(( rc == 0 )) && [[ -L $lb/pi && $(/usr/bin/readlink "$lb/pi") == "../$pkg" && ! -e $lb/omp && ! -e $engine ]] &&
  pass "uninstall puts npm's link back and removes omp" || { fail "uninstall (exit $rc)"; show }
# A failure in the switch puts the link back and removes what the install added,
# folders included; a kill between the bindings and the launcher leaves the link or
# the guard at ~/.local/bin/pi, and the rerun ends as the uninterrupted install.
for p in pi-bindings pi-launcher-omp; do
  label="fresh install over npm link, fail:$p"
  restore npm
  point=fail:$p boot
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -qF 'the switch failed' "$out" && pass "exit $rc" || { fail "exit $rc"; show }
  same "npm's link and the Pi folders are as before" "$run/npm.files" pi_files
  [[ ! -e $engine && ! -e $home/.pi && ! -e ${conf:h} ]] && pass 'no engine, ~/.pi or bindings folder' || fail 'folders left'
done
for p in pi-bindings pi-launcher-pi; do
  label="fresh install over npm link, kill:$p"
  restore npm
  point=kill:$p boot
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
  [[ -L $lb/pi && $(/usr/bin/readlink "$lb/pi") == "../$pkg" ]] || /usr/bin/grep -qs pi-sandbox-guard "$lb/pi" &&
    pass "~/.local/bin/pi is npm's link or the guard's launcher" || fail "~/.local/bin/pi is neither"
  point= boot
  rc=$?
  (( rc == 0 )) && pass 'rerun recovers and finishes' || { fail "rerun (exit $rc)"; show }
  same 'the state is as after an uninterrupted install' "$run/npm.state" pi_state
done

# A Mac where only OMP is found gets the guard too, with the analyzer's Node.
label='fresh install, OMP only'
restore bare
fake_omp "$home/.bun/bin/omp"
point= boot
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null && [[ $(<"$ext/.guard-node") == "$want_node" ]] &&
  pass 'installed with the analyzer Node' || { fail "install (exit $rc)"; show }

# An OMP binary stored at ~/.local/bin/omp would be overwritten: refused before any change.
label='fresh install over an OMP binary'
restore bare
fake_omp "$lb/omp"
pi_files > "$run/omp.files"
pi_path=$lb
point= boot
rc=$?
pi_path=
(( rc != 0 )) && /usr/bin/grep -qF "~/.local/bin/omp is the OMP executable itself" "$out" && /usr/bin/grep -qF 'agent-guard bind --omp PATH' "$out" &&
  pass "exit $rc, says to move it and bind it" || { fail "exit $rc"; show }
same 'nothing changed' "$run/omp.files" pi_files
[[ ! -e $engine ]] && pass 'no engine folder' || fail 'engine folder left'

# --- Agent Guard installed before pi-sandbox-guard: agent-guard update at the
# installed version finds the migration pending and runs it.
label='update at the same version'
restore bare
point= boot
rc=$?
(( rc == 0 )) && /usr/bin/jq -e '.harnesses == ["opencode"]' "$state/stamp.json" >/dev/null && pass 'installed without Pi' || { fail "install (exit $rc)"; show }
save opencode-only
fake_pi "$pi_bin"
fake_omp "$omp_bin"
psg_install || { fail "pi-sandbox-guard's deploy scripts (exit $?)"; show }
point= ag update
rc=$?
(( rc == 0 )) && ! /usr/bin/grep -q 'is current\.' "$out" && /usr/bin/grep -qF 'migrating from pi-sandbox-guard' "$out" &&
  /usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null && pass 'update migrates pi-sandbox-guard' || { fail "update (exit $rc)"; show }
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'is current\.' "$out" && pass 'the next update finds nothing pending' || { fail "second update (exit $rc)"; show }
# A Pi installed after Agent Guard is a newly found harness: update installs it.
label='update at the same version, Pi found'
restore opencode-only
fake_pi "$home/.local/$pkg"
/bin/ln -s "../$pkg" "$lb/pi"
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/grep -qF 'installing it again for Pi and OMP' "$out" && /usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null &&
  [[ -L $replaced/pi ]] && /usr/bin/grep -qs pi-sandbox-guard "$lb/pi" && pass 'update installs the Pi harness' || { fail "update (exit $rc)"; show }

# --- Both old guards on one Mac: one command migrates OpenCode Guard, then
# pi-sandbox-guard. OpenCode Guard's own installer stops on macOS 15 (test/migrate.sh).
label='both old guards'
if [[ $(/usr/bin/sw_vers -productVersion) == 15.* ]]; then
  print -r -- "skip $label: OpenCode Guard's installer stops on macOS 15"
else
  restore psg
  run_timeout 120 /usr/bin/env -i HOME="$home" PATH="$base" /bin/zsh "$fixtures/opencode-guard-1.0.4/install.sh" --projects "$home/Projects" < /dev/null > "$out" 2>&1 ||
    { fail "OpenCode Guard 1.0.4's install.sh (exit $?)"; show }
  text=$(/usr/bin/curl -fsSL "$url/releases/download/v0.0.1/install.sh")
  envv
  run_timeout 600 /usr/bin/expect -f "$source_root/test/tty.exp" "$out" y $reply /bin/zsh -c "$text" install.sh --projects "$home/Projects"
  rc=$?
  lines=("${(@f)$(<"$out")}")
  i=${lines[(i)migrating from OpenCode Guard*]} j=${lines[(i)migrating from pi-sandbox-guard*]}
  (( rc == 0 && i < j && j <= $#lines )) &&
    pass 'one command migrates OpenCode Guard, then pi-sandbox-guard' || { fail "exit $rc"; show }
  /usr/bin/jq -e 'map(.from) == ["opencode-guard", "pi-sandbox-guard"] and all(.[]; .retired == true)' "$state/migration.json" >/dev/null &&
    /usr/bin/jq -e '.harnesses == ["opencode", "pi"]' "$state/stamp.json" >/dev/null && [[ -f $legacy/local-bin/pi ]] &&
    pass 'both are retired; the stamp lists opencode and pi' || { fail 'records'; /bin/cat "$state/migration.json" }
  pi_entry_points
fi

finish

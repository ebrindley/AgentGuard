#!/bin/zsh
# The Grok harness in the installer (docs/DESIGN.md section 3, Grok): install over
# Grok's own link, a failure and a kill at each test point, the update, doctor,
# the link replaced behind the guard's back, and uninstall putting the original
# link back. Releases are served by test/release-server.mjs and installed with
# the one-line bootstrap into a disposable home with a fake OpenCode CLI
# (test/fake-opencode.mjs) and a stand-in grok. Runs outside any sandbox, from a
# checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
unset AGENT_GUARD_RELEASE AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED
command -v node >/dev/null || { print -ru2 'Node is required for the release server and the fake OpenCode'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
integer fails=0 checks=0
label=
pass() { checks+=1; print -r -- "ok   ${label:+$label: }$*" }
fail() { checks+=1; fails+=1; print -r -- "FAIL ${label:+$label: }$*" }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-grok-install-XXXXXX")
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
  label=coverage
  for p in $grok_points; do (( ${exercised[(Ie)$p]} )) || missing+=("$p"); done
  (( $#missing == 0 )) && pass "all $#grok_points Grok test points are exercised" || fail "Grok test points not exercised: $missing"
  kill $server 2>/dev/null
  wait $server 2>/dev/null
  /bin/chmod -R u+w "$run" 2>/dev/null
  /bin/rm -r "$run"
  print -r -- "$checks checks, $fails failure(s)"
  (( fails == 0 ))
  exit
}

new_home "$run/home"
home=$REPLY
engine="$home/Library/Application Support/AgentGuard"
state="$engine/state"
lb="$home/.local/bin"
grok="$home/.grok"
darwin_temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
node_bin=${$(command -v node):A}
fakebin="$run/fakebin" nodebin="$run/nodebin"
/bin/mkdir -p "$fakebin" "$nodebin"
print -r -- "#!/bin/sh
exec '$node_bin' '$source_root/test/fake-opencode.mjs' \"\$@\"" > "$fakebin/opencode"
/bin/chmod 755 "$fakebin/opencode"
/bin/ln -s "$node_bin" "$nodebin/node"
base="$fakebin:$nodebin:/usr/bin:/bin:/usr/sbin:/sbin"

build() { node "$adapter" release "$1" "$served" "$home" "v$2" "$2" "$url" >/dev/null }
build "$source_root" 0.0.1 || { print -ru2 'cannot build v0.0.1'; finish }
build "$source_root" 0.0.2 || { print -ru2 'cannot build v0.0.2'; finish }
print -r -- v0.0.1 > "$served/latest.txt"

point=
note_point() { local p; for p in ${=point}; do exercised+=("${p#*:}"); done }
envv() { reply=(/usr/bin/env -i HOME="$home" PATH="$base" TMPDIR="$darwin_temp/" AG_TEST_POINT="$point") }
boot() {
  local text
  text=$(/usr/bin/curl -fsSL "$url/releases/download/${1:-v0.0.1}/install.sh") || return 99
  note_point
  envv
  run_timeout 600 $reply /bin/zsh -c "$text" install.sh --projects "$home/Projects" < /dev/null > "$run/out" 2>&1
}
ag() {
  note_point
  envv
  run_timeout 600 $reply "$engine/bin/agent-guard" "$@" < /dev/null > "$run/out" 2>&1
}
show() { print -r -- "$(<"$run/out")" | /usr/bin/sed 's/^/    | /' }
sha() { /usr/bin/shasum -a 256 < "$1" 2>/dev/null }

# The stand-in grok installed as Grok does: ~/.grok/bin/grok -> ../downloads/<file>,
# and ~/.local/bin/grok -> ~/.grok/bin/grok. It prints its version, or the
# arguments it was started with.
/bin/mkdir -p "$lb" "$grok/bin" "$grok/downloads"
print -r -- '#!/bin/zsh -f
if (( ${argv[(Ie)--version]} )); then print -r -- "grok 1.0.0"; exit 0; fi
print -r -- "argv:${(j:|:)@}"' > "$grok/downloads/grok-1.0.0"
/bin/chmod 755 "$grok/downloads/grok-1.0.0"
/bin/ln -s ../downloads/grok-1.0.0 "$grok/bin/grok"
/bin/ln -s "$grok/bin/grok" "$lb/grok"
print -r -- 'path=("$HOME/.local/bin" $path)' > "$home/.zshenv"
print -r -- "path=(\"$fakebin\" \$path)" > "$home/.zprofile"
print -r -- 'export EDITOR=vi' > "$home/.zshrc"
original=$(/usr/bin/readlink "$lb/grok")
save() { /bin/rm -rf "$run/saved-$1"; /bin/cp -Rp "$home" "$run/saved-$1" }
restore() { /bin/chmod -R u+w "$home" 2>/dev/null; /bin/rm -r "$home"; /bin/cp -Rp "$run/saved-$1" "$home" }
save fresh

# grok_state: the link, the record, the replaced entry and the stamp's harnesses.
grok_state() {
  [[ -L $lb/grok ]] && print -r -- "link -> $(/usr/bin/readlink "$lb/grok")" || print -r -- "link absent"
  [[ -f $state/grok-executable ]] && print -r -- "record $(<"$state/grok-executable")" || print -r -- "record absent"
  [[ -L $state/grok-replaced/grok ]] && print -r -- "replaced -> $(/usr/bin/readlink "$state/grok-replaced/grok")" || print -r -- "replaced absent"
}

label=install
boot
rc=$?
(( rc == 0 )) && pass 'installed (exit 0)' || { fail "install (exit $rc)"; show; finish }
rid=$(<"$engine/current/RELEASE")
[[ -L $lb/grok && $(/usr/bin/readlink "$lb/grok") == "$engine/bin/grok" ]] && pass '~/.local/bin/grok links to the launcher' || fail "link: $(grok_state)"
[[ $(<"$state/grok-executable") == "$grok/bin/grok" ]] && pass 'the real executable is recorded' || fail "record: $(grok_state)"
[[ -L $state/grok-replaced/grok && $(/usr/bin/readlink "$state/grok-replaced/grok") == "$original" ]] && pass 'the replaced link is kept' || fail "replaced: $(grok_state)"
/usr/bin/jq -e '.harnesses == ["opencode", "grok"] and (.links | has("'"$lb/grok"'"))' "$state/stamp.json" >/dev/null && pass 'the stamp lists grok and its link' || fail "stamp: $(/usr/bin/jq -c '[.harnesses, .links]' "$state/stamp.json")"
[[ $("$lb/grok" --version) == 'grok 1.0.0' && $(/usr/bin/head -1 "$home/Agent Guard/last-launch-grok.log") == "Agent Guard cli $rid "* ]] &&
  pass 'grok --version runs the real executable through the guard' || fail 'launch through the link'
[[ $("$lb/grok" -p hi) == 'argv:--sandbox|off|-p|hi' ]] && pass 'the arguments reach it with --sandbox off' || fail 'arguments'
[[ -f $engine/current/profiles/grok/args.zsh && -x $engine/current/bin/grok ]] && pass "the release holds Grok's files and bin/grok" || fail 'release files'
ag doctor
rc=$?
(( rc == 0 )) && pass 'doctor passes' || { fail "doctor (exit $rc)"; show }
for l in 'ok   grok in a new terminal window resolves to' 'ok   grok in zsh -c resolves to' 'ok   Grok executable' 'ok   Grok settings write denied' 'ok   Grok runs locally'; do
  /usr/bin/grep -qF -- "$l" "$run/out" && pass "doctor: $l" || { fail "doctor lacks: $l"; show }
done
ag version
(( $? == 0 )) && pass 'version: no drift' || { fail 'version reports drift'; show }

label=update
grok_state > "$run/state.1"
boot v0.0.2
rc=$?
(( rc == 0 )) && pass 'updated (exit 0)' || { fail "update (exit $rc)"; show; finish }
[[ $(grok_state) == "$(<"$run/state.1")" ]] && pass 'link, record and replaced link are unchanged' || fail "state changed: $(grok_state)"
[[ $("$lb/grok" --version) == 'grok 1.0.0' ]] && pass 'grok still runs' || fail 'grok after update'

label=drift
/bin/rm "$lb/grok"
/bin/ln -s "$grok/bin/grok" "$lb/grok"
ag doctor
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF 'FAIL grok in zsh -c resolves to' "$run/out" && pass 'doctor fails when the link is put back' || { fail "doctor after the link was replaced (exit $rc)"; show }

label=uninstall
ag uninstall
rc=$?
(( rc == 0 )) && pass 'uninstalled (exit 0)' || { fail "uninstall (exit $rc)"; show }
[[ -L $lb/grok && $(/usr/bin/readlink "$lb/grok") == "$original" && ! -e $engine ]] && pass 'the original link is in place and the engine is gone' || fail "after uninstall: $(grok_state); engine $([[ -e $engine ]] && print present)"

label=reinstall
boot
(( $? == 0 )) && pass 'installed again' || { fail 'reinstall'; show; finish }
ag uninstall
(( $? == 0 )) && [[ $(/usr/bin/readlink "$lb/grok") == "$original" ]] && pass 'uninstall again restores the link' || { fail 'second uninstall'; show }

# A failure and a kill at each point leave the original link or a finished install.
for p in grok-binding grok-shim grok-keep; do
  label="fail:$p"
  restore fresh
  point="fail:$p"
  boot
  rc=$?
  point=
  if (( rc != 0 )) && [[ $(/usr/bin/readlink "$lb/grok") == "$original" && ! -e $engine/state/grok-executable ]]; then pass 'the install fails and rolls back to the original link, with no record'
  else
    # grok-keep runs after the stamp; the install is then finished by the next run.
    [[ $p == grok-keep ]] && (( rc != 0 )) && { boot; (( $? == 0 )) && [[ -L $state/grok-replaced/grok ]] && pass 'the next run finishes the keep step'; } || { fail "after a failure at $p (exit $rc): $(grok_state)"; show }
  fi
  label="kill:$p"
  restore fresh
  point="kill:$p"
  boot
  point=
  boot
  (( $? == 0 )) && [[ $(/usr/bin/readlink "$lb/grok") == "$engine/bin/grok" && $(<"$state/grok-executable") == "$grok/bin/grok" && -L $state/grok-replaced/grok ]] &&
    pass 'killed there, the next run leaves a working install' || { fail "after a kill at $p: $(grok_state)"; show }
  ag doctor
  (( $? == 0 )) && pass 'doctor passes after recovery' || { fail 'doctor after recovery'; show }
done

# A file of the user's at ~/.local/bin/grok is kept and put back, and a Mac without Grok is left alone.
label=file
restore fresh
/bin/rm "$lb/grok"
print -r -- '#!/bin/sh' > "$lb/grok"
/bin/chmod 755 "$lb/grok"
boot
(( $? == 0 )) && [[ -f $state/grok-replaced/grok && ! -L $state/grok-replaced/grok ]] && pass 'a regular file is replaced and kept' || { fail 'install over a file'; show }
ag uninstall
[[ -f $lb/grok && ! -L $lb/grok && $(<"$lb/grok") == '#!/bin/sh' ]] && pass 'uninstall puts the file back' || fail 'file after uninstall'
label=none
restore fresh
/bin/rm "$lb/grok" "$grok/bin/grok"
boot
(( $? == 0 )) && [[ ! -e $lb/grok && ! -e $state/grok-executable ]] && /usr/bin/jq -e '.harnesses == ["opencode"]' "$state/stamp.json" >/dev/null && pass 'without Grok nothing is installed for it' || { fail 'install without Grok'; show }

finish

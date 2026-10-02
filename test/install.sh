#!/bin/zsh
# Installer cases from design section 9.4 (step 4): B5, B8, the kill matrix,
# S1-S6, G1-G5, T1, T2, U1-U4, X1-X7 and P1-P5. F1 and F2, the refusal of an
# OpenCode Guard install, became the migration (test/migrate.sh). Builds test releases
# served by test/release-server.mjs and installs them in a disposable home with the
# fake CLI (test/fake-opencode.mjs) and a fake OpenCode.app; test/test.sh runs the
# installer with the real CLI. Runs outside any sandbox, from a checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
unset AGENT_GUARD_RELEASE AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED
command -v node >/dev/null || { print -ru2 'Node is required for the release server and the fake CLI'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
integer fails=0 checks=0
label=
pass() { checks+=1; print -r -- "ok   ${label:+$label: }$*" }
fail() { checks+=1; fails+=1; print -r -- "FAIL ${label:+$label: }$*" }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-install-XXXXXX")
run=${run:A}
served="$run/served"
/bin/mkdir -p "$served"
node "$source_root/test/release-server.mjs" "$served" > "$run/port" 2> "$run/server.log" &
server=$!
for i in {1..100}; do [[ -s $run/port ]] && break; sleep 0.05; done
port=$(<"$run/port")
[[ $port == <-> ]] || { print -ru2 "release server did not start: $(<"$run/server.log")"; kill $server; exit 1 }
url="http://127.0.0.1:$port/ebrindley/AgentGuard"
finish() {
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
plugins="$home/.config/opencode/plugins"
plugin="$plugins/agent-guard.js"
cc="$home/.cc-safety-net/rules"
app="$home/Applications/Agent Guard.app"
cfg="$home/.config/opencode/opencode.json"
list="$home/Agent Guard/Guard List.txt"
out="$run/out"
original='{"model":"m","permission":{"bash":{"ls *":"allow","*":"ask"},"task":"ask"}}'

# The fake CLI, first on PATH, and a copy whose --version fails (a post-switch failure).
node_bin=${$(command -v node):A}
fake="$source_root/test/fake-opencode.mjs"
fakebin="$run/fakebin" failbin="$run/failbin"
/bin/mkdir -p "$fakebin" "$failbin"
print -r -- "#!/bin/sh
exec '$node_bin' '$fake' \"\$@\"" > "$fakebin/opencode"
print -r -- "#!/bin/sh
[ \"\$1\" = --version ] && exit 3
exec '$node_bin' '$fake' \"\$@\"" > "$failbin/opencode"
/bin/chmod 755 "$fakebin/opencode" "$failbin/opencode"
system_path=/usr/bin:/bin:/usr/sbin:/sbin
base="$fakebin:$system_path"
tpath=$base

# Releases: A (v0.0.1) from this checkout; B (v0.0.2) with another app icon, so an
# update rebuilds the app; v0.0.3-broken, B whose profile lets the guard write the
# engine's state folder (design A14).
build() { node "$adapter" release "$1" "$served" "$home" "v$2" "$2" "$url" >/dev/null }
copy_source() { /bin/mkdir -p "$2" && /bin/cp -R "$1"/{engine,profiles,installer,scripts,install.sh,LICENSE} "$2/" }
build "$source_root" 0.0.1 || { print -ru2 'cannot build v0.0.1'; finish }
copy_source "$source_root" "$run/src-b"
print -n x >> "$run/src-b/profiles/opencode/assets/AgentGuard.icns"
build "$run/src-b" 0.0.2 || { print -ru2 'cannot build v0.0.2'; finish }
copy_source "$run/src-b" "$run/src-broken"
/usr/bin/sed -i '' '/^  (subpath (h "\/Library\/Application Support\/AgentGuard"))$/d' "$run/src-broken/engine/profile.sb"
/usr/bin/sed -i '' 's|^writable=(|writable=("$engine/state" |' "$run/src-broken/profiles/opencode/harness.zsh"
if /usr/bin/grep -qF '(subpath (h "/Library/Application Support/AgentGuard"))' "$run/src-broken/engine/profile.sb" ||
   ! /usr/bin/grep -q '^writable=("$engine/state" ' "$run/src-broken/profiles/opencode/harness.zsh"; then
  print -ru2 'cannot make the broken release'
  finish
fi
build "$run/src-broken" 0.0.3-broken || { print -ru2 'cannot build v0.0.3-broken'; finish }
latest() { print -r -- "$1" > "$served/latest.txt" }

point=
# boot TAG [ARGS...]: the one-liner with TAG's bootstrap, or the latest release's.
boot() {
  local tag=$1 u text
  shift
  u="$url/releases/download/$tag/install.sh"
  [[ $tag == latest ]] && u="$url/releases/latest/download/install.sh"
  text=$(/usr/bin/curl -fsSL "$u") || return 99
  run_timeout 180 /usr/bin/env -i HOME="$home" PATH="$tpath" AG_TEST_POINT="$point" /bin/zsh -c "$text" install.sh "$@" < /dev/null > "$out" 2>&1
}
# ag ARGS...: the installed agent-guard command.
ag() {
  run_timeout 180 /usr/bin/env -i HOME="$home" PATH="$tpath" AG_TEST_POINT="$point" "$engine/bin/agent-guard" "$@" < /dev/null > "$out" 2>&1
}
save() { /bin/rm -rf "$run/saved-$1"; /bin/cp -Rp "$home" "$run/saved-$1" }
restore() { /bin/chmod -R u+w "$home" 2>/dev/null; /bin/rm -rf "$home"; /bin/cp -Rp "$run/saved-$1" "$home" }
stamp_version() { if [[ -f $state/stamp.json ]]; then /usr/bin/jq -r .version "$state/stamp.json"; else print -r -- absent; fi }
current_rid() { if [[ -f $engine/current/RELEASE ]]; then print -r -- "$(<"$engine/current/RELEASE")"; else print -r -- absent; fi }
sha() { /usr/bin/shasum -a 256 < "$1" 2>/dev/null }
show() { print -r -- "$(<"$out")" | /usr/bin/sed 's/^/    | /' }
same_snapshot() {  # NAME FILE: the home's snapshot equals the one in FILE
  local now
  now=$(snapshot "$home")
  if [[ $now == "$(<$2)" ]]; then pass "$1"
  else fail "$1"; /usr/bin/diff <(print -r -- "$(<$2)") <(print -r -- "$now") | /usr/bin/sed 's/^/    /'
  fi
}
one_block() {  # FILE: one complete agent-guard block
  [[ $(/usr/bin/grep -cFx '# >>> agent-guard >>>' "$1") == 1 && $(/usr/bin/grep -cFx '# <<< agent-guard <<<' "$1") == 1 ]]
}
strip_block() {  # FILE: FILE without its agent-guard block
  /usr/bin/sed '/^# >>> agent-guard >>>$/,/^# <<< agent-guard <<<$/d' "$1"
}

# The disposable home: a .zprofile that puts the fake CLI first, as a user's own
# PATH line would; a symlinked .zshrc with mode 600; an OpenCode config; a rule.json
# with another rule and an override; a stale copy of the rulebook; the fake app.
/bin/mkdir -p "$home/dotfiles" "$cc/agent-guard"
print -r -- "path=(\"$fakebin\" \$path)" > "$home/.zprofile"
print -r -- 'export EDITOR=vi' > "$home/dotfiles/zshrc"
/bin/chmod 600 "$home/dotfiles/zshrc"
/bin/ln -s "$home/dotfiles/zshrc" "$home/.zshrc"
print -r -- "$original" > "$cfg"
print -r -- '{"version":1,"rules":["custom"],"overrides":{"custom":{"x":1}},"transparent_wrappers":["env"]}' > "$cc/rule.json"
/usr/bin/jq -c . "$source_root/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" > "$cc/agent-guard/rulebook.json"
fake_app="$home/Applications/OpenCode.app"
/bin/mkdir -p "$fake_app/Contents/MacOS"
print -r -- '<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>FakeOpenCodeApp</string></dict></plist>' > "$fake_app/Contents/Info.plist"
/bin/cp "$fakebin/opencode" "$fake_app/Contents/MacOS/FakeOpenCodeApp"
pre="$run/clean.snapshot"
snapshot "$home" > "$pre"
/bin/cp "$home/.zprofile" "$run/clean-zprofile"
/bin/cp "$home/dotfiles/zshrc" "$run/clean-zshrc"
save clean

# --- B8: a release's own bootstrap URL installs that release, whatever is latest.
# S4 and S6 on the result.
label=B8
latest v0.0.2
boot v0.0.1 --projects "$home/Projects"
rc=$?
if (( rc == 0 )); then pass 'v0.0.1 bootstrap installs while v0.0.2 is latest'; else fail "install v0.0.1 (exit $rc)"; show; finish; fi
[[ $(stamp_version) == 0.0.1 && $(<"$engine/current/VERSION") == 0.0.1 ]] && pass 'stamp and current name 0.0.1' || fail 'stamp and current name 0.0.1'
rid_a=$(current_rid)
label=S4
[[ -L $home/.zshrc && $(/usr/bin/readlink "$home/.zshrc") == "$home/dotfiles/zshrc" ]] && pass '.zshrc is still a link to its target' || fail '.zshrc is still a link'
[[ $(/usr/bin/stat -f %Lp "$home/dotfiles/zshrc") == 600 ]] && pass 'the target keeps mode 600' || fail 'the target keeps mode 600'
one_block "$home/dotfiles/zshrc" && one_block "$home/.zprofile" && pass 'one PATH block in the target and in .zprofile' || fail 'one PATH block each'
/usr/bin/grep -qFx 'export EDITOR=vi' "$home/dotfiles/zshrc" && pass "the target keeps its contents" || fail "the target keeps its contents"
label=S6
/usr/bin/jq -e '.rules == ["agent-guard", "custom"] and .overrides == {"custom": {"x": 1}}' "$cc/rule.json" >/dev/null &&
  pass 'rule.json keeps the other rule and its override' || fail 'rule.json keeps the other rule and its override'
/usr/bin/cmp -s "$cc/agent-guard/rulebook.json" "$source_root/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" &&
  pass "the stale rulebook is replaced by the release's" || fail "the stale rulebook is replaced by the release's"
save A
snapshot "$home" > "$run/A.snapshot"

# --- B5 (design A10): the bootstrap's stage survives the installer's recovery; a
# rerun after a kill there, or after the bootstrap's last point, installs.
label=B5
for p in after-unpack txn-open; do
  restore clean
  point=kill:$p boot v0.0.1 --projects "$home/Projects"
  rc=$?
  (( rc == 137 )) && pass "killed at $p" || { fail "killed at $p (exit $rc)"; show }
  if [[ $p == txn-open ]]; then
    staged=("$engine"/stage/*/tree/agent-guard-0.0.1/profiles/opencode/install.sh(N))
    (( $#staged == 1 )) && [[ -d $state/txn ]] && pass 'the installer found stage/<txn>/tree intact after the handoff and its recovery' ||
      fail 'stage/<txn>/tree intact after the handoff'
  fi
  point= boot v0.0.1 --projects "$home/Projects"
  rc=$?
  (( rc == 0 )) && [[ $(stamp_version) == 0.0.1 && -z $(print -l "$engine"/stage/*(DN)) && ! -e $state/txn ]] &&
    pass "rerun after kill:$p installs and leaves no stage or transaction" || { fail "rerun after kill:$p (exit $rc)"; show }
done

# --- Kill matrix on a fresh install: every S, C and K point (design 9.4), then
# the entry points (9.3), then a rerun of the one-liner, which recovers and must
# end as a full install followed by a rerun does. P3 and S3 ride along.
restore A
point= boot v0.0.1 --projects "$home/Projects" || { fail 'rerun over A'; show }
snapshot "$home" > "$run/fresh-ref.snapshot"
fresh_points=(rulebook rulejson app app-gap current plugin perm-recorded rc doctor-live launch-check stamp cleanup)
for p in $fresh_points; do
  label="K fresh kill:$p"
  restore clean
  point=kill:$p boot v0.0.1 --projects "$home/Projects"
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show; continue }
  case $p in
    (plugin)
      label="S3 kill:plugin"
      others=("$plugins"/*(DN:t))
      [[ -L $plugins/.agent-guard.js.partial && ! -e $plugin ]] && pass 'the link waits under its temporary name' || fail 'the link waits under its temporary name'
      [[ -z ${(M)others:#(#i)*.(js|ts)} ]] && pass "no other file in the plugin folder is a .js or .ts name: ${(j:, :)others}" ||
        fail "a .js or .ts name in the plugin folder: ${(j:, :)others}"
      label="K fresh kill:$p" ;;
    (rc)
      for f t in "$home/.zprofile" "$run/clean-zprofile" "$home/dotfiles/zshrc" "$run/clean-zshrc"; do
        /usr/bin/cmp -s "$f" "$t" || { one_block "$f" && /usr/bin/cmp -s <(strip_block "$f") "$t" } &&
          pass "S4 ${f:t} holds its old content or the old content plus one block" || fail "S4 ${f:t} is neither old nor new"
      done ;;
    (stamp) [[ $(stamp_version) == absent ]] && pass 'T1 no stamp before the commit point' || fail 'T1 no stamp before the commit point' ;;
  esac
  probe_entry_points "$home" "$base" "$base" "$pre"
  point= boot v0.0.1 --projects "$home/Projects"
  rc=$?
  (( rc == 0 )) && pass 'rerun recovers and installs' || { fail "rerun (exit $rc)"; show }
  same_snapshot 'final state equals a full install and a rerun' "$run/fresh-ref.snapshot"
  if [[ $p == perm-recorded ]]; then
    /usr/bin/jq -e '.permission.edit == "allow" and .permission.external_directory == "allow" and .permission.bash["*"] == "allow"' "$cfg" >/dev/null &&
      pass 'P3 the rerun wrote allow' || fail 'P3 the rerun wrote allow'
    /usr/bin/jq -e --arg f "$cfg" '.[$f].edit.orig == null and .[$f].bash.orig == {"ls *": "allow", "*": "ask"}' "$state/permissions.json" >/dev/null &&
      pass 'P3 orig holds the original values' || fail 'P3 orig holds the original values'
  fi
done

# --- Kill matrix on an update from A to B, through agent-guard update: every P,
# S, C and K point. A config.json added after A has no record entry, so the
# permission step writes it. The rerun is agent-guard update again.
restore A
print -r -- '{"theme":"x"}' > "$home/.config/opencode/config.json"
save Aplus
latest v0.0.2
point= ag update
rc=$?
(( rc == 0 )) && [[ $(stamp_version) == 0.0.2 ]] || { fail "update A+ to B (exit $rc)"; show }
snapshot "$home" > "$run/update-ref.snapshot"
update_points=(txn-open assemble build list selftest-staged $fresh_points)
for p in $update_points; do
  label="K update kill:$p"
  restore Aplus
  point=kill:$p ag update
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show; continue }
  case $p in
    (rc) one_block "$home/.zprofile" && one_block "$home/dotfiles/zshrc" && pass 'S4 both startup files keep one block' || fail 'S4 a startup file lost its block' ;;
    (stamp) [[ $(stamp_version) == 0.0.1 ]] && pass 'T1 the stamp still names 0.0.1' || fail 'T1 the stamp still names 0.0.1' ;;
  esac
  probe_entry_points "$home" "$base" "$engine/bin:$base"
  point= ag update
  rc=$?
  (( rc == 0 )) && [[ $(stamp_version) == 0.0.2 ]] && pass 'rerun recovers; stamp 0.0.2' || { fail "rerun (exit $rc)"; show }
  same_snapshot 'final state equals an uninterrupted update' "$run/update-ref.snapshot"
done

# --- A6: a kill during a rollback; the next run continues the rollback whatever
# its caller. The rollback follows a failed launch check (the CLI's --version fails).
label=A6
restore A
tpath="$failbin:$system_path" point=kill:rollback ag update
rc=$?
(( rc == 137 )) && /usr/bin/grep -qx 'rollback begun' "$state/txn/journal" 2>/dev/null &&
  pass 'killed after journaling rollback begun' || { fail "killed in the rollback (exit $rc)"; show }
probe_entry_points "$home" "$base" "$engine/bin:$base"
latest v0.0.1
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'Agent Guard 0.0.1 is current.' "$out" && [[ ! -e $state/txn ]] &&
  pass 'agent-guard update finishes the rollback, then finds 0.0.1 current' || { fail "update after the killed rollback (exit $rc)"; show }
same_snapshot 'A is back as before the update' "$run/A.snapshot"

# --- U1, S1, S2: agent-guard update from A to B while OpenCode launches run.
label=U1
restore A
record_hash=$(sha "$state/permissions.json")
latest v0.0.2
point=
ag update &
upid=$!
samples=()
while kill -0 $upid 2>/dev/null; do
  s=$(/usr/bin/env -i HOME="$home" PATH="$base" "$engine/bin/opencode" status 2>/dev/null)
  samples+=("${s:-none}")
done
wait $upid
rc=$?
(( rc == 0 )) && [[ $(stamp_version) == 0.0.2 ]] && pass 'agent-guard update installs 0.0.2' || { fail "update (exit $rc)"; show }
rid_b=$(current_rid)
label=S1
bad=()
for s in $samples; do
  [[ $s == (#b)'launcher='([^[:space:]]##)' status=Agent Guard '[^[:space:]]##' ('([^\)]##)') is active.' &&
     $match[1] == "$match[2]" && ( $match[1] == "$rid_a" || $match[1] == "$rid_b" ) ]] || bad+=("$s")
done
(( $#samples >= 3 )) && pass "$#samples launches during the update" || fail "only $#samples launches during the update"
(( $#bad == 0 )) && pass 'each was guarded and its plugin answered for the release that launched it, A or B' ||
  fail "launches that were not guarded or mixed releases: ${(j:; :)bad}"
label=S2
[[ $(sha "$state/permissions.json") == "$record_hash" ]] && pass 'the permission record is unchanged by the update' || fail 'the permission record changed'
save B
snapshot "$home" > "$run/B.snapshot"

# --- U2: latest equals the stamp.
label=U2
restore B
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'Agent Guard 0.0.2 is current.' "$out" && pass 'exit 0, "is current"' || { fail "update when current (exit $rc)"; show }
same_snapshot 'nothing changed' "$run/B.snapshot"

# --- U3, G5: the one-liner again repairs with a new release ID; folders older than
# the previous release go.
label=U3
restore B
point= boot latest
rc=$?
rid_c=$(current_rid)
(( rc == 0 )) && [[ $rid_c != "$rid_b" && $rid_c != absent ]] && pass "rerun installs a new release ID ($rid_c)" || { fail "rerun of B (exit $rc)"; show }
same_snapshot 'user data unchanged' "$run/B.snapshot"
label=G5
rels=("$engine"/releases/*(N:t)) want=("$rid_b" "$rid_c")
[[ ${(j: :)${(o)rels}} == ${(j: :)${(o)want}} ]] && pass 'releases/ holds the current and the previous release only' ||
  fail "releases/ holds: ${(j: :)rels}"

# --- G1: the staged check fails before the switch.
label=G1
restore A
point= boot v0.0.3-broken
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'FAIL protected write allowed' "$out" && pass "exit $rc; FAIL protected write allowed printed" || { fail "broken release (exit $rc)"; show }
[[ $(stamp_version) == 0.0.1 && $(current_rid) == "$rid_a" && ! -e $state/txn ]] && pass 'T1 stamp and current still A' || fail 'T1 stamp and current still A'
[[ $(print -l "$engine"/releases/*(N:t)) == "$rid_a" ]] && pass 'the staged release is gone' || fail 'the staged release is gone'
same_snapshot 'nothing changed' "$run/A.snapshot"
probe_entry_points "$home" "$base" "$engine/bin:$base"

# --- G2: a post-switch failure over A puts A back.
label=G2
restore A
record_hash=$(sha "$state/permissions.json")
point=fail:doctor-live boot v0.0.2
rc=$?
(( rc != 0 )) && pass "exit $rc" || { fail 'exit 0'; show }
[[ $(stamp_version) == 0.0.1 && $(current_rid) == "$rid_a" && ! -e $state/txn ]] && pass 'T1 stamp and current still A' || fail 'T1 stamp and current still A'
[[ $(sha "$state/permissions.json") == "$record_hash" ]] && pass 'S2 the permission record is unchanged' || fail 'S2 the permission record changed'
same_snapshot 'everything as before the update' "$run/A.snapshot"
probe_entry_points "$home" "$base" "$engine/bin:$base"

# --- G3: the same on a fresh install removes what the run added.
label=G3
restore clean
point=fail:doctor-live boot v0.0.1 --projects "$home/Projects"
rc=$?
(( rc != 0 )) && pass "exit $rc" || { fail 'exit 0'; show }
[[ ! -e $engine ]] && pass 'engine folder gone' || fail 'engine folder gone'
[[ $(<"$cfg") == "$original" ]] && pass 'config as before' || fail 'config as before'
[[ -f $list ]] && pass 'list kept' || fail 'list kept'
[[ ! -e $plugin && ! -L $plugin && ! -e $app ]] && /usr/bin/cmp -s "$home/.zprofile" "$run/clean-zprofile" &&
  /usr/bin/cmp -s "$home/dotfiles/zshrc" "$run/clean-zshrc" && pass 'no plugin, no app, startup files as before' || fail 'plugin, app or startup files left'

# --- G4: no CLI and no app: skipped checks do not fail the install.
label=G4
restore clean
/bin/rm -rf "$fake_app"
tpath=$system_path point= boot v0.0.1 --projects "$home/Projects"
rc=$?
(( rc == 0 )) && pass 'exit 0' || { fail "exit $rc"; show }
/usr/bin/grep -q 'skip plugin check (opencode CLI not found)' "$out" && /usr/bin/grep -q 'skip launch check (opencode CLI not found)' "$out" &&
  /usr/bin/grep -q 'OpenCode.app not found' "$out" && pass 'skip lines and the app warning printed' || { fail 'skip lines'; show }

# --- S5: a failed build over A leaves A's app.
label=S5
restore A
plist=$(sha "$app/Contents/Info.plist") scpt=$(sha "$app/Contents/Resources/Scripts/main.scpt")
point=fail:build boot v0.0.2
rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'stopped at build' "$out" && pass "exit $rc at build" || { fail "fail:build (exit $rc)"; show }
[[ $(sha "$app/Contents/Info.plist") == "$plist" && $(sha "$app/Contents/Resources/Scripts/main.scpt") == "$scpt" ]] &&
  pass "the app's Info.plist and main.scpt are unchanged" || fail "the app changed"
[[ -z $(print -l "$engine"/stage/*(DN)) && ! -e $state/txn ]] && pass 'no stage or transaction left' || fail 'stage or transaction left'

# --- T2: version names a changed file.
label=T2
restore B
point= ag version
rc=$?
(( rc == 0 )) && /usr/bin/grep -q "^Agent Guard 0.0.2 (v0.0.2, commit [0-9a-z]*), release $rid_b, installed " "$out" &&
  pass 'exit 0 and the stamp line for a clean install' || { fail "version (exit $rc)"; show }
changed="$engine/releases/$rid_b/profiles/opencode/hooks.zsh"
print -r -- '# changed' >> "$changed"
point= ag version
rc=$?
(( rc == 1 )) && /usr/bin/grep -qFx "changed: $changed" "$out" && pass 'exit 1 and the changed file named' || { fail "drift (exit $rc)"; show }

# --- U4: update and uninstall refuse inside the guard.
label=U4
restore A
temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A} cache=${$(/usr/bin/getconf DARWIN_USER_CACHE_DIR):A}
profile=$(/usr/bin/env -i HOME="$home" PATH="$base" "$engine/current/launch" profile 2>/dev/null)
before=$(snapshot "$home")
for c in update uninstall; do
  /usr/bin/sandbox-exec -D "HOME=$home" -D "DARWIN_TEMP=$temp" -D "DARWIN_CACHE=$cache" -D GUI=0 -p "$profile" \
    /usr/bin/env -i HOME="$home" PATH="$base" "$engine/bin/agent-guard" $c < /dev/null > "$out" 2>&1
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -q 'outside any guard or sandbox' "$out" && pass "$c refused (exit $rc)" || { fail "$c inside the guard (exit $rc)"; show }
  [[ $(snapshot "$home") == "$before" && -d $engine/current/ ]] && pass "$c changed nothing" || fail "$c changed something"
done

# --- X1: uninstall.
label=X1
restore A
point= ag uninstall
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'Agent Guard removed.' "$out" && pass 'exit 0' || { fail "uninstall (exit $rc)"; show }
! /usr/bin/grep -q agent-guard "$home/.zprofile" "$home/dotfiles/zshrc" && pass 'PATH blocks gone' || fail 'PATH blocks gone'
[[ ! -e $plugin && ! -L $plugin && ! -e $app && ! -e $cc/agent-guard && ! -e $engine ]] && pass 'plugin, app, rulebook and engine gone' || fail 'plugin, app, rulebook and engine gone'
/usr/bin/jq -e '.rules == ["custom"]' "$cc/rule.json" >/dev/null && pass 'rule.json without agent-guard' || fail 'rule.json without agent-guard'
[[ -f $list ]] && pass 'list kept' || fail 'list kept'
[[ $(<"$cfg") == "$original" ]] || /usr/bin/jq -e --argjson o "$original" '. == $o' "$cfg" >/dev/null && pass 'permissions restored' || fail 'permissions restored'
snapshot "$home" > "$run/uninstalled.snapshot"

# --- X7: a record entry without wrote (an interrupted OpenCode Guard install) and
# a config whose bash key the user deleted: uninstall leaves the config as it is.
label=X7
restore A
/usr/bin/jq --arg f "$cfg" '.[$f] = {"edit":{"orig":null},"bash":{"orig":{"ls *":"allow","*":"ask"}},"external_directory":{"orig":null}}' \
  "$state/permissions.json" > "$state/permissions.json.new" && /bin/mv "$state/permissions.json.new" "$state/permissions.json"
print -r -- '{"model":"m","permission":{"task":"ask"}}' > "$cfg"
cfg_hash=$(sha "$cfg")
point= ag uninstall
rc=$?
(( rc == 0 )) && /usr/bin/grep -q 'Agent Guard removed.' "$out" && pass 'exit 0' || { fail "uninstall (exit $rc)"; show }
[[ $(sha "$cfg") == "$cfg_hash" ]] && pass 'config byte-identical, bash still absent' || { fail "config changed: $(/usr/bin/jq -c . "$cfg")"; show }

# --- X2, X3: a config that cannot be restored.
label=X2
restore A
print -r -- '{not json' > "$cfg"
point= ag uninstall
rc=$?
(( rc != 0 )) && /usr/bin/grep -qF "$cfg" "$out" && pass "exit $rc, the file named" || { fail "uninstall (exit $rc)"; show }
[[ -f "$home/Agent Guard/permissions-backup.json" && ! -e $engine ]] && pass 'permissions-backup.json saved, engine removed' || fail 'permissions-backup.json saved'
label=X3
restore A
print -r -- '{not json' > "$cfg"
/bin/chmod 555 "$home/Agent Guard"
point= ag uninstall
rc=$?
/bin/chmod 755 "$home/Agent Guard"
(( rc == 1 )) && [[ -d $engine && -L $plugin ]] && pass 'exit 1; engine and plugin kept' || { fail "uninstall (exit $rc)"; show }
# X5: a first install killed after its permission write, then a config that cannot
# be restored: recovery rolls the install back, uninstall saves the record and
# removes the engine.
label=X5
restore clean
point=kill:rc boot v0.0.1
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
print -r -- '{not json' > "$cfg"
point= ag uninstall
rc=$?
(( rc == 1 )) && /usr/bin/grep -qF "$cfg" "$out" && pass 'exit 1, the file named' || { fail "uninstall (exit $rc)"; show }
[[ -f "$home/Agent Guard/permissions-backup.json" && ! -e $engine ]] && pass 'permissions-backup.json saved, engine removed' || fail 'permissions-backup.json saved, engine removed'
# X6: a plugin that cannot be removed keeps the engine; the rerun finishes.
label=X6
restore A
/bin/chmod 555 "$plugins"
point= ag uninstall
rc=$?
/bin/chmod 755 "$plugins"
(( rc == 1 )) && [[ -d $engine && -L $plugin ]] && pass 'exit 1; engine and plugin kept' || { fail "uninstall (exit $rc)"; show }
point= ag uninstall
rc=$?
(( rc == 0 )) && pass 'rerun exits 0' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals one full run' "$run/uninstalled.snapshot"

# --- X4: a kill at each uninstall point, then a rerun. Before the plugin goes every
# entry point is guarded or refuses (design A2).
uninstall_points=(uninstall-rc uninstall-restore uninstall-app uninstall-rulebook uninstall-backup uninstall-plugin uninstall-engine)
for p in $uninstall_points; do
  label="X4 kill:$p"
  restore A
  point=kill:$p ag uninstall
  rc=$?
  (( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show; continue }
  [[ $p == uninstall-engine ]] || probe_entry_points "$home" "$base" "$engine/bin:$base"
  point= ag uninstall
  rc=$?
  (( rc == 0 )) && pass 'rerun exits 0' || { fail "rerun (exit $rc)"; show }
  same_snapshot 'final state equals one full run' "$run/uninstalled.snapshot"
done

# --- P1, P4, P5: a rerun keeps the edited list, the record and edited permissions.
label=P
restore A
print -r -- '# my note' >> "$list"
/usr/bin/jq -c '.permission.edit = "ask"' "$cfg" > "$cfg.new" && /bin/mv "$cfg.new" "$cfg"
list_hash=$(sha "$list") cfg_hash=$(sha "$cfg") record_hash=$(sha "$state/permissions.json")
point= boot v0.0.1
rc=$?
(( rc == 0 )) && pass 'rerun exits 0' || { fail "rerun (exit $rc)"; show }
[[ $(sha "$list") == "$list_hash" ]] && pass 'P1 the edited list is identical' || fail 'P1 the edited list changed'
[[ $(sha "$state/permissions.json") == "$record_hash" ]] && pass 'P4 the record is byte-identical' || fail 'P4 the record changed'
[[ $(sha "$cfg") == "$cfg_hash" ]] && pass 'P5 edit stays ask; model, task and the rest untouched' || fail 'P5 the config changed'
/usr/bin/grep -qF "left unchanged: $cfg edit was changed after install" "$out" && pass 'P5 the edit is reported' || { fail 'P5 the edit is reported'; show }

# --- P2: a kill after the record write, then uninstall: the originals come back.
label=P2
restore clean
point=kill:perm-recorded boot v0.0.1 --projects "$home/Projects"
rc=$?
(( rc == 137 )) && pass killed || { fail "killed (exit $rc)"; show }
point= ag uninstall
rc=$?
(( rc == 0 )) && [[ ! -e $engine ]] && pass 'uninstall recovers and removes the engine' || { fail "uninstall (exit $rc)"; show }
[[ $(<"$cfg") == "$original" ]] && pass 'config as before' || fail 'config as before'

# --- R1: a switch action whose name is outside 0.1.x's fixed pattern of action
# names (a test release registers test-probe as the first switch action). Killed
# after its begun line, the journal names no other action; recovery must count
# that as a begun switch and roll it back, not discard the release and leave its
# change in place.
label=R1
copy_source "$source_root" "$run/src-probe"
probe_actions="$run/src-probe/installer/actions.zsh"
/usr/bin/sed -i '' 's/^  ag_actions=($/&\
    switch test-probe engine all do_test_probe undo_test_probe/' "$probe_actions"
print -r -- '
do_test_probe() {
  ag_jlast test-probe
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then ag_jnl test-probe begun || return 1; fi
  print -r -- probe > "$home/probe-marker" || return 1
  test_point test-probe || return 1
  ag_jnl test-probe done
}
undo_test_probe() {
  ag_jlast test-probe
  [[ $REPLY == (begun|done) ]] || return 0
  /bin/rm -f -- "$home/probe-marker" && ag_jnl test-probe undone
}' >> "$probe_actions"
if /usr/bin/grep -q '^    switch test-probe engine all' "$probe_actions" && build "$run/src-probe" 0.0.4; then
  restore A
  point=kill:test-probe boot v0.0.4
  rc=$?
  (( rc == 137 )) && [[ -f $home/probe-marker && $(<"$state/txn/journal") == 'test-probe begun' ]] &&
    pass 'killed with test-probe begun, the only line in the journal' || { fail "kill:test-probe (exit $rc)"; show }
  point= ag uninstall
  rc=$?
  (( rc == 0 )) && /usr/bin/grep -q 'rolling back the unfinished switch' "$out" && [[ ! -e $home/probe-marker && ! -e $engine ]] &&
    pass 'recovery counts it as a begun switch and rolls it back; uninstall then finishes' || { fail "uninstall after kill:test-probe (exit $rc)"; show }
else
  fail 'cannot build the test release with test-probe'
fi

# --- R2: recovery reads only the transaction's copies. An update killed in its
# switch, then its new release folder deleted: the next run rolls the switch back
# from state/txn and updates again.
label=R2
restore Aplus
latest v0.0.2
point=kill:current ag update
rc=$?
copies=("$state"/txn/{install.sh,account.zsh,uninstall.sh,profiles/opencode/harness.zsh}(N) "$state"/txn/installer/{lib,actions,harness/opencode,migrate/opencode-guard}.zsh(N))
(( rc == 137 && $#copies == 8 )) && pass 'killed in the switch; the transaction holds its installer, modules and harness data' ||
  { fail "kill:current (exit $rc, $#copies copies)"; show }
new_rid=$(/usr/bin/jq -r .rid_new "$state/txn/plan.json" 2>/dev/null)
[[ -n $new_rid ]] && /bin/rm -rf "$engine/releases/$new_rid"
[[ -n $new_rid && ! -e $engine/releases/$new_rid ]] && pass "release $new_rid deleted" || fail 'release deleted'
point= ag update
rc=$?
(( rc == 0 )) && /usr/bin/grep -qF "release $new_rid is missing; rolling back" "$out" && [[ $(stamp_version) == 0.0.2 ]] &&
  pass 'the rerun rolls back from the copies, then updates' || { fail "rerun (exit $rc)"; show }
same_snapshot 'final state equals an uninterrupted update' "$run/update-ref.snapshot"

# --- R3: no transaction opens over an open one, where mv would put the new
# transaction inside it. ag_txn_open, from the installed release, refuses and
# leaves the open transaction as it was.
label=R3
restore A
/bin/mkdir -p "$state/txn/backup/rc" && print -r -- 'rc begun' > "$state/txn/journal" && print -r -- x > "$state/txn/backup/rc/file"
txn_files() { local f; for f in "$state"/txn/**/*(DN); do print -r -- "${f#$state/} $(sha "$f")"; done }
txn_before=$(txn_files)
run_timeout 60 /usr/bin/env -i HOME="$home" PATH="$tpath" /bin/zsh -fc 'emulate zsh; setopt no_unset pipe_fail extended_glob
  source "$1/install.sh" --lib && ag_init && ag_txn_open' R3 "$engine/current" < /dev/null > "$out" 2>&1
rc=$?
(( rc == 1 )) && /usr/bin/grep -qF "$state/txn is still open" "$out" && [[ $(txn_files) == "$txn_before" && ! -e $state/txn.new ]] &&
  pass 'opening a transaction while one is open fails and leaves the open one as it was' || { fail "ag_txn_open (exit $rc)"; show }

# Every test point in the shipped scripts is exercised: here, in test/bootstrap.sh
# (after-download, after-verify) or in test/migrate.sh ($migrate_points, test/lib.zsh,
# whose own check fails for any it does not exercise).
label=coverage
covered=($update_points $uninstall_points rollback after-unpack after-download after-verify $migrate_points)
points=(${(f)"$(/usr/bin/grep -ohE 'test_point [a-z0-9-]+' "$source_root"/profiles/opencode/{install,uninstall}.sh "$source_root"/installer/**/*.zsh "$source_root"/scripts/bootstrap.zsh "$source_root"/engine/agent-guard | /usr/bin/sort -u)"})
missing=()
for p in ${points#test_point }; do (( ${covered[(Ie)$p]} )) || missing+=("$p"); done
(( $#points >= 20 && $#missing == 0 )) && pass "all $#points test points are exercised" || fail "test points not exercised: ${missing:-none found}"

finish

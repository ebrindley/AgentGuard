#!/bin/zsh
# Bootstrap cases that need no installer (design section 9.4: B1-B7 and the
# refusal inside a guard). Builds test releases served by test/release-server.mjs.
# Runs outside any sandbox, from a checkout; needs Node.
emulate -L zsh
setopt no_unset pipe_fail extended_glob
command -v node >/dev/null || { print -ru2 'Node is required for the release server'; exit 1 }

source_root=${0:A:h:h}
adapter="$source_root/test/engines/zsh.mjs"
fails=0
pass() { print -r -- "ok   $*" }
fail() { print -r -- "FAIL $*"; fails=$((fails + 1)) }
source "$source_root/test/lib.zsh"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-bootstrap-XXXXXX")
run=${run:A}
served="$run/served"
/bin/mkdir -p "$served"
node "$source_root/test/release-server.mjs" "$served" > "$run/port" 2> "$run/server.log" &
server=$!
for i in {1..100}; do [[ -s $run/port ]] && break; sleep 0.05; done
port=$(<"$run/port")
[[ $port == <-> ]] || { print -ru2 "release server did not start: $(<"$run/server.log")"; kill $server; exit 1 }
url="http://127.0.0.1:$port/ebrindley/AgentGuard"

new_home "$run/home"
home=$REPLY
engine="$home/Library/Application Support/AgentGuard"
state="$engine/state"
out="$run/out"

build() { node "$adapter" release "$1" "$served" "$home" "v$2" "$2" "$url" >/dev/null }
build "$source_root" 0.0.1 || { print -ru2 'cannot build v0.0.1'; kill $server; exit 1 }
print v0.0.1 > "$served/latest.txt"
a=agent-guard-0.0.1.tar.gz
rel="$served/v0.0.1"

# boot [ARGS...]: the one-liner against the test server. AG_TEST_POINT comes from $point.
point=
boot() {
  local text
  text=$(/usr/bin/curl -fsSL "$url/releases/latest/download/install.sh") || return 99
  run_timeout 60 /usr/bin/env HOME="$home" AG_TEST_POINT="$point" /bin/zsh -c "$text" install.sh "$@" > "$out" 2>&1
}

# B1: the bootstrap names its tag; the archive matches its checksum file.
[[ $(/usr/bin/grep -c "local tag='v0.0.1'" "$rel/install.sh") == 1 ]] && pass "B1 bootstrap names tag v0.0.1 once" || fail "B1 bootstrap names tag v0.0.1 once"
sums=(${=$(<"$rel/$a.sha256")})
got=$(/usr/bin/shasum -a 256 "$rel/$a")
[[ ${got%% *} == ${sums[1]} && ${sums[2]} == $a ]] && pass "B1 archive hash matches $a.sha256" || fail "B1 archive hash matches $a.sha256"
/usr/bin/curl -fsSL "$url/releases/latest/download/install.sh" | /usr/bin/cmp -s - "$rel/install.sh" &&
  pass "B1 latest/download/install.sh redirects to v0.0.1" || fail "B1 latest/download/install.sh redirects to v0.0.1"
/bin/mkdir -p "$run/empty"
seams=$(/bin/zsh "$source_root/scripts/check-seams.zsh" "$run/empty" "$rel/install.sh" 2>&1)
(( $? != 0 )) && [[ $seams == *'AG_TEST_ in shipped files'* ]] &&
  pass "check-seams rejects the test bootstrap" || fail "check-seams rejects the test bootstrap"

# B2: a missing asset (302, then 404) stops the run, names the file and creates nothing.
/bin/mv "$rel/$a" "$run/$a.hidden"
before=$(listing "$home")
boot; rc=$?
(( rc != 0 )) && pass "B2 missing asset: exit $rc" || fail "B2 missing asset: exit 0"
/usr/bin/grep -q "download failed (curl 22): .*/$a\$" "$out" && pass "B2 message names $a" || fail "B2 message names $a: $(<$out)"
[[ $(listing "$home") == "$before" ]] && pass "B2 home unchanged" || fail "B2 home unchanged"
/bin/mv "$run/$a.hidden" "$rel/$a"

# B3: a corrupt archive over an existing install: both hashes named, stage and lock
# removed, and the installed engine, Guard List, OpenCode config and startup file unchanged.
rid=0.0.0-20260101T000000Z
/bin/mkdir -p "$engine/releases/$rid" "$state" "$home/Agent Guard"
print 0.0.0 > "$engine/releases/$rid/VERSION"
/bin/ln -s "releases/$rid" "$engine/current"
print '{"permission":{}}' > "$state/permissions.json"
print 'ALLOW ~/Projects' > "$home/Agent Guard/Guard List.txt"
print '{"model":"test"}' > "$home/.config/opencode/opencode.json"
print 'export EDITOR=vi' > "$home/.zshrc"
: > "$rel/.corrupt-$a"
bad=$(/usr/bin/curl -fsSL "$url/releases/download/v0.0.1/$a" | /usr/bin/shasum -a 256)
bad=${bad%% *}
before=$(listing "$home")
snap=$(snapshot "$home")
boot; rc=$?
(( rc != 0 )) && pass "B3 corrupt archive: exit $rc" || fail "B3 corrupt archive: exit 0"
/usr/bin/grep -qF "checksum mismatch for $a: expected ${sums[1]}, got $bad" "$out" &&
  pass "B3 message names $a and both hashes" || fail "B3 message names $a and both hashes: $(<$out)"
[[ -z $(print -l "$engine/stage"/*(DN)) && ! -e $state/lock && $(listing "$home") == "$before" ]] &&
  pass "B3 stage and lock removed; no other path added or removed" || fail "B3 stage and lock removed; no other path added or removed"
after=$(snapshot "$home")
[[ $after == "$snap" ]] && pass "B3 installed files keep their contents" ||
  { fail "B3 installed files keep their contents"; /usr/bin/diff <(print -r -- "$snap") <(print -r -- "$after") }
/bin/rm -f "$rel/.corrupt-$a"

# B4: a download cut short (curl 18) on a fresh home.
new_home "$home" >/dev/null
print 1000 > "$rel/.truncate-$a"
before=$(listing "$home")
boot; rc=$?
(( rc != 0 )) && pass "B4 truncated download: exit $rc" || fail "B4 truncated download: exit 0"
/usr/bin/grep -q "download failed (curl 18): .*/$a\$" "$out" && pass "B4 message names $a" || fail "B4 message names $a: $(<$out)"
[[ $(listing "$home") == "$before" ]] && pass "B4 home unchanged" || fail "B4 home unchanged"
/bin/rm -f "$rel/.truncate-$a"

# B5: downloads stage inside the engine folder, never in a temp folder.
tmp_before=$(print -l "${TMPDIR:-/tmp}"/agent-guard*(N) /private/tmp/agent-guard*(N))
point=kill:after-verify boot; rc=$?
(( rc == 128 + 9 )) && pass "B5 killed at after-verify" || fail "B5 killed at after-verify (exit $rc)"
staged=("$engine"/stage/*/dl/$a(N))
(( $#staged == 1 )) && pass "B5 archive staged in the engine folder's stage/<txn>/dl" || fail "B5 archive staged in the engine folder's stage/<txn>/dl"
[[ $(print -l "${TMPDIR:-/tmp}"/agent-guard*(N) /private/tmp/agent-guard*(N)) == "$tmp_before" ]] &&
  pass "B5 nothing new in TMPDIR or /private/tmp" || fail "B5 nothing new in TMPDIR or /private/tmp"
# The next run takes over the dead run's lock and removes its stage.
point=fail:after-download boot; rc=$?
(( rc != 0 )) && /usr/bin/grep -q 'stopped at after-download' "$out" && pass "B5 rerun stops at fail:after-download" || fail "B5 rerun stops at fail:after-download: $(<$out)"
[[ -z $(print -l "$engine/stage"/*(DN)) && ! -e $state/lock ]] &&
  pass "B5 rerun removed the stale stage and lock" || fail "B5 rerun removed the stale stage and lock"

# The lock: held while its pid runs zsh with the recorded start time, or for 10 seconds
# while it has no owner record; taken over otherwise.
/bin/zsh -fc 'sleep 60; :' &
holder=$!
start=$(/bin/ps -o lstart= -p $holder)
/bin/mkdir -p "$state/lock"
print -r -- ${(j: :)${=start}} > "$state/lock/start"
print -r -- $holder > "$state/lock/pid"
point=fail:after-download boot
/usr/bin/grep -q "another Agent Guard install is running (process $holder)" "$out" && [[ $(<"$state/lock/pid") == $holder ]] &&
  pass "lock held by a live zsh with its start time is refused and kept" || fail "lock held by a live zsh: $(<$out)"
print -r -- 'Thu Jan 1 00:00:00 2026' > "$state/lock/start"
point=fail:after-download boot
/usr/bin/grep -q 'stopped at after-download' "$out" && [[ ! -e $state/lock ]] &&
  pass "lock whose pid has another start time is taken over" || fail "lock whose pid has another start time: $(<$out)"
kill $holder 2>/dev/null
/bin/mkdir "$state/lock"
point=fail:after-download boot
/usr/bin/grep -q 'another Agent Guard install is running$' "$out" && [[ -d $state/lock ]] &&
  pass "new lock without an owner record is refused" || fail "new lock without an owner record: $(<$out)"
/usr/bin/touch -t 202601010000 "$state/lock"
point=fail:after-download boot
/usr/bin/grep -q 'stopped at after-download' "$out" && [[ ! -e $state/lock ]] &&
  pass "lock without an owner record for 10 seconds is taken over" || fail "old lock without an owner record: $(<$out)"

# B6: a cut-off bootstrap runs nothing: every line-boundary prefix and 5 mid-line cuts.
new_home "$home" >/dev/null
before=$(listing "$home")
text=$(<"$rel/install.sh")
lines=("${(@f)text}")
ran=()
for k in {0..$(( $#lines - 1 ))}; do
  prefix=${(F)lines[1,k]}
  (( k )) && prefix+=$'\n'
  /usr/bin/env HOME="$home" /bin/zsh -c "$prefix" install.sh --projects "$home/Projects" >/dev/null 2>&1
  [[ -e $engine ]] && { ran+=($k); /bin/rm -rf "$engine" }
done
(( $#ran == 0 )) && pass "B6 $#lines line-boundary prefixes run nothing" || fail "B6 prefixes that ran: $ran lines"
# Inside the last line (after the name, after "$@", before the closing brace),
# inside the download-base line and inside the exec line.
last=${lines[-1]}
base=$(( ${#text} - ${#last} ))
fn=agent_guard_bootstrap
cuts=(
  $(( base + ${#${last%%$fn*}} + ${#fn} ))
  $(( base + ${#last} - 2 ))
  $(( base + ${#last} - 1 ))
  $(( ${#${text%%local repo=*}} + 30 ))
  $(( ${#${text%%exec /bin/zsh*}} + 20 ))
)
ran=()
for c in $cuts; do
  /usr/bin/env HOME="$home" /bin/zsh -c "${text[1,c]}" install.sh >/dev/null 2>&1
  [[ -e $engine ]] && { ran+=("$c") ; /bin/rm -rf "$engine" }
done
(( $#ran == 0 )) && pass "B6 5 mid-line cuts run nothing" || fail "B6 mid-line cuts that ran: ${ran[*]}"
[[ $(listing "$home") == "$before" ]] && pass "B6 home unchanged" || fail "B6 home unchanged"

# B7: arguments reach the release's installer after --stage <txn>, in the same process.
stub_src="$run/stub-src"
/bin/mkdir -p "$stub_src"
/bin/cp -R "$source_root"/{engine,profiles,installer,scripts,install.sh,LICENSE} "$stub_src/"
print -r -- '#!/bin/zsh
# Test stub: records its arguments, its pid and the lock owner. The seam forms
# scripts/check-seams.zsh requires stay in the copied installer/lib.zsh.
print -rl -- "pid $$" "lock $(<"'"$state"'/lock/pid")" "self ${0:A}" "$@" > "'"$run"'/stub-args"' > "$stub_src/profiles/opencode/install.sh"
build "$stub_src" 0.0.9 || fail "B7 cannot build the stub release"
new_home "$home" >/dev/null
text=$(/usr/bin/curl -fsSL "$url/releases/download/v0.0.9/install.sh")
/usr/bin/env HOME="$home" /bin/zsh -c "$text" install.sh --projects "$home/Projects/a b" --gui 'x"y' > "$out" 2>&1
rc=$?
recorded=("${(@f)$(<"$run/stub-args" 2>/dev/null)}")
if (( rc == 0 && $#recorded == 9 )); then
  txn=${recorded[5]}
  [[ ${recorded[4]} == --stage && $txn == [0-9](#c8)T[0-9](#c6)Z-<-> ]] && pass "B7 installer gets --stage <txn> first" || fail "B7 installer gets --stage <txn> first: ${recorded[4,5]}"
  [[ ${(j:|:)recorded[6,9]} == "--projects|$home/Projects/a b|--gui|x\"y" ]] && pass "B7 arguments pass through unchanged" || fail "B7 arguments pass through unchanged: ${recorded[6,9]}"
  [[ ${recorded[1]#pid } == ${recorded[2]#lock } ]] && pass "B7 installer runs as the lock owner" || fail "B7 installer runs as the lock owner"
  [[ ${recorded[3]#self } == "$engine/stage/$txn/tree/agent-guard-0.0.9/profiles/opencode/install.sh" ]] &&
    pass "B7 installer runs from the staged tree" || fail "B7 installer runs from the staged tree: ${recorded[3]}"
else
  fail "B7 stub installer ran (exit $rc): $(<$out)"
fi

# Inside a guard the state folder is not writable: refuse before any change.
# Deny writes to the state folder on a fresh home, then to the whole engine folder of an existing one.
text=$(<"$rel/install.sh")
deny='(version 1)(allow default)(deny file-write* (subpath (param "P")))'
new_home "$home" >/dev/null
for denied in "$state" "$engine"; do
  [[ $denied == "$engine" ]] && { /bin/mkdir -p "$state"; print keep > "$state/keep" }
  before=$(listing "$home")
  /usr/bin/sandbox-exec -D P="$denied" -p "$deny" /usr/bin/env HOME="$home" /bin/zsh -c "$text" install.sh > "$out" 2>&1
  rc=$?
  (( rc != 0 )) && /usr/bin/grep -q 'outside any guard or sandbox' "$out" &&
    pass "guard refusal (writes denied to ${denied:t})" || fail "guard refusal (writes denied to ${denied:t}): exit $rc: $(<$out)"
  [[ $(listing "$home") == "$before" ]] && pass "guard refusal changes nothing (${denied:t})" || fail "guard refusal changes nothing (${denied:t})"
done

kill $server 2>/dev/null
wait $server 2>/dev/null
/bin/rm -rf "$run"
print -r -- "$fails failure(s)"
(( fails == 0 ))

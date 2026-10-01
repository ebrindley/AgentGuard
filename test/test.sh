#!/bin/zsh
# Runs outside any sandbox. Requires node for the plugin checks and the opencode CLI for the install self-test.
emulate -L zsh
setopt no_unset pipe_fail
command -v node >/dev/null || { print -ru2 'Node is required for fixture isolation'; exit 1 }

source_root=${0:A:h:h}
engine_name=zsh
while (( $# )); do
  case $1 in
    --engine) (( $# >= 2 )) || { print -ru2 'usage: test.sh [--engine NAME]'; exit 2 }; engine_name=$2; shift 2 ;;
    *) print -ru2 'usage: test.sh [--engine NAME]'; exit 2 ;;
  esac
done
engines=( "$source_root"/test/engines/*.mjs(N:t:r) )
(( ${engines[(Ie)$engine_name]} )) || { print -ru2 "unknown engine: $engine_name (known: ${(j:, :)engines})"; exit 1 }
adapter="$source_root/test/engines/$engine_name.mjs"
print -r -- "engine: $(node "$adapter" name)"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-XXXXXX")
root="$run/source"
/bin/mkdir -p "$root/test"
/bin/cp "$source_root/test/plugin.mjs" "$root/test/"
export HOME="$run/home"
# The adapter applies the test home to this disposable copy only, never to production code or the account database.
node "$adapter" stage "$source_root" "$root" "$HOME" || { print -ru2 'Cannot stage engine'; exit 1 }
/bin/mkdir -p "$HOME"/{Projects/app/secret,Projects/archive/live,Projects/dotfiles,Documents/private,.config/opencode,bin}
home=${HOME:A}
engine="$home/Library/Application Support/AgentGuard"
launcher_argv=$(node "$adapter" launcher "$engine") || { print -ru2 'Cannot get engine launcher'; exit 1 }
launcher=( "${(@f)launcher_argv}" )
list="$home/Agent Guard/Guard List.txt"
log="$home/Agent Guard/last-launch-opencode.log"
cfg="$home/.config/opencode/opencode.json"
fails=0

pass() { print -r -- "ok   $*" }
fail() { print -r -- "FAIL $*"; fails=$((fails + 1)) }
check() { local name=$1; shift; if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi }
expect() { local want=$1 name=$2; shift 2; "$@" >/dev/null 2>&1; local rc=$?; if [[ ( $want == ok && $rc == 0 ) || ( $want == no && $rc != 0 ) ]]; then pass "$name"; else fail "$name (rc $rc)"; fi }

# OpenCode Guard's PATH blocks, rulebook and plugin, which install and uninstall must leave alone.
old_block=$'# >>> opencode-guard >>>\npath=("$HOME/Library/Application Support/OpenCodeGuard/bin" $path)\n# <<< opencode-guard <<<'
print -r -- "export X=1"$'\n'"$old_block" > "$home/Projects/dotfiles/zshrc"
/bin/ln -s "$home/Projects/dotfiles/zshrc" "$home/.zshrc"
print 'export Y=1' > "$home/Projects/dotfiles/bash_login"
/bin/ln -s "$home/Projects/dotfiles/bash_login" "$home/.bash_login"
print '{}' > "$home/Projects/dotfiles/oc.json"
/bin/ln -s "$home/Projects/dotfiles/oc.json" "$home/Projects/app/opencode.json"
/bin/mkdir -p "$home/Projects/archive/.opencode"
print -rn -- "$old_block"$'\nalias x=y' > "$home/.zprofile"
original='{"model":"m","permission":{"bash":{"git *":"allow","*":"ask","rm *":"deny"},"task":"ask"}}'
print -r -- "$original" > "$cfg"
cc="$home/.cc-safety-net/rules"
/bin/mkdir -p "$cc/opencode-guard" "$home/.config/opencode/plugins"
/usr/bin/jq '.name = "opencode-guard"' "$root/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" > "$cc/opencode-guard/rulebook.json"
print -r -- '{"version":1,"rules":["opencode-guard"],"overrides":{},"transparent_wrappers":["env"]}' > "$cc/rule.json"
print -r -- 'export const OpenCodeGuardFixture = async () => ({})' > "$home/.config/opencode/plugins/opencode-guard.js"
orig="$run/orig"
/bin/mkdir -p "$orig"
/bin/cp "$home/.zprofile" "$orig/zprofile"
/bin/cp "$home/Projects/dotfiles/zshrc" "$orig/zshrc"
/bin/cp "$cc/opencode-guard/rulebook.json" "$orig/rulebook.json"
/bin/cp "$home/.config/opencode/plugins/opencode-guard.js" "$orig/plugin.js"
# True when OpenCode Guard's files match their copies, ignoring Agent Guard's PATH block.
old_untouched() {
  local rc
  for rc in zprofile zshrc; do
    [[ "$(/usr/bin/sed '/^# >>> agent-guard >>>$/,/^# <<< agent-guard <<<$/d' "$home/.$rc")" == "$(<"$orig/$rc")" ]] || return 1
  done
  /usr/bin/cmp -s "$orig/rulebook.json" "$cc/opencode-guard/rulebook.json" &&
    /usr/bin/cmp -s "$orig/plugin.js" "$home/.config/opencode/plugins/opencode-guard.js"
}

/bin/zsh "$root/install.sh" --projects "$home/Projects" </dev/null > "$home/install.log" 2>&1 || { fail "install"; /bin/cat "$home/install.log" }
check "install self-test incl. plugin load" /usr/bin/grep -q "ok   plugins loaded in OpenCode" "$home/install.log"
check "projects added to ALLOW" /usr/bin/grep -Fxq "$home/Projects" "$list"
check "zprofile without final newline kept intact" /usr/bin/grep -Fxq 'alias x=y' "$home/.zprofile"
check "permission merge" /usr/bin/jq -e '.permission == {"bash":{"*":"allow","git *":"allow","rm *":"deny"},"task":"ask","edit":"allow","external_directory":"allow"} and (.permission.bash | keys_unsorted[0]) == "*"' "$cfg"
check "plugin installed as agent-guard.js" test -f "$home/.config/opencode/plugins/agent-guard.js"
check "rulebook agent-guard" /usr/bin/jq -e '.name == "agent-guard"' "$cc/agent-guard/rulebook.json"
check "rule.json lists agent-guard and keeps opencode-guard" /usr/bin/jq -e '.rules == ["agent-guard", "opencode-guard"]' "$cc/rule.json"
new_blocks() {
  local rc
  for rc in "$home/.zprofile" "$home/.zshrc"; do
    /usr/bin/grep -Fxq '# >>> agent-guard >>>' "$rc" && /usr/bin/grep -Fxq '# <<< agent-guard <<<' "$rc" || return 1
  done
}
check "agent-guard PATH blocks" new_blocks
check "app bundle ID" test "$(/usr/bin/plutil -extract CFBundleIdentifier raw "$home/Applications/Agent Guard.app/Contents/Info.plist")" = io.github.ebrindley.agentguard
check "install leaves OpenCode Guard's blocks, rulebook and plugin unchanged" old_untouched

/usr/bin/awk -v h="$home" '
  /^ALLOW -/ { print; print h "/Projects/archive/live"; print h "/Library"; print "/"; next }
  /^READ ONLY -/ { print; print h "/Projects/archive"; print "~"; next }
  /^DENY -/ { print; print h "/Projects/app/secret"; print "Allow me to note:"; print "~/Documents/private"; print "~/Documents/typo"; print h "/Library"; print "not a path"; next }
  { print }' "$list" > "$list.tmp" && /bin/mv "$list.tmp" "$list"

profile=$(cd "$home/Projects/app" && "${launcher[@]}" profile 2>/dev/null) || fail "profile"
check "essential DENY refused" /usr/bin/grep -q "refused DENY, OpenCode needs" "$log"
check "broad ALLOW refused" /usr/bin/grep -q "refused ALLOW, too broad: $home/Library" "$log"
check "ALLOW / refused" /usr/bin/grep -qx "refused ALLOW, too broad: /" "$log"
check "essential READ ONLY refused" /usr/bin/grep -q "refused READ ONLY, OpenCode needs" "$log"
check "missing DENY warned" /usr/bin/grep -q "DENY entry does not exist, check the spelling: $home/Documents/typo" "$log"
check "junk line skipped" /usr/bin/grep -q "skipped, not a full path: not a path" "$log"
check "built-ins listed" /usr/bin/grep -q "always writable for OpenCode itself" "$log"
check "rules.json" /usr/bin/jq -e --arg h "$home" '.deny == [$h + "/Projects/app/secret", $h + "/Documents/private", $h + "/Documents/typo"]' "$engine/state/rules.json"

temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
cache=${$(/usr/bin/getconf DARWIN_USER_CACHE_DIR):A}
sb() { /usr/bin/sandbox-exec -D "HOME=$home" -D "DARWIN_TEMP=$temp" -D "DARWIN_CACHE=$cache" -D GUI=0 -p "$profile" "$@" }
print data > "$home/Projects/app/secret/key"
print data > "$home/Documents/private/doc"

expect ok "write in ALLOW"                sb /usr/bin/touch "$home/Projects/app/new"
expect no "remove ALLOW root"             sb /bin/rmdir "$home/Projects/archive/live"
expect no "write in READ ONLY"            sb /usr/bin/touch "$home/Projects/archive/new"
expect ok "ALLOW inside READ ONLY"        sb /usr/bin/touch "$home/Projects/archive/live/new"
expect no "read DENY inside ALLOW"        sb /bin/cat "$home/Projects/app/secret/key"
expect no "list DENY"                     sb /bin/ls "$home/Documents/private"
expect no "rename DENY"                   sb /bin/mv "$home/Projects/app/secret" "$home/Projects/app/moved"
expect no "rename ancestor of DENY"       sb /bin/mv "$home/Projects/app" "$home/Projects/renamed"
expect no "write outside lists"           sb /usr/bin/touch "$home/Documents/new"
expect no "edit Guard List"               sb /bin/sh -c "echo x >> '$list'"
expect no "move Guard List folder"        sb /bin/mv "$home/Agent Guard" "$home/moved"
expect no "write engine"                  sb /usr/bin/touch "$engine/x"
expect no "write opencode config"         sb /usr/bin/touch "$home/.config/opencode/x"
expect no "write symlinked shell profile" sb /bin/sh -c "echo x >> '$home/Projects/dotfiles/zshrc'"
expect no "write project .opencode"       sb /bin/mkdir -p "$home/Projects/app/.opencode/plugins"
expect no "write project opencode.json"   sb /usr/bin/touch "$home/Projects/app/opencode.json"
expect no "write project tui.json"        sb /usr/bin/touch "$home/Projects/app/tui.json"
expect no "write symlinked bash_login"    sb /bin/sh -c "echo x >> '$home/Projects/dotfiles/bash_login'"
expect no "write symlinked project config target" sb /bin/sh -c "echo x >> '$home/Projects/dotfiles/oc.json'"
expect no ".opencode/.gitignore in READ ONLY" sb /bin/sh -c ": > '$home/Projects/archive/.opencode/.gitignore'"
expect no "exec open"                     sb /usr/bin/open -h
expect no "exec codesign"                 sb /usr/bin/codesign -h
expect no "exec diskutil"                 sb /usr/sbin/diskutil list
expect no "write project .cc-safety-net"  sb /bin/mkdir -p "$home/Projects/app/.cc-safety-net"
expect ok "write cc-safety-net logs"      sb /usr/bin/touch "$home/.cc-safety-net/logs/x"
expect ok "write temp"                    sb /usr/bin/touch "$temp/.agent-guard-test"
expect no "write other per-user dirs"     sb /usr/bin/touch "${temp:h}/0/.agent-guard-test"
/bin/rm -f "$temp/.agent-guard-test"

/bin/mkdir -p "$home/fakebin"
child_home="$home/Projects/nested-home"
/bin/mkdir -p "$child_home"
# Agent Guard's nesting marker, then OpenCode Guard's.
for marker in AGENT_GUARD_SANDBOXED OPENCODE_SANDBOXED; do
  /bin/rm -f "$home/Projects/app/launched" "$home/Documents/escaped" "$home/Projects/app/nested-home"
  print -r -- $'#!/bin/sh\ntouch "$HOME/Documents/escaped"\n[ "$CC_SAFETY_NET_PARANOID_RM" = 1 ] && touch "$HOME/Projects/app/launched"' > "$home/fakebin/opencode"
  /bin/chmod 755 "$home/fakebin/opencode"
  /usr/bin/env PATH="$home/fakebin:$PATH" "$marker=1" "$engine/bin/opencode" >/dev/null 2>&1
  [[ -e $home/Projects/app/launched && ! -e $home/Documents/escaped ]] && pass "launch cli sandboxes despite $marker, paranoid rm on" || fail "launch cli sandbox with $marker"

  print -r -- $'#!/bin/sh\nprintf "%s\\n" "$HOME" > "$NESTED_HOME_RESULT"' > "$home/fakebin/opencode"
  HOME="$child_home" NESTED_HOME_RESULT="$home/Projects/app/nested-home" \
    PATH="$home/fakebin:$PATH" sb /usr/bin/env "$marker=1" "${launcher[@]}" cli >/dev/null 2>&1
  check "nested launch with $marker preserves child HOME" /usr/bin/grep -Fxq "$child_home" "$home/Projects/app/nested-home"
done

# Shim loop: OpenCode Guard v1.0.3 installed next to Agent Guard, both shim folders on PATH.
old_engine="$home/Library/Application Support/OpenCodeGuard"
/bin/mkdir -p "$old_engine/bin" "$home/OpenCode Guard" "$home/stub" "$home/linkbin"
/bin/cp "$source_root/test/fixtures/opencode-guard-1.0.3/launch" "$source_root/test/fixtures/opencode-guard-1.0.3/profile.sb" "$old_engine/"
print -r -- $'#!/bin/zsh\nexec "${0:A:h:h}/launch" cli "$@"' > "$old_engine/bin/opencode"
/bin/cp "$list" "$home/OpenCode Guard/Guard List.txt"
print -r -- $'#!/bin/sh\ntouch "$HOME/Documents/stub-escaped" 2>/dev/null && c=escaped || c=confined\nprintf "%s %s %s\\n" "${AGENT_GUARD_SANDBOXED:--}" "${OPENCODE_SANDBOXED:--}" "$c" >> "$HOME/Projects/app/stub-runs"' > "$home/stub/opencode"
/bin/chmod 755 "$old_engine/launch" "$old_engine/bin/opencode" "$home/stub/opencode"
# Runs a command for at most 20 seconds, so a launcher loop fails instead of hanging.
bounded() {
  local pid i
  "$@" >/dev/null 2>&1 &
  pid=$!
  for i in {1..200}; do
    kill -0 $pid 2>/dev/null || { wait $pid; return }
    sleep 0.1
  done
  kill -9 $pid 2>/dev/null
  wait $pid 2>/dev/null
  return 124
}
# stub_ran NAME WANT COMMAND...: the stub ran exactly once and recorded WANT.
stub_ran() {
  local name=$1 want=$2 rc=0
  shift 2
  /bin/rm -f "$home/Projects/app/stub-runs" "$home/OpenCode Guard/last-launch.log"
  bounded "$@" || rc=$?
  if (( rc == 124 )); then
    fail "$name (no exit within 20 seconds)"
  elif [[ -r $home/Projects/app/stub-runs && "$(<"$home/Projects/app/stub-runs")" == "$want" ]]; then
    pass "$name"
  else
    fail "$name (rc $rc)"
  fi
}
shims="$engine/bin:$old_engine/bin"
stub_ran "Agent Guard shim first: stub runs once under Agent Guard" '1 - confined' \
  /usr/bin/env PATH="$shims:$home/stub:$PATH" opencode
check "Agent Guard shim first: OpenCode Guard's launcher never runs" test ! -e "$home/OpenCode Guard/last-launch.log"
stub_ran "OpenCode Guard shim first: stub runs once, no second profile" '- 1 confined' \
  /usr/bin/env PATH="$old_engine/bin:$engine/bin:$home/stub:$PATH" opencode
for target in "$engine/bin/opencode" "$old_engine/bin/opencode"; do
  /bin/ln -sf "$target" "$home/linkbin/opencode"
  stub_ran "symlink to ${target:h:h:t} shim skipped" '1 - confined' \
    /usr/bin/env PATH="$home/linkbin:$home/stub:$PATH" "$engine/bin/opencode"
done

{
  plugin="$home/.config/opencode/plugins/agent-guard.js"
  /bin/mkdir -p "$home/Projects/net/rules"
  print -r -- '{"version":1,"rules":[],"overrides":{},"transparent_wrappers":["env"]}' > "$home/Projects/net/rules/rule.json"
  node "$root/test/plugin.mjs" "$plugin" unguarded || fails=$((fails + 1))
  AGENT_GUARD_BYPASS=1 node "$root/test/plugin.mjs" "$plugin" bypass || fails=$((fails + 1))
  OPENCODE_GUARD_BYPASS=1 node "$root/test/plugin.mjs" "$plugin" old-bypass || fails=$((fails + 1))
  sb "$(command -v node)" "$root/test/plugin.mjs" "$plugin" guarded || fails=$((fails + 1))
  /bin/mv "$engine/state" "$engine/state.real" && /bin/ln -s /System "$engine/state"
  node "$root/test/plugin.mjs" "$plugin" symlinked || fails=$((fails + 1))
  /bin/rm "$engine/state" && /bin/mv "$engine/state.real" "$engine/state"
}

/bin/zsh "$engine/uninstall.sh" >/dev/null 2>&1
[[ ! -e $engine && ! -e $home/.config/opencode/plugins/agent-guard.js && ! -e $cc/agent-guard ]] && pass "uninstall" || fail "uninstall"
check "rc block removed" sh -c "! /usr/bin/grep -q agent-guard '$home/.zshrc' '$home/.zprofile'"
check "rule.json keeps only opencode-guard" /usr/bin/jq -e '.rules == ["opencode-guard"]' "$cc/rule.json"
check "uninstall leaves OpenCode Guard's blocks, rulebook and plugin unchanged" old_untouched
check "permissions restored" /usr/bin/jq -e --argjson o "$original" '.permission == $o.permission' "$cfg"

/bin/rm -rf "$run"
print -r -- "$fails failure(s)"
(( fails == 0 ))

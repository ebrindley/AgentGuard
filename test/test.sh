#!/bin/zsh
# Runs outside any sandbox. Requires node for the plugin checks and the opencode CLI for the install self-test.
emulate -L zsh
setopt no_unset pipe_fail
# Set inside an Agent Guard session; it would choose the plugin's release.
unset AGENT_GUARD_RELEASE
# A relocated cache root would take the launches' cache rules and bin folder out of the test home.
unset XDG_CACHE_HOME
command -v node >/dev/null || { print -ru2 'Node is required for fixture isolation'; exit 1 }

source_root=${0:A:h:h}
engine_name=zsh
# --source DIR tests engine/, profiles/, install.sh and LICENSE from DIR, such as an
# unpacked release, instead of this checkout. The test files still come from here.
tested=$source_root
usage='usage: test.sh [--engine NAME] [--source DIR]'
while (( $# )); do
  case $1 in
    --engine) (( $# >= 2 )) || { print -ru2 $usage; exit 2 }; engine_name=$2; shift 2 ;;
    --source) (( $# >= 2 )) && [[ -d $2 ]] || { print -ru2 $usage; exit 2 }; tested=${2:A}; shift 2 ;;
    *) print -ru2 $usage; exit 2 ;;
  esac
done
engines=( "$source_root"/test/engines/*.mjs(N:t:r) )
(( ${engines[(Ie)$engine_name]} )) || { print -ru2 "unknown engine: $engine_name (known: ${(j:, :)engines})"; exit 1 }
adapter="$source_root/test/engines/$engine_name.mjs"
print -r -- "engine: $(node "$adapter" name)"
print -r -- "source: $tested"

run=$(/usr/bin/mktemp -d "$source_root/test/.run-XXXXXX")
root="$run/source"
/bin/mkdir -p "$root/test"
/bin/cp "$source_root/test/plugin.mjs" "$root/test/"
export HOME="$run/home"
# The adapter applies the test home to this disposable copy only, never to production code or the account database.
node "$adapter" stage "$tested" "$root" "$HOME" || { print -ru2 'Cannot stage engine'; exit 1 }
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

# Startup files, configs and rule.json before the install. OpenCode Guard's PATH
# blocks, rulebook and plugin are added only after the last install, which would
# migrate them (test/migrate.sh), to check that uninstall leaves them alone.
print -r -- "export X=1" > "$home/Projects/dotfiles/zshrc"
/bin/ln -s "$home/Projects/dotfiles/zshrc" "$home/.zshrc"
print 'export Y=1' > "$home/Projects/dotfiles/bash_login"
/bin/ln -s "$home/Projects/dotfiles/bash_login" "$home/.bash_login"
print '{}' > "$home/Projects/dotfiles/oc.json"
/bin/ln -s "$home/Projects/dotfiles/oc.json" "$home/Projects/app/opencode.json"
/bin/mkdir -p "$home/Projects/archive/.opencode"
print -rn -- 'alias x=y' > "$home/.zprofile"
original='{"model":"m","permission":{"bash":{"git *":"allow","*":"ask","rm *":"deny"},"task":"ask"}}'
print -r -- "$original" > "$cfg"
cc="$home/.cc-safety-net/rules"
/bin/mkdir -p "$cc" "$home/.config/opencode/plugins"
print -r -- '{"version":1,"rules":["custom"],"overrides":{},"transparent_wrappers":["env"]}' > "$cc/rule.json"
old_block=$'# >>> opencode-guard >>>\npath=("$HOME/Library/Application Support/OpenCodeGuard/bin" $path)\n# <<< opencode-guard <<<'
orig="$run/orig"
/bin/mkdir -p "$orig"
print -r -- 'export const OpenCodeGuardFixture = async () => ({})' > "$orig/plugin.js"
old_plugin="$home/.config/opencode/plugins/opencode-guard.js"
old_engine="$home/Library/Application Support/OpenCodeGuard"
# Adds OpenCode Guard's PATH blocks, rulebook, rule.json entry and plugin, and keeps copies.
add_old_parts() {
  local rc
  for rc in "$home/.zprofile" "$home/Projects/dotfiles/zshrc"; do print -r -- "$old_block" >> "$rc"; done
  /bin/mkdir -p "$cc/opencode-guard"
  /usr/bin/jq '.name = "opencode-guard"' "$root/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" > "$cc/opencode-guard/rulebook.json"
  /usr/bin/jq -c '.rules += ["opencode-guard"]' "$cc/rule.json" > "$cc/rule.json.new" && /bin/mv "$cc/rule.json.new" "$cc/rule.json"
  for rc in zprofile zshrc; do /usr/bin/sed '/^# >>> agent-guard >>>$/,/^# <<< agent-guard <<<$/d' "$home/.$rc" > "$orig/$rc"; done
  /bin/cp "$cc/opencode-guard/rulebook.json" "$orig/rulebook.json"
  /bin/cp "$orig/plugin.js" "$old_plugin"
}
# True when OpenCode Guard's blocks and rulebook match their copies, ignoring Agent Guard's PATH block.
old_untouched() {
  local rc
  for rc in zprofile zshrc; do
    [[ "$(/usr/bin/sed '/^# >>> agent-guard >>>$/,/^# <<< agent-guard <<<$/d' "$home/.$rc")" == "$(<"$orig/$rc")" ]] || return 1
  done
  /usr/bin/cmp -s "$orig/rulebook.json" "$cc/opencode-guard/rulebook.json"
}

# Every path under the test home, and the hash of every file in it.
snapshot() {
  /usr/bin/find "$home" -print | /usr/bin/sort
  /usr/bin/find "$home" -type f -exec /usr/bin/shasum -a 256 {} + | /usr/bin/sort
}
# refuses NAME TEXT COMMAND...: COMMAND exits non-zero and prints TEXT.
refuses() {
  local name=$1 text=$2 out rc=0
  shift 2
  out=$("$@" 2>&1 </dev/null) || rc=$?
  if (( rc != 0 )) && [[ $out == *"$text"* ]]; then pass "$name"; else fail "$name (rc $rc)"; print -r -- "$out"; fi
}
# install_refused NAME TEXT: the installer refuses with TEXT and the home is unchanged.
install_refused() {
  local before=$(snapshot)
  refuses "$1" "$2" /bin/zsh "$root/install.sh" --projects "$home/Projects"
  [[ $(snapshot) == "$before" ]] && pass "$1: nothing changed" || fail "$1: nothing changed"
}
/bin/mkdir -p "$engine"
print -r -- '#!/bin/zsh' > "$engine/launch"
install_refused "install refused over an install without release folders" "Run \"$engine/uninstall.sh\" first"
/bin/rm -r "$engine"

account_fn() { /usr/bin/sed -n '/^account_home() {$/,/^}$/p' "$1" }
check "engine/account.zsh holds the launcher's account_home verbatim" \
  test -n "$(account_fn "$tested/engine/account.zsh")" -a "$(account_fn "$tested/engine/account.zsh")" = "$(account_fn "$tested/engine/launch")"

/bin/zsh "$root/install.sh" --projects "$home/Projects" </dev/null > "$home/install.log" 2>&1 || { fail "install"; /bin/cat "$home/install.log" }
check "install self-test incl. plugin load" /usr/bin/grep -q "ok   plugins loaded in OpenCode" "$home/install.log"
check "projects added to ALLOW" /usr/bin/grep -Fxq "$home/Projects" "$list"
check "zprofile without final newline kept intact" /usr/bin/grep -Fxq 'alias x=y' "$home/.zprofile"
rid=$(<"$engine/current/RELEASE")
release="$engine/releases/$rid"
version=dev
[[ -f $tested/VERSION ]] && version=$(<"$tested/VERSION")
rid_form() { setopt local_options extended_glob; [[ $1 == "$version"-[0-9](#c8)T[0-9](#c6)Z ]] }
check "release ID is the version and the UTC install time" rid_form "$rid"
check "current links to releases/<rid>, bin to current/bin" \
  test "$(/usr/bin/readlink "$engine/current")" = "releases/$rid" -a "$(/usr/bin/readlink "$engine/bin")" = current/bin -a -d "$release"
check "release holds the runtime layout" test -x "$release/launch" -a -f "$release/profile.sb" -a -f "$release/account.zsh" \
  -a -x "$release/uninstall.sh" -a -x "$release/bin/opencode" -a -x "$release/bin/opencode-gui" -a -x "$release/bin/agent-guard" \
  -a -f "$release/profiles/opencode/harness.zsh" -a -f "$release/vendor/cc-safety-net/dist/index.js" \
  -a "$(<"$release/VERSION")" = "$version"
check "release has LICENSE and notices" test -f "$release/LICENSE" -a -f "$release/vendor/THIRD-PARTY-NOTICES"
check "check-config plugin links to the release's plugin.js" \
  test -L "$release/profiles/opencode/check-config/opencode/plugins/agent-guard.js" -a \
    "$release/profiles/opencode/check-config/opencode/plugins/agent-guard.js" -ef "$release/profiles/opencode/plugin.js"
check "permission merge" /usr/bin/jq -e '.permission == {"bash":{"*":"allow","git *":"allow","rm *":"deny"},"task":"ask","edit":"allow","external_directory":"allow"} and (.permission.bash | keys_unsorted[0]) == "*"' "$cfg"
check "plugin is a link to current's plugin.js" \
  test -L "$home/.config/opencode/plugins/agent-guard.js" -a "$(/usr/bin/readlink "$home/.config/opencode/plugins/agent-guard.js")" = "$engine/current/profiles/opencode/plugin.js"
only_plugin() {
  setopt local_options extended_glob
  local -a found=("$home/.config/opencode/plugins"/(#i)*.(js|ts)(ND))
  [[ ${#found} == 1 && ${found[1]:t} == agent-guard.js ]]
}
check "plugin folder holds no other .js or .ts file" only_plugin
version_line() {
  setopt local_options extended_glob
  local out
  out=$("$engine/bin/agent-guard" version) &&
    [[ $out == "Agent Guard $version ("(v$version|checkout)", commit "[0-9A-Za-z]##"), release $rid, installed "[0-9-]##" "[0-9:]##" UTC" ]]
}
check "agent-guard version names the version and release and reports no drift" version_line
refuses "agent-guard lists its commands" "usage: agent-guard doctor|version|update|uninstall" "$engine/bin/agent-guard"
check "rulebook agent-guard" /usr/bin/jq -e '.name == "agent-guard"' "$cc/agent-guard/rulebook.json"
check "rule.json lists agent-guard and keeps the other rule" /usr/bin/jq -e '.rules == ["agent-guard", "custom"]' "$cc/rule.json"
new_blocks() {
  local rc
  for rc in "$home/.zprofile" "$home/.zshrc"; do
    /usr/bin/grep -Fxq '# >>> agent-guard >>>' "$rc" && /usr/bin/grep -Fxq '# <<< agent-guard <<<' "$rc" || return 1
  done
}
check "agent-guard PATH blocks" new_blocks
check "app bundle ID" test "$(/usr/bin/plutil -extract CFBundleIdentifier raw "$home/Applications/Agent Guard.app/Contents/Info.plist")" = io.github.ebrindley.agentguard

# Each reinstall switches current and keeps only the release it replaced.
first=$rid
for n in 2 3; do
  /bin/zsh "$root/install.sh" </dev/null > "$home/reinstall.log" 2>&1 || { fail "reinstall $n"; /bin/cat "$home/reinstall.log" }
  prev=$rid
  rid=$(<"$engine/current/RELEASE")
  releases=("$engine"/releases/*(N:t)) kept=("$rid" "$prev")
  check "reinstall $n switches current and keeps the new and the previous release" \
    test "$rid" != "$prev" -a "$(/usr/bin/readlink "$engine/current")" = "releases/$rid" -a "${(j: :)releases}" = "${(j: :)${(@o)kept}}"
done
release="$engine/releases/$rid"
check "reinstall keeps one plugin, the link" only_plugin

# OpenCode Guard's engine folder under ALLOW: the profile and the plugin still protect it.
/bin/mkdir -p "$old_engine"
/usr/bin/awk -v h="$home" '
  /^ALLOW -/ { print; print h "/Projects/archive/live"; print h "/Library/Application Support/OpenCodeGuard"; print h "/Library"; print "/"; next }
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
first_line() { [[ "$(/usr/bin/head -1 "$log")" == "Agent Guard profile $rid "* ]] }
check "first log line names the release" first_line

# The launcher runs only from a release folder directly inside the engine's releases/.
copy="$home/Projects/releases/$rid"
/bin/mkdir -p "${copy:h}"
/bin/cp -R "$release/" "$copy"
refuses "copied launcher outside the engine refused" "not an installed release: $copy" /bin/zsh "$copy/launch" profile
/bin/rm -rf "${copy:h}"
/bin/cp -R "$release/" "$engine/releases/no-release-file"
/bin/rm "$engine/releases/no-release-file/RELEASE"
refuses "launcher in a release folder without RELEASE refused" "not an installed release" \
  /bin/zsh "$engine/releases/no-release-file/launch" profile
/bin/rm -rf "$engine/releases/no-release-file"

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
expect no "write OpenCode Guard's engine folder, though under ALLOW" sb /usr/bin/touch "$old_engine/x"
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

# OpenCode's package stores, bin and model catalog are write-protected inside the
# writable cache (docs/DESIGN.md section 9), at the default root and at a root
# relocated by XDG_CACHE_HOME into ALLOW. That root is named through a link and
# its bin is a link into ALLOW, so the denies must hold against the list and at
# link targets.
oc="$home/.cache/opencode" xdg="$home/Projects/xdg cache" xdg_link="$home/Projects/xdg-link" linked_bin="$home/Projects/linked-bin"
/bin/mkdir -p "$xdg/opencode" "$linked_bin"
/bin/ln -s "$xdg" "$xdg_link"
/bin/ln -s "$linked_bin" "$xdg/opencode/bin"
for o in "$oc" "$xdg/opencode"; do
  /bin/mkdir -p "$o/packages/probe@1.0.0/node_modules/probe" "$o/bin/"
  print '// probe' > "$o/packages/probe@1.0.0/node_modules/probe/index.js"
  for f in package.json package-lock.json bun.lock models-0a1b2c.json; do print '{}' > "$o/$f"; done
  print '#!/bin/sh' > "$o/bin/rg"
done
# The legacy store and models.json exist at the default root only; the relocated
# root checks that they cannot be created.
/bin/mkdir -p "$oc/node_modules/probe"
print '// probe' > "$oc/node_modules/probe/index.js"
print '{}' > "$oc/models.json"
xdg_profile=$(cd "$home/Projects/app" && XDG_CACHE_HOME=$xdg_link "${launcher[@]}" profile 2>/dev/null) || fail "profile with XDG_CACHE_HOME"
check "launch log names both write-protected cache folders" /usr/bin/grep -Fq "write-protected in $xdg/opencode and $oc, maintained outside the guard" "$log"
xsb() { local profile=$xdg_profile; sb "$@" }
# cache_denied LABEL SANDBOX FOLDER: in FOLDER, a cache root's opencode folder, the
# store, bin and catalog cannot be written, created, removed, renamed or replaced,
# and neither can FOLDER or the root; other files there stay writable.
cache_denied() {
  local l=$1 s=$2 o=$3 f
  expect no "$l: write a stored package"           $s /bin/sh -c "echo x >> '$o/packages/probe@1.0.0/node_modules/probe/index.js'"
  expect no "$l: add a package"                    $s /bin/mkdir -p "$o/packages/new@1.0.0/node_modules/new"
  expect no "$l: plant a link in the store"        $s /bin/ln -s /private/tmp "$o/packages/link"
  expect no "$l: delete a stored package"          $s /bin/rm -rf "$o/packages/probe@1.0.0"
  expect no "$l: rename the store"                 $s /bin/mv "$o/packages" "$o/packages.old"
  for f in package.json package-lock.json bun.lock; do
    expect no "$l: write $f"                       $s /bin/sh -c "echo x >> '$o/$f'"
    expect no "$l: delete $f"                      $s /bin/rm -f "$o/$f"
  done
  expect no "$l: write a tool in bin"              $s /bin/sh -c "echo x >> '$o/bin/rg'"
  expect no "$l: add a tool to bin"                $s /usr/bin/touch "$o/bin/gopls"
  expect no "$l: delete a tool from bin"           $s /bin/rm -f "$o/bin/rg"
  expect no "$l: rename bin"                       $s /bin/mv "$o/bin" "$o/bin.old"
  expect no "$l: replace bin with a link"          $s /bin/ln -sfh /private/tmp "$o/bin"
  expect no "$l: write models-<hash>.json"         $s /bin/sh -c "echo x >> '$o/models-0a1b2c.json'"
  expect no "$l: create a new models-<hash>.json"  $s /usr/bin/touch "$o/models-ffff.json"
  expect ok "$l: write the catalog's temporary file" $s /usr/bin/touch "$o/models-0a1b2c.json.1.2.tmp"
  expect no "$l: rename it over the catalog"       $s /bin/mv "$o/models-0a1b2c.json.1.2.tmp" "$o/models-0a1b2c.json"
  expect no "$l: delete models-<hash>.json"        $s /bin/rm -f "$o/models-0a1b2c.json"
  expect no "$l: rename the opencode folder"       $s /bin/mv "$o" "$o.old"
  expect no "$l: rename the cache root"            $s /bin/mv "${o:h}" "${o:h}.old"
  expect ok "$l: write another file in the opencode folder" $s /usr/bin/touch "$o/version"
  expect ok "$l: write elsewhere in the cache root" $s /bin/mkdir -p "${o:h}/other-tool/x"
}
cache_denied "default cache" sb "$oc"
expect no "default cache: write models.json"       sb /bin/sh -c "echo x >> '$oc/models.json'"
expect no "default cache: rename a file over models.json" sb /bin/mv "$oc/models-0a1b2c.json.1.2.tmp" "$oc/models.json"
expect no "default cache: write the legacy store"  sb /bin/sh -c "echo x >> '$oc/node_modules/probe/index.js'"
expect no "default cache: rename the legacy store" sb /bin/mv "$oc/node_modules" "$oc/node_modules.old"
cache_denied "relocated cache inside ALLOW" xsb "$xdg/opencode"
expect no "relocated cache: create models.json where none exists" xsb /usr/bin/touch "$xdg/opencode/models.json"
expect no "relocated cache: create the legacy store as a link" xsb /bin/ln -s "$linked_bin" "$xdg/opencode/node_modules"
expect no "relocated cache: write in bin's link target"  xsb /usr/bin/touch "$linked_bin/gopls"
expect no "relocated cache: delete the link that names the root" xsb /bin/rm -f "$xdg_link"
expect no "relocated cache: rename the link that names the root" xsb /bin/mv "$xdg_link" "$xdg_link.old"
expect no "relocated cache: the default store stays protected" xsb /usr/bin/touch "$oc/packages/new"
for value in cache "$home/missing-cache" "$home/Projects/dotfiles/zshrc"; do
  refuses "XDG_CACHE_HOME=$value refused" "XDG_CACHE_HOME must name an existing folder by its full path" \
    /usr/bin/env XDG_CACHE_HOME=$value "${launcher[@]}" profile
done
refuses "terminal launch with an unresolvable XDG_CACHE_HOME refused" "XDG_CACHE_HOME must name" \
  /usr/bin/env XDG_CACHE_HOME=cache "$engine/bin/opencode" --version

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
# Any executable inside either engine folder is skipped, not only the shims.
inside=("$engine/state/fakebin" "$old_engine/fakebin")
for d in $inside; do
  /bin/mkdir -p "$d"
  print -r -- $'#!/bin/sh\necho engine >> "$HOME/Projects/app/stub-runs"' > "$d/opencode"
  /bin/chmod 755 "$d/opencode"
done
stub_ran "candidates inside either engine folder skipped" '1 - confined' \
  /usr/bin/env PATH="${(j.:.)inside}:$home/stub:$PATH" "$engine/bin/opencode"
/bin/rm -rf $inside

{
  plugin="$home/.config/opencode/plugins/agent-guard.js"
  /bin/mkdir -p "$home/Projects/net/rules"
  print -r -- '{"version":1,"rules":[],"overrides":{},"transparent_wrappers":["env"]}' > "$home/Projects/net/rules/rule.json"
  node "$root/test/plugin.mjs" "$plugin" unguarded || fails=$((fails + 1))
  AGENT_GUARD_BYPASS=1 node "$root/test/plugin.mjs" "$plugin" bypass || fails=$((fails + 1))
  OPENCODE_GUARD_BYPASS=1 node "$root/test/plugin.mjs" "$plugin" old-bypass || fails=$((fails + 1))
  sb "$(command -v node)" "$root/test/plugin.mjs" "$plugin" guarded "Agent Guard $version ($rid) is active." || fails=$((fails + 1))
  # A launch from the previous release loads that release's plugin through current,
  # which names the new one. The fake CLI runs its arguments.
  /bin/mkdir -p "$home/execbin"
  print -r -- $'#!/bin/sh\nexec "$@"' > "$home/execbin/opencode"
  /bin/chmod 755 "$home/execbin/opencode"
  launch_prev_argv=$(node "$adapter" launcher "$engine" "$prev") || fail "adapter launcher for a release"
  (cd "$home/Projects/app" && PATH="$home/execbin:$PATH" "${(@f)launch_prev_argv}" cli \
    "$(command -v node)" "$root/test/plugin.mjs" "$plugin" guarded "Agent Guard $version ($prev) is active." 2>/dev/null) || fails=$((fails + 1))
  launched_prev() { [[ "$(/usr/bin/head -1 "$log")" == "Agent Guard cli $prev "* && $(<"$engine/current/RELEASE") == "$rid" ]] }
  check "launch from the previous release logs it while current names the new one" launched_prev
  # A launch whose release is gone refuses guarded tools; other names are ignored.
  sb /usr/bin/env AGENT_GUARD_RELEASE="$first" "$(command -v node)" "$root/test/plugin.mjs" "$plugin" updated || fails=$((fails + 1))
  for name in "../releases/$prev" "$engine/releases/$prev"; do
    sb /usr/bin/env AGENT_GUARD_RELEASE="$name" "$(command -v node)" "$root/test/plugin.mjs" "$plugin" status \
      "Agent Guard $version ($rid) is active." || fails=$((fails + 1))
  done
  # A copy of the plugin outside releases/ loads no cc-safety-net.
  /bin/cp "$release/profiles/opencode/plugin.js" "$home/Projects/plugin-copy.js"
  sb "$(command -v node)" "$root/test/plugin.mjs" "$home/Projects/plugin-copy.js" outside || fails=$((fails + 1))
  /bin/mv "$engine/state" "$engine/state.real" && /bin/ln -s /System "$engine/state"
  node "$root/test/plugin.mjs" "$plugin" symlinked || fails=$((fails + 1))
  /bin/rm "$engine/state" && /bin/mv "$engine/state.real" "$engine/state"
}

# check staged on a release that is not current: it must load that release's
# plugin, not the live one, and leave rules.json and OpenCode's config alone.
refuses "check staged refused for the current release" "not current" "$engine/current/launch" check staged
refuses "check staged refused for the current release by its real path" "not current" "$release/launch" check staged
next="$engine/releases/0.0.0-20000101T000000Z"
/bin/cp -R "$release/" "$next"
print -r -- "${next:t}" > "$next/RELEASE"
/bin/rm -f "$engine/state/rules.json" "$home/.config/opencode/.gitignore"
out=$("$next/launch" check staged 2>&1) && [[ $out == *"ok   plugins loaded in OpenCode (staged)"* ]] &&
  pass "check staged passes for a staged release" || { fail "check staged passes for a staged release"; print -r -- "$out" }
check "check staged writes no rules.json, no OpenCode config and no serve pid" \
  test ! -e "$engine/state/rules.json" -a ! -e "$home/.config/opencode/.gitignore" -a ! -e "$engine/state/.serve.pid"
/usr/bin/sed -i '' 's/agent_guard_status: status/agent_guard_status_off: status/' "$next/profiles/opencode/plugin.js"
refuses "check staged fails when the staged plugin lacks the status tool" "FAIL plugins not loaded in OpenCode (staged)" \
  "$next/launch" check staged
out=$("$engine/bin/agent-guard" doctor 2>&1) && [[ $out == *"ok   plugins loaded in OpenCode"* ]] &&
  pass "doctor passes with the live plugin meanwhile" || { fail "doctor passes with the live plugin meanwhile"; print -r -- "$out" }
/bin/rm -rf "$next"

# Configured plugins with the store write-protected, through the real OpenCode CLI.
# A package already in the store loads without writing. Once its folder is gone,
# doctor fails, naming it and the maintenance procedure; a plugin whose init throws
# is named too. OpenCode starts with bin missing, because the launch creates it.
probe_pkg="$oc/packages/guard-probe-plugin@latest/node_modules/guard-probe-plugin"
/bin/mkdir -p "$probe_pkg"
print -r -- '{"name":"guard-probe-plugin","version":"1.0.0","type":"module","main":"index.js"}' > "$probe_pkg/package.json"
print -r -- "import { appendFileSync } from 'node:fs'
export const GuardProbe = async () => { appendFileSync('$home/Projects/app/probe-plugin-loaded', 'loaded\\n'); return {} }" > "$probe_pkg/index.js"
print -r -- 'export const ThrowsProbe = async () => { throw new Error("probe init failure") }' > "$home/Projects/throws-plugin.js"
/bin/cp "$cfg" "$run/cfg.saved"
/usr/bin/jq '.plugin = ["guard-probe-plugin"]' "$run/cfg.saved" > "$cfg"
/bin/rm -rf "$oc/bin"
out=$("$engine/bin/agent-guard" doctor 2>&1) && [[ $out == *"ok   plugins loaded in OpenCode"* && -s $home/Projects/app/probe-plugin-loaded ]] &&
  pass "an npm plugin in the write-protected store loads and doctor passes" || { fail "an npm plugin in the write-protected store loads and doctor passes"; print -r -- "$out" }
check "the launch created the missing bin folder" test -d "$oc/bin"
check "doctor leaves no server output, events or pid" test -z "$(print -l "$engine"/state/.(serve|events).*(N))"
/bin/rm -rf "${probe_pkg:h:h}"
/usr/bin/jq --arg f "file://$home/Projects/throws-plugin.js" '.plugin = ["guard-probe-plugin", $f]' "$run/cfg.saved" > "$cfg"
out=$("$engine/bin/agent-guard" doctor 2>&1) && rc=0 || rc=$?
(( rc )) && [[ $out == *"FAIL plugin not loaded in OpenCode: Failed to install plugin guard-probe-plugin@latest: "*"install it outside the guard (Agent Guard's README, Maintenance outside the guard)"* ]] &&
  pass "doctor fails and names a plugin missing from the store" || { fail "doctor fails and names a plugin missing from the store"; print -r -- "$out" }
[[ $out == *"FAIL plugin not loaded in OpenCode: path=file://$home/Projects/throws-plugin.js"*"probe init failure"* ]] &&
  pass "doctor names a plugin whose init fails" || { fail "doctor names a plugin whose init fails"; print -r -- "$out" }
/bin/cp "$run/cfg.saved" "$cfg"

# ripgrep: with none on PATH, OpenCode runs the one in bin; with none in either,
# doctor names it. The fake rg from the deny checks is replaced first.
ocbin="$run/ocbin"
/bin/mkdir -p "$ocbin"
/bin/ln -s "${$(command -v opencode):A}" "$ocbin/opencode"
/bin/ln -s "$(command -v node)" "$ocbin/node"
/bin/rm -f "$oc/bin/rg"
out=$(PATH="$ocbin:/usr/bin:/bin" "$engine/bin/agent-guard" doctor 2>&1)
[[ $out == *"warn ripgrep is not on PATH or in $oc/bin"*"Maintenance outside the guard"* ]] &&
  pass "doctor names ripgrep when it is neither on PATH nor in bin" || { fail "doctor names ripgrep when it is neither on PATH nor in bin"; print -r -- "$out" }
if rg=$(command -v rg); then
  /bin/cp "$rg" "$oc/bin/rg"
  print -r -- 'guard-rg-needle' > "$home/Projects/app/rg-probe.txt"
  out=$(cd "$home/Projects/app" && PATH="$ocbin:/usr/bin:/bin" "$engine/bin/opencode" debug rg search guard-rg-needle 2>&1)
  [[ $out == *rg-probe.txt* ]] && pass "OpenCode runs ripgrep from the write-protected bin" || { fail "OpenCode runs ripgrep from the write-protected bin"; print -r -- "$out" }
else
  print -r -- "skip ripgrep from bin (no rg on this Mac to copy)"
fi

# The model catalog under the deny, with a local catalog source (OPENCODE_MODELS_URL),
# so no network is needed. The catalog is older than OpenCode's 5-minute refresh
# interval. OpenCode fetches the refresh, cannot rename it over the catalog, logs
# and ignores that, and lists the catalog on disk; with no catalog it lists its
# bundled snapshot and creates none.
served="$run/served"
/bin/mkdir -p "$served/catalog"
catalog() {
  print -r -- "{\"guardprobe\":{\"id\":\"guardprobe\",\"name\":\"Guard probe\",\"env\":[\"GUARD_PROBE_API_KEY\"],\"npm\":\"@ai-sdk/openai-compatible\",\"api\":\"http://127.0.0.1:9/v1\",\"models\":{\"$1\":{\"id\":\"$1\",\"name\":\"$1\",\"release_date\":\"2026-01-01\",\"attachment\":false,\"reasoning\":false,\"temperature\":true,\"tool_call\":true,\"limit\":{\"context\":1000,\"output\":100}}}}}"
}
catalog served-model > "$served/catalog/api.json"
node "$source_root/test/release-server.mjs" "$served" > "$run/catalog-port" 2>/dev/null &
catalog_server=$!
for i in {1..100}; do [[ -s $run/catalog-port ]] && break; sleep 0.05; done
models_url="http://127.0.0.1:$(<"$run/catalog-port")/assets/catalog"
models_file="$oc/models-$(print -rn -- "$models_url" | /usr/bin/shasum -a 1 | /usr/bin/cut -c1-40).json"
catalog disk-model > "$models_file"
/usr/bin/touch -t 202601010000 "$models_file"
catalog_state() { /usr/bin/stat -f '%m %z' "$models_file" && /usr/bin/shasum -a 256 < "$models_file" }
before=$(catalog_state)
models() { (cd "$home/Projects/app" && OPENCODE_MODELS_URL=$models_url GUARD_PROBE_API_KEY=x "$engine/bin/opencode" models "$@" --print-logs --log-level ERROR 2>&1) }
out=$(models --refresh guardprobe)
[[ $out == *"Models cache refreshed"* && $out == *guardprobe/disk-model* && $out != *served-model* ]] &&
  pass "models --refresh inside the guard still lists the catalog on disk" || { fail "models --refresh inside the guard still lists the catalog on disk"; print -r -- "$out" }
[[ $out == *'"Failed to fetch models.dev"'*'FileSystem.rename'* ]] &&
  pass "the refresh is fetched, fails at the rename and is logged" || { fail "the refresh is fetched, fails at the rename and is logged"; print -r -- "$out" }
[[ $(catalog_state) == "$before" ]] && pass "the catalog's content and modification time are unchanged" || fail "the catalog's content and modification time are unchanged"
check "no temporary catalog file is left" test -z "$(print -l "$models_file".*.tmp(N))"
/bin/rm -f "$models_file"
out=$(models)
[[ $out == *$'\n'opencode/* && ! -e $models_file ]] &&
  pass "with no catalog OpenCode lists its bundled snapshot and creates none" || { fail "with no catalog OpenCode lists its bundled snapshot and creates none"; print -r -- "$out" }
kill $catalog_server 2>/dev/null

# OpenCode Guard's plugin next to Agent Guard's: doctor names it; uninstall leaves it.
add_old_parts
refuses "doctor fails with OpenCode Guard's plugin also installed" "FAIL OpenCode Guard's plugin is also in" "$engine/bin/agent-guard" doctor
/bin/zsh "$engine/current/uninstall.sh" >/dev/null 2>&1
[[ ! -e $engine && ! -L $home/.config/opencode/plugins/agent-guard.js && ! -e $cc/agent-guard ]] && pass "uninstall" || fail "uninstall"
check "rc block removed" sh -c "! /usr/bin/grep -q agent-guard '$home/.zshrc' '$home/.zprofile'"
check "rule.json keeps the other rule and opencode-guard" /usr/bin/jq -e '.rules == ["custom", "opencode-guard"]' "$cc/rule.json"
check "uninstall leaves OpenCode Guard's blocks and rulebook unchanged" old_untouched
check "uninstall leaves OpenCode Guard's plugin unchanged" /usr/bin/cmp -s "$orig/plugin.js" "$old_plugin"
check "permissions restored" /usr/bin/jq -e --argjson o "$original" '.permission == $o.permission' "$cfg"

/bin/rm -rf "$run"
print -r -- "$fails failure(s)"
(( fails == 0 ))

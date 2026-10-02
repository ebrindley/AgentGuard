# Helpers for the installer test runners (test/bootstrap.sh; the install and
# migration runners use the rest). Source it after defining pass and fail.
# Paths follow the engine layout in design section 1.1: current -> releases/<rid>,
# bin -> current/bin, state/.

# A release ID: <version>-<UTC yyyymmddTHHMMSSZ>.
lib_dir=${${(%):-%x}:A:h}
rid_pattern='[0-9A-Za-z.+-]+-[0-9]{8}T[0-9]{6}Z'

# The installer's and uninstaller's test points that only test/migrate.sh exercises
# (design section 9.5). test/install.sh counts them as covered; test/migrate.sh fails
# for any it does not exercise.
migrate_points=(list-import import discard fwd-cli fwd-gui plugin-take plugin-name app-old switch-time
                retire-rulejson retire-rulebook retire-compare retire-engine retire-note uninstall-forwarders)
# The same for the Pi harness and the move from pi-sandbox-guard, which only
# test/migrate-pi.sh exercises; it fails for any it does not exercise. ag_pi_put
# names the points of the copies in ~/.local/bin by variable.
pi_points=(psg-wrappers pi-bindings pi-preamble pi-profile pi-launcher-pi pi-launcher-omp pi-extension pi-extension-gap
           psg-switch-time pi-keep psg-keep psg-retire-launchers psg-retire-backups psg-uninstall-copy)

# new_home DIR: replaces DIR with an empty disposable home. REPLY is its real path.
new_home() {
  /bin/rm -rf -- "$1"
  /bin/mkdir -p -- "$1"/{Projects/app,Documents,.config/opencode,Applications,"Library/Application Support"}
  REPLY=${1:A}
}

# listing DIR: every path under DIR, relative and sorted, with link targets.
listing() {
  local d=${1:A} p
  for p in "$d"/**/*(DN); do
    if [[ -L $p ]]; then print -r -- "${p#$d/} -> $(/usr/bin/readlink "$p")"; else print -r -- "${p#$d/}"; fi
  done | /usr/bin/sort
}

# snapshot HOME: sorted "path sha256" lines for the user data an install may touch,
# with release IDs replaced by <rid> and home by <home> in link targets, so two runs that leave the same state compare equal.
snapshot() {
  local h=${1:A} f
  local e="$h/Library/Application Support/AgentGuard" o="$h/Library/Application Support/OpenCodeGuard"
  local -a files=(
    "$h"/{.zprofile,.zshrc,.bash_profile}
    "$h"/.config/opencode/{config.json,opencode.json,opencode.jsonc}
    "$e/state/permissions.json" "$e/state/opencode-guard-permissions.json" "$o/state/permissions.json"
    "$h/Agent Guard/Guard List.txt" "$h/OpenCode Guard/Guard List.txt"
    "$h/OpenCode Guard/"{permissions-backup.json,"Moved to Agent Guard.txt"}
    "$h/.cc-safety-net/rules/rule.json"
    "$h"/.cc-safety-net/rules/*/**/*(.DN)
    "$h/Applications/"{Agent,OpenCode}" Guard.app/Contents/Info.plist"
  )
  {
    # OpenCode Guard's engine folder (its state/rules.json changes at each of its
    # launches), and the migration record without its switch time.
    for f in "$o"/**/*(DN); do
      [[ ${f#$o/} == state/rules.json ]] && continue
      if [[ -L $f ]]; then print -r -- "ocg/${f#$o/} -> ${$(/usr/bin/readlink "$f")//"$h"/<home>}"
      elif [[ -f $f ]]; then print -r -- "ocg/${f#$o/} $(/usr/bin/shasum -a 256 < "$f")"
      else print -r -- "ocg/${f#$o/}/"; fi
    done
    [[ -f $e/state/migration.json ]] && print -r -- "migration $(/usr/bin/jq -c 'del(.switched_at)' "$e/state/migration.json")"
    for f in ${(u)files}; do
      if [[ -f $f ]]; then
        print -r -- "${f#$h/} $(/usr/bin/shasum -a 256 < "$f")"
      else
        print -r -- "${f#$h/} absent"
      fi
      [[ -L $f ]] && print -r -- "${f#$h/} -> ${$(/usr/bin/readlink "$f")//"$h"/<home>}"
    done
    for f in "$h"/.config/opencode/plugins/*(DN); do
      if [[ -L $f ]]; then print -r -- "plugins/${f:t} -> ${$(/usr/bin/readlink "$f")//"$h"/<home>}"
      else print -r -- "plugins/${f:t} $(/usr/bin/shasum -a 256 < "$f")"; fi
    done
    [[ -f $e/current/VERSION ]] && print -r -- "current $(<"$e/current/VERSION")" || print -r -- "current absent"
    [[ -f $e/state/stamp.json ]] && print -r -- "stamp $(/usr/bin/jq -r .version "$e/state/stamp.json")" || print -r -- "stamp absent"
  } | /usr/bin/sed -E -e "s/$rid_pattern/<rid>/g" -e 's/ +- *$//' | /usr/bin/sort
}

# kill_tree PID: kills PID and every descendant.
kill_tree() {
  local c
  for c in ${(f)"$(/usr/bin/pgrep -P $1 2>/dev/null)"}; do kill_tree $c; done
  kill -KILL $1 2>/dev/null
}

# run_timeout SECONDS CMD...: runs CMD; after SECONDS kills it and its children
# and returns 124. Otherwise returns CMD's status.
run_timeout() {
  local limit=$1 pid ticks=0
  shift
  "$@" &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    if (( ticks >= limit * 20 )); then
      kill_tree $pid
      wait $pid 2>/dev/null
      return 124
    fi
    sleep 0.05
    ticks=$((ticks + 1))
  done
  wait $pid
}

# probe_entry_points HOME BASE_PATH OLD_PATH [PRE_SNAPSHOT]
# Design section 9.3. BASE_PATH holds the fake opencode (test/fake-opencode.mjs) and
# the system folders; OLD_PATH is the PATH a terminal had before the run;
# PRE_SNAPSHOT is the snapshot file from before a fresh install.
# Every entry must be guarded (launched written, escaped not) or refused (non-zero
# exit, nothing launched). escaped, or a timeout, fails. The plugin folder must
# never hold both guards' plugins (I1).
# A terminal whose PATH reaches no guard shim (E1 before a PATH block exists, E2
# from before a fresh install) runs the bare binary, which the fake CLI cannot
# refuse; E6 covers it: the plugin must refuse, or with no guard plugin the
# OpenCode config and plugin folder must be as before the install.
probe_entry_points() {
  local h=${1:A} base=$2 old=$3 pre=${4:-}
  local e="$h/Library/Application Support/AgentGuard" o="$h/Library/Application Support/OpenCodeGuard"
  local plugins="$h/.config/opencode/plugins" app target f
  local -a guard_plugins blocks

  probe_one() {
    local name=$1 rc
    shift
    /bin/rm -f -- "$h/Documents/escaped" "$h/Projects/app/launched"
    run_timeout 20 "$@" >/dev/null 2>&1
    rc=$?
    if [[ -e $h/Documents/escaped ]]; then fail "$name: escaped the guard"
    elif (( rc == 124 )); then fail "$name: timed out"
    elif [[ -e $h/Projects/app/launched ]]; then pass "$name: guarded"
    elif (( rc != 0 )); then pass "$name: refused"
    else fail "$name: exit 0 without launching"
    fi
  }

  blocks=(${(f)"$(/usr/bin/grep -lFx -e '# >>> agent-guard >>>' -e '# >>> opencode-guard >>>' "$h/.zprofile" "$h/.zshrc" 2>/dev/null)"})
  if (( $#blocks )); then
    probe_one "E1 new terminal" /usr/bin/env -i HOME="$h" PATH="$base" /bin/zsh -l -i -c opencode
  else
    pass "E1 new terminal: no PATH block, so the bare binary (E6)"
  fi
  if [[ ":$old:" == *":$e/bin:"* || ":$old:" == *":$o/bin:"* ]]; then
    probe_one "E2 old terminal" /usr/bin/env -i HOME="$h" PATH="$old" /bin/zsh -f -c opencode
  else
    pass "E2 old terminal: no guard on its PATH, so the bare binary (E6)"
  fi
  [[ -e $e/bin/opencode ]] && probe_one "E3 $e/bin/opencode" /usr/bin/env -i HOME="$h" PATH="$base" "$e/bin/opencode"
  [[ -e $o/bin/opencode ]] && probe_one "E4 $o/bin/opencode" /usr/bin/env -i HOME="$h" PATH="$base" "$o/bin/opencode"
  # E5 runs each app's target; the harness seam points the launcher at the fake
  # ~/Applications/OpenCode.app, whose executable name no real process has.
  for app in "$h/Applications/"{Agent,OpenCode}" Guard.app"(N); do
    # OpenCode Guard's launcher has no app seam: it looks in /Applications first,
    # and only then in the home and through Spotlight.
    if [[ ${app:t} == "OpenCode Guard.app" ]] && [[ -d /Applications/OpenCode.app ]]; then
      print -r -- "skip E5 ${app:t}: /Applications/OpenCode.app exists and OpenCode Guard's launcher would open it"
      continue
    fi
    target=$(/usr/bin/osadecompile "$app/Contents/Resources/Scripts/main.scpt" 2>/dev/null |
      /usr/bin/grep -o '/[^"]*/bin/opencode-gui' | /usr/bin/head -1)
    [[ -n $target ]] || { fail "E5 ${app:t}: no opencode-gui target"; continue }
    probe_one "E5 ${app:t}" /usr/bin/env -i HOME="$h" PATH="$base" AG_TEST_PGREP=1 "${target//\$HOME/$h}"
  done
  # E6: a bare binary meets only the plugin.
  guard_plugins=("$plugins"/(agent-guard|opencode-guard).js(N))
  if (( $#guard_plugins )); then
    for f in $guard_plugins; do
      HOME=$h node "$lib_dir/plugin.mjs" "${f:A}" unguarded >/dev/null 2>&1 &&
        pass "E6 ${f:t} refuses unguarded" || fail "E6 ${f:t} refuses unguarded"
    done
  elif [[ -n $pre ]]; then
    # What a bare OpenCode reads: its configs and the plugin names it loads.
    [[ ${(M)${(f)"$(snapshot "$h")"}:#(.config/opencode/*|(#i)plugins/[^[:space:]]#.(js|ts)[[:space:]]*)} == ${(M)${(f)"$(<$pre)"}:#(.config/opencode/*|(#i)plugins/[^[:space:]]#.(js|ts)[[:space:]]*)} ]] &&
      pass "E6 no guard plugin; OpenCode config and plugins as before the install" ||
      fail "E6 no guard plugin and the OpenCode config or plugins differ from before the install"
  else
    fail "E6 no guard plugin after an install"
  fi
  (( $#guard_plugins < 2 )) && pass "I1 one guard plugin at most" || fail "I1 both guard plugins present"
}

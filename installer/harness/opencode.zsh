# Agent Guard installer: the OpenCode harness (docs/DESIGN.md sections 3 and 6),
# its plugin link and permission merge, and the hooks of the harness interface
# (actions.zsh).

ag_h_opencode_init() {
  conf="$home/.config/opencode"
  plugins="$conf/plugins"
  plugin="$plugins/agent-guard.js"
  plugin_target="$engine/current/profiles/opencode/plugin.js"
  # OpenCode 2's service config on its release channel (latest), read from
  # $XDG_CONFIG_HOME/opencode or OPENCODE_CONFIG_DIR when set; like the configs
  # above, the installer uses the default folder.
  service_conf="$conf/service.json"
}

ag_h_opencode_title() { REPLY=OpenCode }

# Installed on every Mac: without the CLI or the app the checks that need them are
# skipped and say so.
ag_h_opencode_detect() { return 0 }

ag_h_opencode_prepare() { ag_classify_configs }

ag_h_opencode_volume() { reply=("${plugins:A}") }

# The process check reads app_paths and app_bundle_id, also during recovery.
ag_h_opencode_bundle() { reply=(profiles/opencode/harness.zsh) }

# True for a plugin path that is Agent Guard's link (into current).
ag_ours() { [[ -L $1 && $(/usr/bin/readlink -- "$1") == "$plugin_target" ]] }

# Configuration may be linked into dotfiles, but maintenance must not rewrite
# guard policy or activation through a user-editable configuration link.
ag_opencode_config_writable() {
  local file=$1 target=${1:A} p resolved wrappers
  local -a protected=("$engine" "$home/Agent Guard" "$home/.cc-safety-net"
    "$home/.opencode/bin"
    "$home/Library/Application Support/OpenCodeGuard" "$home/Library/LaunchAgents"
    "$home/Applications/Agent Guard.app" "$home/.config/pi-sandbox-guard"
    "$home/.pi/agent/extensions/pi-sandbox-guard"
    "$home/.local/bin/pi-sandbox-guard-extension")
  for p in $protected; do
    for resolved in "$p" "${p:A}"; do
      if [[ $target == "$resolved" || $target == "$resolved"/* ]]; then
        ag_warn "$file not changed (target is protected: $target)"; return 1
      fi
    done
  done
  protected=("$home"/.{zshenv,zprofile,zshrc,zlogin,profile,bash_profile,bash_login,bashrc}
    "$home"/.local/bin/{pi,omp,pi-sandbox.sb,pi-sandbox-preamble.zsh}
    "$plugin" "$plugins/.agent-guard.js.partial")
  if [[ -f $engine/state/wrappers.json ]]; then
    if ! wrappers=$(/usr/bin/jq -r --arg prefix "$home/.local/bin/" '
      .wrappers | keys[] | select(test("^[A-Za-z0-9._-]+$") and . != "." and . != "..") | $prefix + .
      ' "$engine/state/wrappers.json" 2>/dev/null); then
      ag_warn "$file not changed (cannot read recorded guard wrappers)"; return 1
    fi
    protected+=("${(@f)wrappers}")
  fi
  for p in $protected; do
    [[ -n $p ]] || continue
    if [[ $target == "$p" || $target == ${p:A} ]]; then
      ag_warn "$file not changed (target is protected: $target)"; return 1
    fi
  done
  if [[ ( -L $file && ! -e $file ) || ( -e $file && ! -f $file ) ]]; then
    ag_warn "$file not changed (target is not a regular file)"; return 1
  fi
  return 0
}

ag_classify_configs() {
  local f
  ag_configs=()
  for f in "$conf/config.json" "$conf/opencode.json" "$conf/opencode.jsonc"; do
    ag_opencode_config_writable "$f" || continue
    [[ -e $f ]] || continue
    if ! /usr/bin/jq -e 'type == "object"' "$f" >/dev/null 2>&1; then
      ag_warnings+=("${f:t} not changed (comments or invalid JSON): review bash and external_directory permissions; preserve agent edit restrictions and explicit denies")
    elif /usr/bin/jq -e '.permission | type == "string"' "$f" >/dev/null; then
      ag_warnings+=("${f:t} not changed (permission is a single value)")
    elif ! /usr/bin/jq -e '(.permission // {}) | type == "object"' "$f" >/dev/null; then
      ag_warnings+=("${f:t} not changed (unsupported permission shape)")
    else
      ag_configs+=("$f")
      if /usr/bin/jq -e '.permission.edit == "allow" or .permission.edit == "ask" or ((.permission.edit | type) == "object")' "$f" >/dev/null 2>&1; then
        ag_warnings+=("${f:t}: global edit policy can override Plan/Explore restrictions; verify agent-specific edit rules and Plan planning-file exceptions")
      fi
    fi
  done
  if [[ ! -e $conf/config.json && ! -e $conf/opencode.json && ! -e $conf/opencode.jsonc ]] &&
      ag_opencode_config_writable "$conf/opencode.json"; then
    ag_configs=("$conf/opencode.json")
  fi
  return 0
}

# The OpenCode app's executable name, found as the launcher finds the app: the
# tree's harness data (app_paths, then Spotlight by bundle ID).
ag_app_exec() {
  REPLY=$(home=$home; source "$ag_tree/profiles/opencode/harness.zsh" 2>/dev/null || exit 1
    for a in $app_paths ${(f)"$(/usr/bin/mdfind "kMDItemCFBundleIdentifier == '$app_bundle_id'" 2>/dev/null)"}; do
      [[ -d $a/Contents/MacOS ]] || continue
      /usr/bin/plutil -extract CFBundleExecutable raw "$a/Contents/Info.plist" 2>/dev/null
      break
    done)
  [[ -n $REPLY ]]
}

# The processes a migration waits for: the CLI, the app and its helper.
ag_h_opencode_procs() {
  reply=(opencode "OpenCode Helper")
  ag_app_exec && reply+=("$REPLY")
  REPLY='Quit the OpenCode app and every opencode in a terminal'
}

# P7: the staged release's own check (design section 4.1).
ag_h_opencode_staged() {
  local out rc
  local -a found
  out=$(AGENT_GUARD_GATE=1 "$engine/releases/$ag_rid_new/launch" check staged 2>&1)
  rc=$?
  ag_say "$out"
  (( rc == 0 )) && return 0
  found=(${(M)${(f)out}:#FAIL*})
  (( $#found )) || found=("FAIL check staged exited $rc")
  ag_failed+=($found)
  return 1
}

ag_h_opencode_gate() { ag_launch_check "$engine/bin/opencode" bin/opencode }

ag_launch_check() {  # COMMAND LABEL
  local out log="$list_dir/last-launch-opencode.log" first=
  integer rc
  /bin/rm -f -- "$log"
  out=$(ag_bounded 20 "$1" --version 2>&1)
  rc=$?
  [[ -r $log ]] && first=$(/usr/bin/head -1 -- "$log")
  if (( rc != 0 && rc != 124 )) && [[ $out == *'agent-guard: opencode not found'* ]]; then
    ag_say "skip launch check (opencode CLI not found): $2"
  elif (( rc == 124 )); then
    ag_failed+=("FAIL opencode --version through $2 did not finish within 20 seconds")
  elif (( rc )); then
    ag_failed+=("FAIL opencode --version through $2 exited $rc")
  elif [[ $first != "Agent Guard cli $ag_rid_new "* ]]; then
    ag_failed+=("FAIL opencode --version through $2 did not run release $ag_rid_new")
  else
    ag_say "ok   opencode --version through $2 ran release $ag_rid_new"
  fi
}

ag_h_opencode_links() { reply=("$plugin" "$(/usr/bin/readlink -- "$plugin")") }

# The launcher's check (design section 8). With --json: reply = its lines.
ag_h_opencode_doctor() {
  local out
  integer rc
  [[ ${2:-} == --json ]] || { "$1/launch" check; return }
  out=$("$1/launch" check 2>&1)
  rc=$?
  reply=("${(@f)out}") REPLY='{}'
  return $rc
}

ag_h_opencode_report() {
  local preference="$state/opencode-preferences.json"
  ag_say 'PATH: new terminal windows run opencode inside the guard'
  ag_say "GUI: $app (drag it to the Dock)"
  "$engine/current/launch" find-app >/dev/null 2>&1 || ag_warnings+=('OpenCode.app not found: install it, then open Agent Guard')
  if [[ -f $preference ]] && /usr/bin/jq -e '.approvalPreference == "auto"' "$preference" >/dev/null 2>&1; then
    ag_say 'OpenCode automatic approval is requested, not verified active: use opencode --auto or opencode run --auto; desktop: Auto-accept permissions. Explicit denies and Guard enforcement remain.'
  fi
  return 0
}

# --- Switch actions (design section 3.2), registered in actions.zsh.

# S5: the plugin link, through the temporary name .agent-guard.js.partial, which
# OpenCode does not load. An update finds the link in place and writes nothing,
# and so does a migration whose plugin-take and plugin-name put it there.
do_plugin() {
  local tmp="$plugins/.agent-guard.js.partial" created=0 b="$txn_dir/backup/plugin"
  ag_jlast plugin
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -L $plugin && $(/usr/bin/readlink -- "$plugin") == "$plugin_target" ]]; then test_point plugin; return; fi
    [[ -e $plugin || -L $plugin ]] || created=1
    if [[ -f $plugin && ! -L $plugin ]]; then ag_backup plugin "$plugin" || return 1; else ag_backup plugin || return 1; fi
    if [[ -L $plugin ]]; then /usr/bin/readlink -- "$plugin" > "$b/link" || return 1; fi
    ag_jnl plugin begun "created=$created" || return 1
  fi
  /bin/mkdir -p -- "$plugins" && /bin/rm -f -- "$tmp" && /bin/ln -s "$plugin_target" "$tmp" || return 1
  test_point plugin || return 1
  /bin/mv -fh -- "$tmp" "$plugin" || return 1
  ag_jnl plugin done
}

undo_plugin() {
  local tmp="$plugins/.agent-guard.js.partial" b="$txn_dir/backup/plugin"
  ag_jlast plugin
  [[ $REPLY == (begun|done) ]] || return 0
  /bin/rm -f -- "$tmp"
  ag_jfind plugin begun
  ag_jval created
  if [[ -f $b/file ]]; then
    restore_over_link "$plugin" "$b/file" || return 1
  elif [[ -f $b/link ]]; then
    replace_link "$plugin" "$(<"$b/link")" || return 1
  elif [[ $REPLY == 1 && -L $plugin && $(/usr/bin/readlink -- "$plugin") == "$engine"/* ]]; then
    /bin/rm -f -- "$plugin" || return 1
  fi
  ag_jnl plugin undone
}

# Permission values (design section 3.3). The record gets orig and wrote before
# the config is written, so an interrupted run never leaves an allow value that
# uninstall cannot restore.
ag_perm_new() {  # CUR OUT
  /usr/bin/jq '(.permission // {}) as $p
    | if ($p | type) != "object" or $p["*"] == "deny" then . else
      .permission = (reduce ("bash", "external_directory") as $k ($p;
        if .[$k] == null or .[$k] == "ask" then .[$k] = "allow"
        elif (.[$k] | type) == "object" and .[$k]["*"] == "ask"
          and (all(.[$k][]; . != "deny")) then .[$k]["*"] = "allow"
        else . end)) end' "$1" > "$2"
}

ag_perm_entry() {  # CUR NEW: REPLY = the record entry
  REPLY=$(/usr/bin/jq -cn --slurpfile c "$1" --slurpfile n "$2" '($c[0].permission // {}) as $p
    | reduce ("bash", "external_directory") as $k ({};
        if $p[$k] == $n[0].permission[$k] then . else
        .[$k] = {orig: (if $p | has($k) then $p[$k] else null end), wrote: $n[0].permission[$k]} end)')
}

ag_perm_is() {  # CUR ENTRY orig|wrote: each recorded key equals that side of ENTRY
  /usr/bin/jq -e --argjson e "$2" --arg w "$3" '(.permission // {}) as $c
    | all($e | keys[]; $c[.] == $e[.][$w])' "$1" >/dev/null 2>&1
}

ag_perm_report() {  # FILE CUR ENTRY: names each key changed after install
  local k
  for k in edit bash external_directory; do
    if /usr/bin/jq -e --argjson e "$3" --arg k "$k" '($e[$k] // {} | has("wrote")) and ((.permission // {})[$k] != $e[$k].wrote)' "$2" >/dev/null 2>&1; then
      ag_warnings+=("left unchanged: $1 $k was changed after install")
    fi
  done
}

# ag_record_path FILE: REPLY = the JSON path of FILE's recorded keys: the top
# level of the service config, permission in every other config.
ag_record_path() {
  if [[ $1 == "$service_conf" ]]; then REPLY='[]'; else REPLY='["permission"]'; fi
}

# ag_perm_restore FILE ENTRY TMP: puts back each orig value where FILE still holds
# the recorded wrote value (null deletes the key); a key with no recorded wrote
# value is left as is. FILE is rewritten only when that changes its content, so a
# file the user changed back is not reformatted.
ag_perm_restore() {
  ag_opencode_config_writable "$1" || return 1
  ag_record_path "$1"
  # TMP is private: the service config holds OpenCode's service password.
  ( umask 077; /usr/bin/jq --argjson e "$2" --argjson p "$REPLY" 'reduce ($e | to_entries[]) as $x (.;
      ($p + [$x.key]) as $k
      | if ($x.value // {} | has("wrote")) and getpath($k) == $x.value.wrote then
        (if $x.value.orig == null then delpaths([$k]) else setpath($k; $x.value.orig) end)
      else . end)' "$1" > "$3" 2>/dev/null ) || return 1
  /usr/bin/jq -e --slurpfile n "$3" '. == $n[0]' "$1" >/dev/null 2>&1 && return 0
  replace_file "$1" "$3"
}

ag_record_set() {  # FILE ENTRY|-: adds FILE's entry, or with -, removes it
  local base="$ag_tstage/record.base.json" out="$ag_tstage/record.json"
  if [[ -f $record ]]; then /bin/cp -- "$record" "$base" || return 1; else print '{}' > "$base" || return 1; fi
  if [[ $2 == - ]]; then
    /usr/bin/jq --arg f "$1" 'del(.[$f])' "$base" > "$out" || return 1
  else
    /usr/bin/jq --arg f "$1" --argjson e "$2" '.[$f] = $e' "$base" > "$out" || return 1
  fi
  replace_file "$record" "$out"
}

# This records setup intent, never native approval state or a launch flag.
do_opencode_preference() {
  local pref="$state/opencode-preferences.json" tmp="$ag_tstage/opencode-preferences.json"
  [[ -n ${ag_approval_preference:-} ]] || return 0
  ag_jlast opencode-preference
  [[ $REPLY == (done|undone) ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -f $pref ]] && /usr/bin/jq -e --arg p "$ag_approval_preference" '. == {schemaVersion:1, approvalPreference:$p}' "$pref" >/dev/null 2>&1; then return 0; fi
    ag_backup opencode-preference "$pref" && ag_jnl opencode-preference begun || return 1
  fi
  /usr/bin/jq -n --arg p "$ag_approval_preference" '{schemaVersion:1, approvalPreference:$p}' > "$tmp" && replace_file "$pref" "$tmp" || return 1
  ag_jnl opencode-preference done
}

undo_opencode_preference() {
  local pref="$state/opencode-preferences.json" backup="$txn_dir/backup/opencode-preference/file"
  ag_jlast opencode-preference
  [[ $REPLY == (begun|done) ]] || return 0
  # A later owner's state is preserved, as with configuration permission writes.
  if [[ -f $pref ]] && /usr/bin/jq -e --arg p "$ag_approval_preference" '. == {schemaVersion:1, approvalPreference:$p}' "$pref" >/dev/null 2>&1; then
    if [[ -f $backup ]]; then replace_file "$pref" "$backup" || return 1
    else /bin/rm -f -- "$pref" || return 1; fi
  fi
  ag_jnl opencode-preference undone
}

# Retire only the old global edit write. The frozen ledger and per-file journal
# distinguish a resumed restoration from an unrelated user edit. Rollback uses
# original bytes only while the file exactly matches this restoration's output.
do_retire_edit() {
  local snapshot="$txn_dir/backup/retire-edit/file" f old st restore entry saved expected
  local -a files
  integer n
  ag_jlast retire-edit
  [[ $REPLY == (done|undone) ]] && return 0
  if [[ -z $REPLY ]]; then
    [[ -f $record ]] || return 0
    /usr/bin/jq -e 'any(.[]; (.edit // {} | has("wrote")))' "$record" >/dev/null 2>&1 || return 0
    ag_backup retire-edit "$record" && ag_jnl retire-edit begun || return 1
  fi
  files=(${(f)"$(/usr/bin/jq -r 'to_entries[] | select(.value.edit // {} | has("wrote")) | .key' "$snapshot")"})
  for (( n = 1; n <= $#files; n++ )); do
    f=$files[n]
    ag_jlast retire-edit-file $n; st=$REPLY
    [[ $st == (done|undone) ]] && continue
    old=$(/usr/bin/jq -c --arg f "$f" '.[$f].edit' "$snapshot") || return 1
    if ! ag_opencode_config_writable "$f" || [[ ! -f $f ]] ||
       ! /usr/bin/jq -e 'type == "object" and ((.permission // {}) | type == "object")' "$f" >/dev/null 2>&1; then
      ag_warnings+=("edit migration deferred: $f (config-unavailable); original ownership retained")
      continue
    fi
    restore=0
    if [[ $st == begun ]]; then
      ag_jfind retire-edit-file begun $n; ag_jval restore; restore=$REPLY
    elif /usr/bin/jq -e --argjson e "$old" '(.permission // {}).edit == $e.wrote' "$f" >/dev/null; then
      if [[ ${ag_restore_edit_permissions:-0} != 1 ]] && /usr/bin/jq -en --argjson e "$old" '
          $e.orig == "ask" or (($e.orig | type) == "object" and any($e.orig[]; . == "ask"))' >/dev/null; then
        ag_warnings+=("edit migration deferred: $f (approval-prompts-would-return); after choosing native auto-approval, rerun with --restore-edit-permissions")
        continue
      fi
      restore=1
      ag_backup "retire-edit-$n" "$f" || return 1
      saved="$txn_dir/backup/retire-edit-$n/file" expected="$txn_dir/backup/retire-edit-$n/expected"
      /usr/bin/jq --argjson e "$old" 'if .permission.edit == $e.wrote then
        if $e.orig == null then del(.permission.edit) else .permission.edit = $e.orig end
        else . end' "$saved" > "$expected" || return 1
      # ag_perm_restore leaves semantically unchanged files byte-identical.
      if /usr/bin/jq -e --slurpfile n "$expected" '. == $n[0]' "$saved" >/dev/null; then
        /bin/cp -- "$saved" "$expected" || return 1
      fi
      ag_jnl retire-edit-file begun "$n restore=$restore" || return 1
    else
      ag_warnings+=("edit migration: $f user change preserved; retired Guard ownership")
      ag_jnl retire-edit-file begun "$n restore=$restore" || return 1
    fi
    if [[ $restore == 1 ]]; then
      # A recovery resumes the write only while it still owns the current value.
      ag_perm_restore "$f" "$(/usr/bin/jq -cn --argjson e "$old" '{edit:$e}')" "$ag_tstage/edit.$n.json" || return 1
      if ! /usr/bin/jq -e --argjson e "$old" '(.permission // {}).edit == $e.orig' "$f" >/dev/null; then
        ag_warnings+=("edit migration: $f user change preserved during recovery")
      fi
    fi
    test_point edit-restored || return 1
    # Retire only an identical ownership entry; never replace concurrent state.
    entry=$(/usr/bin/jq -c --arg f "$f" --argjson e "$old" '
      .[$f] as $p | if $p.edit == $e then $p | del(.edit) else $p end' "$record") || return 1
    if [[ $entry == '{}' ]]; then ag_record_set "$f" - || return 1
    elif [[ $entry != null ]]; then ag_record_set "$f" "$entry" || return 1; fi
    test_point edit-retired || return 1
    ag_jnl retire-edit-file done "$n" || return 1
    ag_say "permissions: retired Guard-owned edit setting in $f"
  done
  ag_jnl retire-edit done
}

undo_retire_edit() {
  local snapshot="$txn_dir/backup/retire-edit/file" f old st restore entry saved expected
  local -a files
  integer n
  ag_jlast retire-edit
  [[ $REPLY == (begun|done) && -f $snapshot ]] || return 0
  files=(${(f)"$(/usr/bin/jq -r 'to_entries[] | select(.value.edit // {} | has("wrote")) | .key' "$snapshot")"})
  for (( n = $#files; n >= 1; n-- )); do
    f=$files[n]
    ag_jlast retire-edit-file $n; st=$REPLY
    [[ $st == (begun|done) ]] || continue
    old=$(/usr/bin/jq -c --arg f "$f" '.[$f].edit' "$snapshot") || return 1
    ag_jfind retire-edit-file begun $n; ag_jval restore; restore=$REPLY
    if [[ $restore == 1 ]]; then
      saved="$txn_dir/backup/retire-edit-$n/file" expected="$txn_dir/backup/retire-edit-$n/expected"
      if ! ag_opencode_config_writable "$f" || [[ ! -f $f ]]; then ag_unrestored+=("$f")
      elif [[ -f $saved ]] && /usr/bin/cmp -s -- "$f" "$saved"; then
        : # The write never happened, or rollback already restored it.
      elif [[ -f $saved && -f $expected ]] && /usr/bin/cmp -s -- "$f" "$expected"; then
        replace_file "$f" "$saved" || ag_unrestored+=("$f")
      # Later changes retain their contents; restore only the owned edit key.
      elif ! ag_perm_restore "$f" "$(/usr/bin/jq -cn --argjson e "$old" '{edit:{orig:$e.wrote,wrote:$e.orig}}')" "$ag_tstage/edit.$n.undo.json"; then
        ag_unrestored+=("$f")
      fi
    fi
    entry=$(/usr/bin/jq -c --arg f "$f" --argjson e "$old" '
      (.[$f] // {}) | if has("edit") then . else .edit = $e end' "$record") || return 1
    ag_record_set "$f" "$entry" || return 1
    ag_jnl retire-edit-file undone "$n" || return 1
  done
  ag_jnl retire-edit undone
}

# Legacy retirement compares its immutable archive with live ownership. Only
# keys whose retirement completed in this transaction may differ.
ag_retired_edit_files() {
  local snapshot="$txn_dir/backup/retire-edit/file"
  local -a files retired
  integer n
  REPLY='[]'
  [[ -f $snapshot ]] || return 0
  files=(${(f)"$(/usr/bin/jq -r 'to_entries[] | select(.value.edit // {} | has("wrote")) | .key' "$snapshot")"})
  for (( n = 1; n <= $#files; n++ )); do
    ag_jlast retire-edit-file $n
    [[ $REPLY == done ]] && retired+=("$files[n]")
  done
  REPLY=$(/usr/bin/jq -cn '$ARGS.positional' --args "${retired[@]}")
}

# S6 maintains only previously unrecorded permissions; imported entries keep
# their first-install originals. Edit retirement is a separate journaled action.
do_permissions() {
  local f n st cur new entry created
  local -a changed_keys
  integer i
  for (( i = 1; i <= $#ag_configs; i++ )); do
    f=$ag_configs[i] n=$i
    ag_opencode_config_writable "$f" || continue
    ag_jlast permissions $n
    st=$REPLY
    [[ $st == (done|undone) ]] && continue
    cur="$ag_tstage/cfg.$n.cur.json" new="$ag_tstage/cfg.$n.json"
    if [[ -e $f ]]; then /bin/cp -- "$f" "$cur" || return 1; else print '{}' > "$cur" || return 1; fi
    entry=
    if [[ -f $record ]] && /usr/bin/jq -e --arg f "$f" 'has($f)' "$record" >/dev/null 2>&1; then
      entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record") || return 1
    fi
    if [[ -z $st && -n $entry ]]; then
      # An existing entry is never replaced: orig stays the first install's value.
      ag_perm_report "$f" "$cur" "$entry"
      continue
    fi
    ag_perm_new "$cur" "$new" || return 1
    if [[ $st == begun && -n $entry ]]; then
      # The record was written; the config may or may not have been.
      if ag_perm_is "$cur" "$entry" wrote; then
        ag_sha "$f" && ag_jnl permissions done "$n $REPLY" || return 1
        continue
      fi
      if ! ag_perm_is "$cur" "$entry" orig; then
        ag_perm_report "$f" "$cur" "$entry"
        ag_jnl permissions done "$n -" || return 1
        continue
      fi
    else
      ag_perm_entry "$cur" "$new" || return 1
      entry=$REPLY
      [[ $entry == '{}' ]] && continue
      if [[ -z $st ]]; then
        created=0
        [[ -e $f ]] || created=1
        ag_backup "permissions-$n" "$f" && ag_jnl permissions begun "$n created=$created" || return 1
      fi
      ag_record_set "$f" "$entry" || return 1
      /bin/sync
    fi
    test_point perm-recorded || return 1
    /bin/mkdir -p -- "${f:h}" && replace_file "$f" "$new" || return 1
    ag_sha "$f" && ag_jnl permissions done "$n $REPLY" || return 1
    changed_keys=(${(f)"$(/usr/bin/jq -rn --argjson e "$entry" '$e | keys[]')"})
    ag_say "permissions: $f updated ${(j:, :)changed_keys}; edit and explicit denies preserved"
  done
  return 0
}

# Restores this transaction's permission writes. A config that cannot be restored
# keeps its record entry, is named in ag_unrestored and does not stop the rollback.
undo_permissions() {
  local f n st b entry done_hash created tmp
  integer i
  for (( i = $#ag_configs; i >= 1; i-- )); do
    f=$ag_configs[i] n=$i
    ag_jlast permissions $n
    st=$REPLY
    [[ $st == (begun|done) ]] || continue
    if ! ag_opencode_config_writable "$f"; then ag_unrestored+=("$f"); continue; fi
    b="$txn_dir/backup/permissions-$n/file" tmp="$ag_tstage/cfg.$n.undo.json"
    ag_jfind permissions begun $n
    ag_jval created
    created=$REPLY
    done_hash=
    if [[ $st == done ]] && ag_jfind permissions done $n; then done_hash=${${(s: :)REPLY}[2]:-}; fi
    entry=
    if [[ -f $record ]] && /usr/bin/jq -e --arg f "$f" 'has($f)' "$record" >/dev/null 2>&1; then
      entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record") || entry=
    fi
    ag_sha "$f"
    if [[ -f $b ]] && /usr/bin/cmp -s -- "$f" "$b"; then
      :   # not written yet
    elif [[ $created == 1 && ! -e $f ]]; then
      :
    elif [[ -n $done_hash && $done_hash != - && $REPLY == "$done_hash" ]]; then
      # Unchanged since this run wrote it: put back the bytes from before.
      if [[ $created == 1 ]]; then
        /bin/rm -f -- "$f" || { ag_unrestored+=("$f"); ag_jnl permissions undone "$n"; continue }
      elif ! replace_file "$f" "$b"; then
        ag_unrestored+=("$f"); ag_jnl permissions undone "$n"; continue
      fi
    elif [[ -n $entry && -e $f ]]; then
      if ! ag_perm_restore "$f" "$entry" "$tmp"; then
        ag_unrestored+=("$f"); ag_jnl permissions undone "$n"; continue
      fi
    fi
    if [[ -n $entry ]]; then ag_record_set "$f" - || ag_unrestored+=("$f"); fi
    ag_jnl permissions undone "$n"
  done
  return 0
}

# OpenCode 2's shared service opt-out (design section 15, D11): disabled: true in
# its service config, once per Mac. The record entry is the "once": a file with an
# entry is never written again, so a value the user sets or removes later stays.
# A key the user already set is recorded with no wrote value and left as is. The
# file holds the service password: it is changed by key, never copied into the
# backup, and its contents are never printed. A missing file is created, since
# OpenCode adds the password when its service first needs it.
do_opencode_service() {
  local f=$service_conf st entry= created new="$ag_tstage/service.json"
  ag_jlast opencode-service
  st=$REPLY
  [[ $st == (done|undone) ]] && return 0
  if [[ -f $record ]] && /usr/bin/jq -e --arg f "$f" 'has($f)' "$record" >/dev/null 2>&1; then
    [[ -z $st ]] && return 0
    entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record") || return 1
  fi
  if [[ -z $entry ]]; then
    if ! ag_opencode_config_writable "$f"; then
      [[ -z $st ]] || ag_jnl opencode-service done
      return
    fi
    if [[ -e $f ]]; then
      if ! entry=$(/usr/bin/jq -ce 'if type != "object" then error
          elif has("disabled") then {disabled: {orig: .disabled}}
          else {disabled: {orig: null, wrote: true}} end' "$f" 2>/dev/null); then
        ag_warnings+=("${f:t} not changed (unreadable or invalid JSON): OpenCode's shared service still starts automatically")
        [[ -z $st ]] || ag_jnl opencode-service done
        return
      fi
    else
      entry='{"disabled":{"orig":null,"wrote":true}}'
    fi
    if [[ -z $st ]]; then
      created=0
      [[ -e $f ]] || created=1
      ag_backup opencode-service && ag_jnl opencode-service begun "created=$created" || return 1
    fi
    ag_record_set "$f" "$entry" || return 1
    /bin/sync
  fi
  test_point opencode-service || return 1
  if /usr/bin/jq -en --argjson e "$entry" '$e.disabled | has("wrote")' >/dev/null; then
    # Only an absent key is written, so a resumed run does not write twice.
    /bin/rm -f -- "$new"
    if [[ ! -e $f ]]; then
      /usr/bin/jq -n '{disabled: true}' > "$new" || return 1
    elif /usr/bin/jq -e 'type == "object" and (has("disabled") | not)' "$f" >/dev/null 2>&1; then
      ( umask 077; /usr/bin/jq '.disabled = true' "$f" > "$new" 2>/dev/null ) || return 1
    fi
    if [[ -f $new ]]; then
      /bin/mkdir -p -- "${f:h}" && ( umask 077; replace_file "$f" "$new" ) || { /bin/rm -f -- "$new"; return 1 }
      /bin/rm -f -- "$new"
    fi
    ag_say "OpenCode shared service: automatic start turned off (pairing unavailable); run 'opencode service set disabled false' to turn it back on"
  else
    ag_say 'OpenCode shared service: automatic start left as you set it'
  fi
  ag_jnl opencode-service done
}

# Puts back only a value this run wrote and nobody changed since, and removes the
# entry this run added; a file that cannot be restored keeps its entry.
undo_opencode_service() {
  local f=$service_conf entry= created
  ag_jlast opencode-service
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind opencode-service begun
  ag_jval created
  created=$REPLY
  if [[ -f $record ]] && /usr/bin/jq -e --arg f "$f" 'has($f)' "$record" >/dev/null 2>&1; then
    entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record") || return 1
  fi
  if [[ -n $entry && -e $f ]] && /usr/bin/jq -en --argjson e "$entry" '$e.disabled | has("wrote")' >/dev/null; then
    if ! ag_opencode_config_writable "$f"; then
      ag_unrestored+=("$f")
    elif [[ $created == 1 ]] && /usr/bin/jq -e '. == {disabled: true}' "$f" >/dev/null 2>&1; then
      /bin/rm -f -- "$f" || ag_unrestored+=("$f")
    elif ! ag_perm_restore "$f" "$entry" "$ag_tstage/service.undo.json"; then
      ag_unrestored+=("$f")
    fi
    /bin/rm -f -- "$ag_tstage/service.undo.json"
  fi
  if [[ -n $entry ]] && (( ! ${ag_unrestored[(Ie)$f]} )); then ag_record_set "$f" - || ag_unrestored+=("$f"); fi
  ag_jnl opencode-service undone
}

# --- Uninstall (design section 6, Uninstall).

# U2: each recorded value, only where a wrote value is recorded and the current
# value still equals it. A restored file's entry leaves the record at once, so a
# rerun never treats restored values as user edits.
ag_h_opencode_uninstall_restore() {  # SCRATCH
  local out f entry
  [[ -e $record ]] || return 0
  if out=$(/usr/bin/jq -r 'keys[]' "$record" 2>/dev/null); then
    for f in ${(f)out}; do
      if [[ -e $f ]]; then
        if ! entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record" 2>/dev/null) || ! ag_perm_restore "$f" "$entry" "$1/cfg"; then
          ag_warn "$f not restored; check its permission settings"
          ag_unrestored+=("$f")
          continue
        fi
      fi
      /usr/bin/jq --arg f "$f" 'del(.[$f])' "$record" > "$1/record" && replace_file "$record" "$1/record" ||
        ag_warn "$f was restored but is still in $record"
    done
  else
    ag_unreadable=1
    ag_warn "the permission record $record cannot be read"
  fi
  return 0
}

# U3: the plugin, a link into the engine or a regular file (an older copy). A
# link elsewhere is not Agent Guard's. This ends guarding.
ag_h_opencode_uninstall_remove() {
  if [[ -L $plugin && $(/usr/bin/readlink -- "$plugin") == "$engine"/* ]] || [[ -f $plugin && ! -L $plugin ]]; then
    /bin/rm -f -- "$plugin" || { ag_err "cannot remove $plugin; $engine is kept, so agent-guard uninstall can run again"; return 1 }
  fi
  /bin/rm -f -- "$plugins/.agent-guard.js.partial"
  return 0
}

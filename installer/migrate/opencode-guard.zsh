# Agent Guard installer: the migration from OpenCode Guard (docs/DESIGN.md
# section 10): detection, the imports, the forwarders, the plugin swap and
# retirement, and the hooks of the migration interface (actions.zsh). It hands
# over to the OpenCode harness and uses its functions.

ag_m_opencode_guard_init() {
  # OpenCode Guard's install (docs/DESIGN.md section 10).
  ocg="$home/Library/Application Support/OpenCodeGuard"
  ocg_record="$ocg/state/permissions.json"
  ocg_copy="$state/opencode-guard-permissions.json"
  old_list_dir="$home/OpenCode Guard"
  old_list="$old_list_dir/Guard List.txt"
  old_app="$home/Applications/OpenCode Guard.app"
  old_plugin="$plugins/opencode-guard.js"
  old_start='# >>> opencode-guard >>>'
  old_end='# <<< opencode-guard <<<'
  ag_ocg_state=none
  typeset -ga ag_ocg_parts ag_ocg_froms
  ag_ocg_parts=()
  # Its records in migration.json: a migration, or forwarders a fresh install found.
  ag_ocg_froms=(opencode-guard forwarders)
  ag_probe_dirs+=("$ocg/state")
  ag_old_blocks+=("$old_start" "$old_end")
}

ag_m_opencode_guard_title() { REPLY='OpenCode Guard' }
ag_m_opencode_guard_harness() { REPLY=opencode }

# OpenCode Guard's parts (design section 8.1), in ag_ocg_parts. Its bin/ folder is
# not one: after a migration it holds Agent Guard's forwarders.
ag_ocg_find() {
  local rc
  ag_ocg_parts=()
  [[ -e $ocg/launch || -L $ocg/launch ]] && ag_ocg_parts+=(launch)
  [[ -e $ocg_record || -L $ocg_record ]] && ag_ocg_parts+=(record)
  if [[ -e $old_plugin || -L $old_plugin ]] && ! ag_ours "$old_plugin"; then ag_ocg_parts+=(plugin); fi
  [[ -e $old_app || -L $old_app ]] && ag_ocg_parts+=(app)
  [[ -e $cc/opencode-guard || -L $cc/opencode-guard ]] && ag_ocg_parts+=(rulebook)
  if [[ -f $cc/rule.json ]] && /usr/bin/jq -e '(.rules // []) | index("opencode-guard") != null' "$cc/rule.json" >/dev/null 2>&1; then
    ag_ocg_parts+=(rulejson)
  fi
  for rc in "$home"/{.zprofile,.zshrc,.bash_profile}; do
    [[ -f $rc ]] && /usr/bin/grep -Fxq -- "$old_start" "$rc" && ag_ocg_parts+=("block:${rc:t}")
  done
  return 0
}

# True when OpenCode Guard's bin/ holds nothing but links to Agent Guard's shims.
ag_forwarders_only() {
  local f
  local -a all
  [[ -d $ocg/bin && ! -L $ocg/bin ]] || return 1
  all=("$ocg"/bin/*(DN))
  (( $#all )) || return 1
  for f in $all; do
    [[ -L $f && $(/usr/bin/readlink -- "$f") == "$engine/bin/${f:t}" ]] || return 1
  done
}

# The state of OpenCode Guard on this Mac (design section 8.1), in ag_ocg_state:
# full (migrate), retiring, migrated, remnant, forwarders-only or none. REPLY is
# its state in the migration interface.
ag_m_opencode_guard_detect() {
  local retired
  ag_ocg_find
  ag_ocg_state=none
  ag_mig_get $ag_ocg_froms || { ag_err "cannot read $migration; nothing changed"; return 1 }
  if [[ -n $REPLY ]]; then
    retired=$(/usr/bin/jq -r '.retired' <<< "$REPLY")
    case $retired in
      (false) ag_ocg_state=retiring ;;
      # Parts found after a finished migration: OpenCode Guard was installed again.
      (true) ag_ocg_state=migrated; (( $#ag_ocg_parts )) && ag_ocg_state=full ;;
    esac
  elif (( $#ag_ocg_parts )); then
    ag_ocg_state=full
  elif ag_forwarders_only; then
    ag_ocg_state=forwarders-only
  elif [[ -f $old_list && ! -e $list ]]; then
    ag_ocg_state=remnant
  fi
  case $ag_ocg_state in
    (full) REPLY=migrate ;;
    (retiring) REPLY=retiring ;;
    (migrated) REPLY=done ;;
    (*) REPLY=none ;;
  esac
  return 0
}

# A server or app started before the switch keeps OpenCode Guard's profile and
# would run Agent Guard's plugin rules under it, so a migration runs only while
# no OpenCode process runs (design section 8.2).
ag_ocg_procs() {
  ag_h_opencode_procs
  ag_proc_check "$REPLY" $reply
}

# Before any change: OpenCode Guard's record must be an object of per-file entries
# whose keys each have orig. Also reports what is not merged.
ag_m_opencode_guard_checks() {
  local -a found
  if [[ -f $old_list_dir/permissions-backup.json ]]; then
    ag_say "note: $old_list_dir/permissions-backup.json is from an earlier OpenCode Guard uninstall that could not restore these values; they are not merged."
  fi
  if [[ $ag_ocg_state == remnant ]]; then
    found=("$conf"/{config.json,opencode.json,opencode.jsonc}(N))
    ag_say "OpenCode Guard was installed here before, and no permission record of it exists, so the values it wrote cannot be restored.${found:+ Check edit, bash and external_directory in: ${(j:, :)found}}"
  fi
  [[ $ag_ocg_state == full ]] || return 0
  if [[ -e $ocg_record || -L $ocg_record ]] && ! /usr/bin/jq -e 'type == "object" and all(.[]; type == "object" and all(.[]; type == "object" and has("orig")))' "$ocg_record" >/dev/null 2>&1; then
    ag_err "OpenCode Guard's permission record $ocg_record cannot be read or is not an object of per-file entries. Nothing changed."
    return 1
  fi
  ag_ocg_procs || { ag_err 'Nothing changed.'; return 1 }
}

ag_m_opencode_guard_begin() { ag_say "migrating from OpenCode Guard (found: ${(j:, :)ag_ocg_parts})" }

# The list prompt can take minutes: OpenCode may have been started meanwhile.
ag_m_opencode_guard_before_switch() {
  ag_ocg_procs || { ag_err 'stopped before the switch; OpenCode Guard is unchanged.'; return 1 }
}

ag_m_opencode_guard_recover_check() { ag_ocg_procs }

# P6b (before P6): OpenCode Guard's list, copied byte for byte only after the user
# confirms on the terminal. An existing Agent Guard list is never changed.
ag_m_opencode_guard_list_import() {
  local answer= partial="$list_dir/.Guard List.txt.partial"
  [[ $ag_source == opencode-guard || $ag_ocg_state == remnant ]] && [[ -f $old_list ]] || return 0
  if [[ -e $list || -L $list ]]; then
    /usr/bin/cmp -s -- "$old_list" "$list" ||
      ag_say "list: $list is kept; the old list $old_list was not imported"
    return 0
  fi
  ag_say "OpenCode Guard's list: $old_list"
  ag_say "Agent Guard's list:    $list (does not exist yet)"
  ag_say 'Entries in the old list:'
  /usr/bin/awk '
    { t = $0; sub(/\r$/, "", t); gsub(/^[[:space:]]+|[[:space:]]+$/, "", t); u = toupper(t) }
    t == "" || t ~ /^#/ { next }
    u ~ /^ALLOW([[:space:]]*[-:].*)?$/ { s = "ALLOW"; next }
    u ~ /^READ([[:space:]]+|-)ONLY([[:space:]]*[-:].*)?$/ { s = "READ ONLY"; next }
    u ~ /^DENY([[:space:]]*[-:].*)?$/ { s = "DENY"; next }
    s != "" { e[s] = e[s] "    " t "\n" }
    END { n = split("ALLOW,READ ONLY,DENY", k, ",")
          for (i = 1; i <= n; i++) printf "  %s\n%s", k[i], (k[i] in e ? e[k[i]] : "    (none)\n") }' "$old_list" || return 1
  ag_say "After the switch the old list is no longer read; Agent Guard reads only $list."
  if [[ -t 0 ]]; then
    print -n 'Import this list? [y/N] '
    read -r answer
  fi
  if [[ $answer != [yY]([eE][sS]|) ]]; then
    ag_err 'the list was not imported. Nothing changed.'
    return 1
  fi
  /bin/mkdir -p -- "$list_dir" && /bin/rm -f -- "$partial" && /bin/cp -p -- "$old_list" "$partial" &&
    /bin/mv -n -- "$partial" "$list" && /usr/bin/cmp -s -- "$old_list" "$list" || { /bin/rm -f -- "$partial"; return 1 }
  ag_say "list imported: $list"
}

# P6a, the staged action import: OpenCode Guard's record, copied unchanged to
# state/, and each of its entries for a file without an entry in Agent Guard's
# record. Migrations write no permission value (they skip S6); this reports what
# the record means now.
do_import() {
  ag_import || { ag_err "cannot import OpenCode Guard's permission record"; return 1 }
}

ag_import() {
  local base="$ag_tstage/record.base.json" out="$ag_tstage/record.json" keys="$txn_dir/imported.json" f k
  local created=0 copied=0 cur
  integer i
  [[ $ag_source == opencode-guard ]] || return 0
  if [[ ! -f $ocg_record ]]; then
    ag_say "OpenCode Guard's permission record is missing, so the values it wrote cannot be restored."
    return 0
  fi
  ag_jlast import
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    [[ -e $record ]] || created=1
    [[ -e $ocg_copy ]] || copied=1
    ag_backup import "$record" && ag_backup import-copy "$ocg_copy" && ag_jnl import begun "created=$created copied=$copied" || return 1
  fi
  /bin/cp -p -- "$ocg_record" "$ocg_copy.partial" && /bin/mv -f -- "$ocg_copy.partial" "$ocg_copy" &&
    /usr/bin/cmp -s -- "$ocg_record" "$ocg_copy" || return 1
  if [[ -f $txn_dir/backup/import/file ]]; then /bin/cp -- "$txn_dir/backup/import/file" "$base" || return 1; else print '{}' > "$base" || return 1; fi
  /usr/bin/jq -c --slurpfile o "$ocg_copy" '. as $a | [$o[0] | keys[] | select(. as $f | $a | has($f) | not)]' "$base" > "$keys" &&
    /usr/bin/jq --slurpfile o "$ocg_copy" --slurpfile k "$keys" 'reduce $k[0][] as $f (.; .[$f] = $o[0][$f])' "$base" > "$out" &&
    replace_file "$record" "$out" || return 1
  # What each recorded value means now.
  for f in ${(f)"$(/usr/bin/jq -r 'keys[]' "$ocg_copy")"}; do
    if ! /usr/bin/jq -e --arg f "$f" 'any(.[]; . == $f)' "$keys" >/dev/null; then
      ag_say "permissions: $f already has an entry in Agent Guard's record; OpenCode Guard's is not imported"
      continue
    fi
    if [[ ! -f $f ]]; then ag_say "permissions: $f no longer exists"; continue; fi
    for k in edit bash external_directory; do
      cur=$(/usr/bin/jq -r --slurpfile o "$ocg_copy" --arg f "$f" --arg k "$k" '($o[0][$f][$k] // null) as $e
        | if $e == null then "absent" elif ($e | has("wrote") | not) then "nowrote"
          elif (.permission // {})[$k] == $e.wrote then "kept" else "changed" end' "$f" 2>/dev/null) || cur=unreadable
      case $cur in
        (kept) ag_say "permissions: kept $f $k (as OpenCode Guard set it)" ;;
        (changed) ag_say "permissions: left as is: $f $k was changed after OpenCode Guard's install" ;;
        (nowrote) ag_say "permissions: $f $k has no recorded value from OpenCode Guard (its install was interrupted); left as is" ;;
        (unreadable) ag_say "permissions: $f cannot be read; left as is" ;;
      esac
    done
  done
  for (( i = 1; i <= $#ag_configs; i++ )); do
    f=$ag_configs[i]
    [[ -e $f ]] || continue
    /usr/bin/jq -e --arg f "$f" 'has($f)' "$ocg_copy" >/dev/null 2>&1 && continue
    /usr/bin/jq -e --arg f "$f" 'has($f)' "$record" >/dev/null 2>&1 && continue
    ag_say "permissions: $f has no entry in either record; left as is"
  done
  ag_jnl import done "created=$created copied=$copied"
}

# Discard of the import: what this transaction created goes, what it changed comes back.
undo_import() {
  local created copied b="$txn_dir/backup"
  ag_jlast import
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind import begun
  local detail=$REPLY
  ag_jval created; created=$REPLY
  REPLY=$detail; ag_jval copied; copied=$REPLY
  if [[ $created == 1 ]]; then /bin/rm -f -- "$record" || return 1
  elif [[ -f $b/import/file ]] && ! /usr/bin/cmp -s -- "$record" "$b/import/file"; then replace_file "$record" "$b/import/file" || return 1
  fi
  if [[ $copied == 1 ]]; then /bin/rm -f -- "$ocg_copy" "$ocg_copy.partial" || return 1
  elif [[ -f $b/import-copy/file ]] && ! /usr/bin/cmp -s -- "$ocg_copy" "$b/import-copy/file"; then replace_file "$ocg_copy" "$b/import-copy/file" || return 1
  fi
  ag_jnl import undone
}

# --- Migration switch actions (design section 8.5, M4 to M8), registered in
# actions.zsh. OpenCode Guard's files that become links are put back with
# restore_over_link, which replaces the link itself and never writes through it
# into a release (design A1).

# M4a, M4b: a forwarder, a link from OpenCode Guard's shim path to Agent Guard's
# shim of the same name, for terminals opened before the switch.
do_forwarder() {  # ACTION NAME
  local a=$1 f="$ocg/bin/$2" to="$engine/bin/$2"
  ag_jlast $a
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ ! -e $f && ! -L $f ]] || [[ -L $f && $(/usr/bin/readlink -- "$f") == "$to" ]]; then test_point $a; return; fi
    ag_backup $a "$f" && ag_jnl $a begun || return 1
  fi
  test_point $a || return 1
  replace_link "$f" "$to" || return 1
  ag_jnl $a done
}

undo_forwarder() {  # ACTION NAME
  local a=$1 f="$ocg/bin/$2" b="$txn_dir/backup/$1/file"
  ag_jlast $a
  [[ $REPLY == (begun|done) ]] || return 0
  if [[ -f $b ]] && ! { [[ -f $f && ! -L $f ]] && /usr/bin/cmp -s -- "$f" "$b" }; then
    restore_over_link "$f" "$b" || return 1
  fi
  /bin/rm -f -- "${f:h}/.${f:t}.partial"
  ag_jnl $a undone
}

do_fwd_cli() { do_forwarder fwd-cli opencode }
undo_fwd_cli() { undo_forwarder fwd-cli opencode }
do_fwd_gui() { do_forwarder fwd-gui opencode-gui }
undo_fwd_gui() { undo_forwarder fwd-gui opencode-gui }

# M5a: Agent Guard's plugin link renamed onto opencode-guard.js, so the folder holds
# one guard plugin at every moment; M5b then renames it to agent-guard.js. Both run
# only when OpenCode Guard's plugin is there, or once the take began; without it
# the harness's plugin action (S5) links the plugin as on a fresh install.
do_ocg_plugin_take() {
  ag_jlast plugin-take
  [[ -n $REPLY || -e $old_plugin || -L $old_plugin ]] || return 0
  do_plugin_take
}

do_ocg_plugin_name() {
  ag_jlast plugin-take
  [[ -n $REPLY ]] || return 0
  do_plugin_name
}

do_plugin_take() {
  local tmp="$plugins/.agent-guard.js.partial"
  ag_jlast plugin-take
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then ag_backup plugin-take "$old_plugin" && ag_jnl plugin-take begun || return 1; fi
  if ! ag_ours "$old_plugin" && ! { [[ ! -e $old_plugin && ! -L $old_plugin ]] && ag_ours "$plugin" }; then
    /bin/rm -f -- "$tmp" && /bin/ln -s "$plugin_target" "$tmp" || return 1
    test_point plugin-take || return 1
    /bin/mv -fh -- "$tmp" "$old_plugin" || return 1
  fi
  ag_jnl plugin-take done
}

undo_plugin_take() {
  local b="$txn_dir/backup/plugin-take/file"
  ag_jlast plugin-take
  [[ $REPLY == (begun|done) ]] || return 0
  /bin/rm -f -- "$plugins/.agent-guard.js.partial"
  if [[ -f $b ]] && ! { [[ -f $old_plugin && ! -L $old_plugin ]] && /usr/bin/cmp -s -- "$old_plugin" "$b" }; then
    restore_over_link "$old_plugin" "$b" || return 1
  fi
  ag_jnl plugin-take undone
}

do_plugin_name() {
  local b="$txn_dir/backup/plugin-name"
  ag_jlast plugin-name
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    ag_backup plugin-name || return 1
    if [[ -L $plugin ]]; then /usr/bin/readlink -- "$plugin" > "$b/link" || return 1; fi
    ag_jnl plugin-name begun || return 1
  fi
  test_point plugin-name || return 1
  if ag_ours "$old_plugin"; then /bin/mv -fh -- "$old_plugin" "$plugin" || return 1; fi
  ag_ours "$plugin" && [[ ! -e $old_plugin && ! -L $old_plugin ]] || return 1
  ag_jnl plugin-name done
}

undo_plugin_name() {
  local b="$txn_dir/backup/plugin-name"
  ag_jlast plugin-name
  [[ $REPLY == (begun|done) ]] || return 0
  if ag_ours "$plugin" && [[ ! -e $old_plugin && ! -L $old_plugin ]]; then
    /bin/mv -fh -- "$plugin" "$old_plugin" || return 1
    if [[ -f $b/link ]]; then replace_link "$plugin" "$(<"$b/link")" || return 1; fi
  fi
  ag_jnl plugin-name undone
}

# M7b: OpenCode Guard's app into the transaction folder; retirement deletes it.
do_app_old() {
  local b="$txn_dir/backup/app-old"
  ag_jlast app-old
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ ! -e $old_app && ! -L $old_app ]]; then test_point app-old; return; fi
    ag_jnl app-old begun || return 1
  fi
  test_point app-old || return 1
  if [[ ( -e $old_app || -L $old_app ) && ! -e $b ]]; then
    /bin/mkdir -p -- "${b:h}" && /bin/mv -- "$old_app" "$b" || return 1
  fi
  ag_jnl app-old done
}

undo_app_old() {
  local b="$txn_dir/backup/app-old"
  ag_jlast app-old
  [[ $REPLY == (begun|done) ]] || return 0
  if [[ -e $b && ! -e $old_app && ! -L $old_app ]]; then /bin/mv -- "$b" "$old_app" || return 1; fi
  ag_jnl app-old undone
}

# M8: the switch time, last. Forwarder removal waits for a boot after it.
do_switch_time() {
  ag_jlast switch-time
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then ag_backup switch-time "$migration" && ag_jnl switch-time begun || return 1; fi
  test_point switch-time || return 1
  ag_mig_put "$(/usr/bin/jq -cn --argjson t "$EPOCHSECONDS" '{from: "opencode-guard", switched_at: $t, retired: false}')" $ag_ocg_froms || return 1
  ag_jnl switch-time done
}

undo_switch_time() {
  local b="$txn_dir/backup/switch-time/file"
  ag_jlast switch-time
  [[ $REPLY == (begun|done) ]] || return 0
  if [[ -f $b ]]; then replace_file "$migration" "$b" || return 1; else /bin/rm -f -- "$migration" || return 1; fi
  ag_jnl switch-time undone
}

# The gate's second bounded launch, through the forwarder at OpenCode Guard's old path.
ag_m_opencode_guard_gate() {
  [[ -L $ocg/bin/opencode ]] && ag_launch_check "$ocg/bin/opencode" "OpenCode Guard's bin/opencode"
  return 0
}

# The forwarders, while they are there, are among the stamp's links.
ag_m_opencode_guard_links() {
  local f
  reply=()
  for f in opencode opencode-gui; do
    [[ -L $ocg/bin/$f && $(/usr/bin/readlink -- "$ocg/bin/$f") == "$engine/bin/$f" ]] && reply+=("$ocg/bin/$f" "$engine/bin/$f")
  done
  return 0
}

ag_m_opencode_guard_report() {
  ag_say "OpenCode Guard is replaced. A Dock item for OpenCode Guard.app no longer opens; drag $app to the Dock instead."
  ag_say "Terminal windows opened before now reach Agent Guard through $ocg/bin, which the first agent-guard update after a restart removes."
  ag_say "Your list is now $list; $old_list is no longer read."
}

# Forwarders left by an earlier Agent Guard install: recorded as retired with the
# install time as the switch time, so they are removed after a later boot.
ag_m_opencode_guard_after_install() {
  [[ $ag_ocg_state == forwarders-only ]] || return 0
  ag_mig_get $ag_ocg_froms && [[ -z $REPLY ]] || return 0
  ag_mig_put "$(/usr/bin/jq -cn --argjson t "$EPOCHSECONDS" '{from: "forwarders", switched_at: $t, retired: true}')" $ag_ocg_froms
  return 0
}

ag_m_opencode_guard_maintenance() { ag_forwarders_remove }

# --- Retirement of OpenCode Guard (design section 8.6 and A7), after the stamp of
# a migration. Each item runs while it is unfinished, so a rerun after a failure
# finishes the rest; a failure leaves Agent Guard active and the migration
# record's retired false. Journaled when a transaction is open. Never runs
# OpenCode Guard's uninstaller, which would put back the permission values Agent
# Guard keeps and delete the forwarders.

ag_m_opencode_guard_retire() { ag_retire }

ag_retire() {
  local rec
  integer bad=0
  ag_mig_get $ag_ocg_froms || return 0
  [[ -n $REPLY && $(/usr/bin/jq -r '.retired' <<< "$REPLY") == false ]] || return 0
  rec=$REPLY
  ag_say 'retiring OpenCode Guard'
  ag_retire_rules || bad=1
  ag_retire_engine || bad=1
  ag_retire_note || bad=1
  if (( bad )); then
    ag_err 'retiring OpenCode Guard is unfinished; Agent Guard is active. Fix what is named above, then run the installer or agent-guard update again.'
    return 1
  fi
  # R5: the transaction's backup, OpenCode Guard's app among it, goes with the cleanup.
  ag_mig_put "$(/usr/bin/jq -c '.retired = true' <<< "$rec")" $ag_ocg_froms || return 1
  ag_rjnl retire done
  ag_say 'OpenCode Guard is retired'
}

# R1, R2: opencode-guard leaves rule.json's rules (transparent_wrappers stay, as its
# own uninstaller leaves them); then its rulebook folder. A rule.json that cannot
# be read or written keeps both.
ag_retire_rules() {
  local rj="$cc/rule.json" new="$state/.retire-$$.rule.json"
  test_point retire-rulejson || return 1
  if [[ -e $rj ]]; then
    if ! /usr/bin/jq -e 'type == "object"' "$rj" >/dev/null 2>&1; then
      ag_warn "$rj cannot be read, so opencode-guard stays in its rules and $cc/opencode-guard stays; fix the file"
      return 1
    fi
    if /usr/bin/jq -e '(.rules // []) | index("opencode-guard") != null' "$rj" >/dev/null 2>&1; then
      if ! /usr/bin/jq '.rules -= ["opencode-guard"]' "$rj" > "$new" 2>/dev/null || ! replace_file "$rj" "$new"; then
        /bin/rm -f -- "$new"
        ag_warn "$rj cannot be written, so opencode-guard stays in its rules and $cc/opencode-guard stays"
        return 1
      fi
      /bin/rm -f -- "$new"
    fi
  fi
  ag_rjnl retire-rulejson done
  test_point retire-rulebook || return 1
  /bin/rm -rf -- "$cc/opencode-guard" || return 1
  ag_rjnl retire-rulebook done
}

# R3a, R3b: the old engine, except bin/ with the forwarders. Its state folder holds
# the record, so the copy in Agent Guard's state folder and the imported entries
# are read back and compared first; state/ is removed last, so a rerun that finds
# it gone needs no comparison.
ag_retire_engine() {
  local keys="$txn_dir/imported.json"
  if [[ -e $ocg/state || -L $ocg/state ]]; then
    ag_jlast retire-compare
    if [[ $REPLY != done ]]; then
      test_point retire-compare || return 1
      if [[ -e $ocg_record ]] && ! { [[ -f $ocg_copy ]] && /usr/bin/cmp -s -- "$ocg_copy" "$ocg_record" }; then
        ag_warn "$ocg_copy does not match $ocg_record, so $ocg/state is kept"
        return 1
      fi
      if [[ -f $keys ]] && ! /usr/bin/jq -e --slurpfile o "$ocg_copy" --slurpfile k "$keys" '. as $r | all($k[0][]; . as $f | $r[$f] == $o[0][$f])' "$record" >/dev/null 2>&1; then
        ag_warn "the entries imported into $record do not match $ocg_copy, so $ocg/state is kept"
        return 1
      fi
      ag_rjnl retire-compare done
    fi
  fi
  test_point retire-engine || return 1
  /bin/rm -rf -- "$ocg/launch" "$ocg/profile.sb" "$ocg/uninstall.sh" "$ocg/vendor" "$ocg/state" || return 1
  ag_rjnl retire-engine done
}

# R4: a note in ~/OpenCode Guard, the only change ever made there.
ag_retire_note() {
  local note="$old_list_dir/Moved to Agent Guard.txt" partial="$old_list_dir/.Moved to Agent Guard.txt.partial"
  test_point retire-note || return 1
  [[ -d $old_list_dir && ! -e $note ]] || return 0
  print -r -- "OpenCode Guard was replaced by Agent Guard. Agent Guard reads its list from
$list. The list in this folder is no longer read; this folder is kept." > "$partial" &&
    /bin/mv -n -- "$partial" "$note" || { /bin/rm -f -- "$partial"; return 1 }
  ag_rjnl retire-note done
}

# Removes the forwarders and OpenCode Guard's engine folder once no shell started
# before the switch can remain: retirement is done and the Mac booted after the
# switch time. If the boot time cannot be read they stay. With ignore-boot
# (uninstall) they go whatever the boot time. Names anything else left there.
ag_forwarders_remove() {  # [ignore-boot]
  local f p sw tmp="$state/.stamp-$$.json"
  local -a gone left
  [[ -f $migration ]] || return 0
  if [[ ${1:-} != ignore-boot ]]; then
    ag_mig_get $ag_ocg_froms && [[ -n $REPLY ]] || return 0
    [[ $(/usr/bin/jq -r '.retired' <<< "$REPLY") == true ]] || return 0
    sw=$(/usr/bin/jq -r '.switched_at' <<< "$REPLY")
    [[ $sw == <-> ]] && boot_time && (( REPLY > sw )) || return 0
  fi
  if [[ -e $ocg || -L $ocg ]]; then
    for f in opencode opencode-gui; do
      p="$ocg/bin/$f"
      if [[ -L $p && $(/usr/bin/readlink -- "$p") == "$engine/bin/$f" ]]; then
        /bin/rm -f -- "$p"
      fi
      /bin/rm -f -- "$ocg/bin/.$f.partial"
    done
    /bin/rmdir -- "$ocg/bin" "$ocg" 2>/dev/null
    if [[ -e $ocg ]]; then
      left=("$ocg"/**/*(DN))
      ag_warn "kept in $ocg, not Agent Guard's: ${(j:, :)${left:-$ocg}}"
    else
      ag_say "removed the forwarders and $ocg"
    fi
  fi
  # The stamp lists the forwarders among its links; agent-guard version must not
  # report them missing, also when a run stopped after removing them.
  for f in opencode opencode-gui; do
    [[ -e $ocg/bin/$f || -L $ocg/bin/$f ]] || gone+=("$ocg/bin/$f")
  done
  if (( $#gone )) && [[ -f $stamp ]] &&
     /usr/bin/jq -e '[.links | keys[] | select(IN($ARGS.positional[]))] | length > 0' "$stamp" --args "${gone[@]}" >/dev/null 2>&1; then
    /usr/bin/jq '.links |= with_entries(select(.key | IN($ARGS.positional[]) | not))' "$stamp" --args "${gone[@]}" > "$tmp" &&
      replace_file "$stamp" "$tmp"
    /bin/rm -f -- "$tmp"
  fi
  return 0
}

# --- Uninstall (design section 6, Uninstall).

# U6: after a migration, OpenCode Guard's retirement if it is unfinished, then the
# forwarders at its old command paths and its engine folder, whatever the boot
# time. ~/OpenCode Guard stays.
ag_m_opencode_guard_uninstall() {
  reply=()
  [[ -f $migration ]] || return 0
  # A file of other sources' records only; one that cannot be read counts as ours.
  if ag_mig_get $ag_ocg_froms && [[ -z $REPLY ]]; then return 0; fi
  ag_retire || reply+=("OpenCode Guard's files named above")
  ag_forwarders_remove ignore-boot
  [[ -e $ocg ]] && reply+=("$ocg")
  return 0
}

# U7: OpenCode Guard's record that was imported, next to the saved record.
ag_m_opencode_guard_save() {  # PARTIAL
  reply=()
  [[ -f $ocg_copy ]] || return 0
  /bin/cp -- "$ocg_copy" "$1" && /bin/mv -f -- "$1" "$list_dir/opencode-guard-permissions.json" || return 1
  reply=("OpenCode Guard's permission record saved to $list_dir/opencode-guard-permissions.json")
}

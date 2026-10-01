#!/bin/zsh
# usage: uninstall.sh   (agent-guard uninstall runs it)
# Removes Agent Guard in this order (docs/DESIGN.md section 6): PATH blocks, the
# permission values it set, the app, the rulebook, after a migration the
# forwarders at OpenCode Guard's old command paths, then the plugin and last the
# engine folder. Until the plugin goes, a start without a PATH block meets the
# plugin's unguarded refusal, and an old terminal still reaches working shims.
# Each step can be repeated, so a rerun after a failed or interrupted run
# finishes the job. Everything runs from main on the last line, so the file is
# read in full before its release folder is deleted.
main() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local here=${${(%):-%x}:A:h} rc f out entry scratch removing backup partial
  local -a unfinished kept
  integer unreadable=0
  # install.sh holds the account lookup, guard probe, lock and recovery.
  source "$here/install.sh" --lib || { print -ru2 -- "Agent Guard: cannot load $here/install.sh"; exit 1 }
  ag_init || exit 1
  removing="${engine:h}/.AgentGuard.removing"
  [[ -e $removing ]] && /bin/rm -rf -- "$removing"
  if [[ -d $engine ]]; then
    ag_probe || exit 1
    ag_lock || exit 1
    ag_recover uninstall || { ag_unlock; exit 1 }
    scratch="$state/.uninstall-$$"
  else
    /bin/mkdir -p -- "$list_dir" || exit 1
    scratch="$list_dir/.uninstall-$$"
  fi
  /bin/rm -rf -- "$scratch"
  /bin/mkdir -p -m 700 -- "$scratch" || { ag_unlock; exit 1 }
  stop() { ag_err "stopped at $1"; /bin/rm -rf -- "$scratch"; ag_unlock; exit 1 }

  # U1: PATH blocks, at each file's resolved target. An unfinished block is
  # reported, not touched.
  test_point uninstall-rc || stop uninstall-rc
  for rc in "$home"/{.zprofile,.zshrc,.bash_profile}; do
    [[ -f $rc ]] && /usr/bin/grep -Fxq -- "$marker_start" "$rc" || continue
    if ! /usr/bin/grep -Fxq -- "$marker_end" "$rc"; then
      ag_warn "$rc has an unfinished agent-guard block; remove it by hand"
      unfinished+=("$rc")
      continue
    fi
    ag_rc_strip "$rc" > "$scratch/rc" && replace_file "$rc" "$scratch/rc" ||
      { ag_warn "$rc not changed"; unfinished+=("$rc") }
  done

  # U2: each recorded value, only where a wrote value is recorded and the current
  # value still equals it. A restored file's entry leaves the record at once, so a
  # rerun never treats restored values as user edits.
  test_point uninstall-restore || stop uninstall-restore
  if [[ -e $record ]]; then
    if out=$(/usr/bin/jq -r 'keys[]' "$record" 2>/dev/null); then
      for f in ${(f)out}; do
        if [[ -e $f ]]; then
          if ! entry=$(/usr/bin/jq -c --arg f "$f" '.[$f]' "$record" 2>/dev/null) || ! ag_perm_restore "$f" "$entry" "$scratch/cfg"; then
            ag_warn "$f not restored; check its permission settings"
            ag_unrestored+=("$f")
            continue
          fi
        fi
        /usr/bin/jq --arg f "$f" 'del(.[$f])' "$record" > "$scratch/record" && replace_file "$record" "$scratch/record" ||
          ag_warn "$f was restored but is still in $record"
      done
    else
      unreadable=1
      ag_warn "the permission record $record cannot be read"
    fi
  fi

  # U4: the app.
  test_point uninstall-app || stop uninstall-app
  /bin/rm -rf -- "$app" || kept+=("$app")

  # U5: the rule.json entry, then the rulebook. transparent_wrappers stay.
  test_point uninstall-rulebook || stop uninstall-rulebook
  if [[ -e $cc/rule.json ]] && /usr/bin/jq -e '(.rules // []) | index("agent-guard") != null' "$cc/rule.json" >/dev/null 2>&1; then
    /usr/bin/jq '.rules -= ["agent-guard"]' "$cc/rule.json" > "$scratch/rule" 2>/dev/null && replace_file "$cc/rule.json" "$scratch/rule" ||
      kept+=("the agent-guard entry in $cc/rule.json")
  fi
  /bin/rm -rf -- "$cc/agent-guard" || kept+=("$cc/agent-guard")

  # U6: after a migration, OpenCode Guard's retirement if it is unfinished, then the
  # forwarders at its old command paths and its engine folder, whatever the boot
  # time. ~/OpenCode Guard stays.
  test_point uninstall-forwarders || stop uninstall-forwarders
  if [[ -f $migration ]]; then
    ag_retire || kept+=("OpenCode Guard's files named above")
    ag_forwarders_remove ignore-boot
    [[ -e $ocg ]] && kept+=("$ocg")
  fi

  # U7: a copy of the record before the engine goes, if any value was not restored,
  # and of OpenCode Guard's record that was imported into it.
  test_point uninstall-backup || stop uninstall-backup
  if (( $#ag_unrestored || unreadable )); then
    backup="$list_dir/permissions-backup.json" partial="$list_dir/.permissions-backup.json.partial"
    if /bin/mkdir -p -- "$list_dir" && /bin/cp -- "$record" "$partial" && /bin/mv -f -- "$partial" "$backup" &&
       { [[ ! -f $ocg_copy ]] || { /bin/cp -- "$ocg_copy" "$partial" && /bin/mv -f -- "$partial" "$list_dir/opencode-guard-permissions.json" } }; then
      ag_warn "original permission settings saved to $backup"
      [[ -f $ocg_copy ]] && ag_warn "OpenCode Guard's permission record saved to $list_dir/opencode-guard-permissions.json"
    else
      /bin/rm -f -- "$partial"
      ag_err "could not save $record, so $engine is kept. Not restored: ${(j:, :)ag_unrestored:-the record is unreadable}"
      /bin/rm -rf -- "$scratch"
      ag_unlock
      exit 1
    fi
  fi

  # U3: the plugin, a link into the engine or a regular file (an older copy). A
  # link elsewhere is not Agent Guard's. This ends guarding. If it cannot be
  # removed, the engine stays, so agent-guard uninstall can run again.
  test_point uninstall-plugin || stop uninstall-plugin
  if [[ -L $plugin && $(/usr/bin/readlink -- "$plugin") == "$engine"/* ]] || [[ -f $plugin && ! -L $plugin ]]; then
    /bin/rm -f -- "$plugin" || {
      ag_err "cannot remove $plugin; $engine is kept, so agent-guard uninstall can run again"
      /bin/rm -rf -- "$scratch"; ag_unlock; exit 1
    }
  fi
  /bin/rm -f -- "$plugins/.agent-guard.js.partial"

  # U8: the engine folder, with every release, current, bin, state and the lock.
  # Renamed first, so a rerun finds either the whole folder or nothing of it.
  test_point uninstall-engine || stop uninstall-engine
  /bin/rm -rf -- "$scratch"
  if [[ -e $engine ]]; then
    /bin/mv -- "$engine" "$removing" && /bin/rm -rf -- "$removing" || { ag_err "cannot remove $engine"; exit 1 }
  fi

  if (( $#unfinished || $#ag_unrestored || unreadable || $#kept )); then
    for f in $unfinished; do ag_err "PATH block not removed: $f"; done
    for f in $kept; do ag_err "not removed: $f"; done
    for f in $ag_unrestored; do ag_err "permission values not restored: $f"; done
    (( unreadable )) && ag_err "the permission record could not be read; it is saved in $list_dir/permissions-backup.json"
    exit 1
  fi
  print -r -- "Agent Guard removed. Your list is still at $list_dir."
}
main "$@"

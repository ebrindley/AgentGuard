#!/bin/zsh
# usage: uninstall.sh   (agent-guard uninstall runs it)
# Removes Agent Guard in this order (docs/DESIGN.md section 6): PATH blocks, the
# values each harness set, the app, the rulebook, after a migration what the
# migration left (OpenCode Guard's forwarders), then each harness's entry (the
# OpenCode plugin) and last the engine folder. The harnesses are those the stamp
# lists, the migrations those installer/actions.zsh registers. Until the plugin
# goes, a start without a PATH block meets the plugin's unguarded refusal, and an
# old terminal still reaches working shims. Each step can be repeated, so a rerun
# after a failed or interrupted run finishes the job. Everything runs from main on
# the last line, so the file is read in full before its release folder is deleted.
main() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local here=${${(%):-%x}:A:h} rc f h m scratch removing backup partial
  local -a unfinished kept harnesses saved
  # install.sh loads the installer: account lookup, guard probe, lock, recovery
  # and the harness and migration modules.
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
  # Each migration's own records, copied next to the saved record; saved gets the lines to print.
  save_migrations() {
    for m in $ag_migration_modules; do reply=(); ag_hook_opt m $m save "$partial" || return 1; saved+=("${reply[@]}"); done
  }
  ag_stamp_harnesses
  for h in $reply; do
    if (( ${ag_harness_modules[(Ie)$h]} )); then harnesses+=("$h"); else ag_warn "the stamp names $h, which this release cannot uninstall"; fi
  done

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

  # U2: the values each harness set (OpenCode: the recorded permission values).
  test_point uninstall-restore || stop uninstall-restore
  for h in $harnesses; do ag_hook_opt h $h uninstall_restore "$scratch"; done

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

  # U6: after a migration, what it left: OpenCode Guard's retirement if it is
  # unfinished, then the forwarders at its old command paths and its engine
  # folder, whatever the boot time. ~/OpenCode Guard stays.
  test_point uninstall-forwarders || stop uninstall-forwarders
  for m in $ag_migration_modules; do
    reply=()
    ag_hook_opt m $m uninstall
    kept+=("${reply[@]}")
  done

  # U7: a copy of the record before the engine goes, if any value was not restored,
  # and of each migration's records that were imported into it.
  test_point uninstall-backup || stop uninstall-backup
  if (( $#ag_unrestored || ag_unreadable )); then
    backup="$list_dir/permissions-backup.json" partial="$list_dir/.permissions-backup.json.partial"
    saved=()
    if /bin/mkdir -p -- "$list_dir" && /bin/cp -- "$record" "$partial" && /bin/mv -f -- "$partial" "$backup" && save_migrations; then
      ag_warn "original permission settings saved to $backup"
      for f in $saved; do ag_warn "$f"; done
    else
      /bin/rm -f -- "$partial"
      ag_err "could not save $record, so $engine is kept. Not restored: ${(j:, :)ag_unrestored:-the record is unreadable}"
      /bin/rm -rf -- "$scratch"
      ag_unlock
      exit 1
    fi
  fi

  # U3: each harness's entry (OpenCode: the plugin, a link into the engine or a
  # regular file). This ends guarding. If it cannot be removed, the engine stays,
  # so agent-guard uninstall can run again.
  test_point uninstall-plugin || stop uninstall-plugin
  for h in $harnesses; do
    ag_hook h $h uninstall_remove || { /bin/rm -rf -- "$scratch"; ag_unlock; exit 1 }
  done

  # U8: the engine folder, with every release, current, bin, state and the lock.
  # Renamed first, so a rerun finds either the whole folder or nothing of it.
  test_point uninstall-engine || stop uninstall-engine
  /bin/rm -rf -- "$scratch"
  if [[ -e $engine ]]; then
    /bin/mv -- "$engine" "$removing" && /bin/rm -rf -- "$removing" || { ag_err "cannot remove $engine"; exit 1 }
  fi

  if (( $#unfinished || $#ag_unrestored || ag_unreadable || $#kept )); then
    for f in $unfinished; do ag_err "PATH block not removed: $f"; done
    for f in $kept; do ag_err "not removed: $f"; done
    for f in $ag_unrestored; do ag_err "permission values not restored: $f"; done
    (( ag_unreadable )) && ag_err "the permission record could not be read; it is saved in $list_dir/permissions-backup.json"
    exit 1
  fi
  print -r -- "Agent Guard removed. Your list is still at $list_dir."
}
main "$@"

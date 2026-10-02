# Agent Guard installer: the migration from pi-sandbox-guard 7ad441f (docs/DESIGN.md
# section 11, The adoption): detection, the refusal while Pi or OMP runs, the
# wrapper import, the legacy bundle and retirement, and the hooks of the migration
# interface (actions.zsh). It hands over to the Pi harness and uses its functions.

ag_m_pi_sandbox_guard_init() {
  psg_stamp="$pi_bin/.pi-sandbox-launchers-version"
  psg_ext_backups="$home/.pi/agent/extension-backups"
  # The durable legacy bundle: pi-sandbox-guard's files as they were, which outlives
  # the transaction cleanup, and its copy that uninstall leaves in ~/Agent Guard.
  psg_legacy="$state/legacy/pi-sandbox-guard"
  psg_copy="$list_dir/pi-sandbox-guard-legacy"
  ag_psg_state=none
  typeset -ga ag_psg_parts
  ag_psg_parts=()
}

ag_m_pi_sandbox_guard_title() { REPLY=pi-sandbox-guard }
ag_m_pi_sandbox_guard_harness() { REPLY=pi }

# pi-sandbox-guard is present when the stamp does not list Pi and any of its parts
# exists (design section 11, The adoption, item 1). Once the stamp lists Pi these
# paths are Agent Guard's. REPLY is its state in the migration interface.
ag_m_pi_sandbox_guard_detect() {
  local retired
  integer listed=0
  ag_psg_state=none
  ag_pi_guard_parts
  ag_psg_parts=("${reply[@]}")
  ag_stamp_harnesses
  (( ${reply[(Ie)pi]} )) && listed=1
  ag_mig_get pi-sandbox-guard || { ag_err "cannot read $migration; nothing changed"; return 1 }
  if [[ -n $REPLY ]]; then
    retired=$(/usr/bin/jq -r '.retired' <<< "$REPLY")
    case $retired in
      (false) ag_psg_state=retiring ;;
      # Its parts without Pi in the stamp after a finished migration: installed again.
      (true) ag_psg_state=done; (( $#ag_psg_parts && ! listed )) && ag_psg_state=migrate ;;
    esac
  elif (( $#ag_psg_parts && ! listed )); then
    ag_psg_state=migrate
  fi
  REPLY=none
  case $ag_psg_state in
    (migrate|retiring|done) REPLY=$ag_psg_state ;;
  esac
  return 0
}

# True for a path the launcher may run without a binding: on its pinned PATH and
# under a trusted prefix (sandbox/pi-sandbox-preamble.zsh, trusted_executable_prefix).
ag_psg_trusted() {
  local r
  [[ $1 == (/usr/bin|/bin)/* ]] && return 0
  for r in $pi_roots; do
    [[ $1 == $r/bin/* || $1 == $r/lib/node_modules/@earendil-works/pi-coding-agent/* ]] && return 0
  done
  return 1
}

# The paths whose appearance in a process's argument list means Pi or OMP runs: a
# Pi session's process is node, not pi. For each runtime its launcher in
# ~/.local/bin and its bound executable, or without a binding the one the launcher
# resolves on its pinned PATH, each as recorded and resolved. Then the guard
# extension's entry, which the launcher passes to every agent session with
# --extension, so a session started with another accepted executable
# (PI_EXECUTABLE or OMP_EXECUTABLE) is found too: the extension folder's index.ts,
# or the one in ~/.local/bin/pi-sandbox-guard-extension that the launcher prefers.
ag_psg_proc_paths() {
  local rt d c
  local -a paths
  for rt in pi omp; do
    paths+=("$pi_bin/$rt" "${pi_bin:A}/$rt")
    if ag_pi_conf_get $rt; then paths+=("$REPLY" "${REPLY:A}"); continue; fi
    for d in ${^pi_roots}/bin /usr/bin /bin /usr/sbin /sbin; do
      c="$d/$rt"
      [[ -x $c && ! -d $c ]] && ! ag_pi_is_guard "${c:A}" && ag_psg_trusted "${c:A}" || continue
      paths+=("$c" "${c:A}")
      break
    done
  done
  for c in "$pi_ext/index.ts" "$pi_bin/pi-sandbox-guard-extension/index.ts"; do paths+=("$c" "${c:A}"); done
  reply=(${(u)paths})
}

# A session started before the switch keeps 7ad441f's profile, without Agent
# Guard's protections, for as long as it runs; so the migration runs only while no
# Pi or OMP runs. Updates do not refuse.
ag_psg_procs() {
  ag_psg_proc_paths
  ag_proc_check -f 'Quit every Pi and OMP session' $reply
}

ag_m_pi_sandbox_guard_checks() {
  [[ $ag_psg_state == migrate ]] || return 0
  ag_psg_procs || { ag_err 'Nothing changed.'; return 1 }
}

ag_m_pi_sandbox_guard_begin() { ag_say "migrating from pi-sandbox-guard (found: ${(j:, :)ag_psg_parts})" }

ag_m_pi_sandbox_guard_before_switch() {
  ag_psg_procs || { ag_err 'stopped before the switch; pi-sandbox-guard is unchanged.'; return 1 }
}

ag_m_pi_sandbox_guard_recover_check() { ag_psg_procs }

# ag_psg_stamp_get KEY [FILE]: REPLY = KEY's value in pi-sandbox-guard's launcher
# stamp, as its ops_stamp_get reads it.
ag_psg_stamp_get() {
  local f=${2:-$psg_stamp}
  REPLY=
  [[ -f $f ]] || return 0
  REPLY=$(/usr/bin/awk -F= -v k="$1" '$1 == k { print substr($0, length(k) + 2); exit }' "$f" 2>/dev/null)
  return 0
}

# P6a, the staged action psg-wrappers: the wrapper records of pi-sandbox-guard's
# launcher stamp into state/wrappers.json, in agent-guard wrapper's form: each
# name of launcher_names but pi and omp with its hash_launcher_<name>, and the
# names of launcher_names_seen no longer installed as historical. agent-guard
# doctor fails a recorded wrapper that changed and a historical name that is still
# executable, so the gate would roll the switch back: the import refuses both
# before the switch, naming them. A recorded wrapper that is gone becomes historical.
do_psg_wrappers() {
  local tmp="$state/.wrappers-$$.json" base n h f sum json st
  local -a names seen wrappers hist bad
  integer created=0
  [[ $ag_source == pi-sandbox-guard && -f $psg_stamp ]] || return 0
  ag_jlast psg-wrappers
  st=$REPLY
  [[ $st == done ]] && return 0
  ag_psg_stamp_get launcher_names
  names=(${(s:,:)REPLY})
  ag_psg_stamp_get launcher_names_seen
  seen=(${(s:,:)REPLY})
  for n in ${names:#(pi|omp)}; do
    [[ $n == [A-Za-z0-9._-]## ]] || { ag_say "wrappers: '$n' in $psg_stamp is not a wrapper name; not imported"; continue }
    ag_psg_stamp_get "hash_launcher_$n"
    h=$REPLY
    f="$pi_bin/$n"
    if [[ ! -e $f && ! -L $f ]]; then
      ag_say "wrappers: ${f/#$home/~} is gone; $n is recorded as a historical name"
      hist+=("$n")
    elif [[ -f $f && ! -L $f && $h == [0-9a-f](#c64) ]] && sum=$(ag_pi_clean_env; /usr/bin/shasum -a 256 < "$f") && [[ ${sum%% *} == "$h" ]]; then
      wrappers+=("$n" "$h")
    else
      bad+=("${f/#$home/~} changed since pi-sandbox-guard installed it")
    fi
  done
  for n in ${seen:#(pi|omp)}; do
    (( ${names[(Ie)$n]} )) && continue
    [[ $n == [A-Za-z0-9._-]## ]] || continue
    f="$pi_bin/$n"
    if [[ -f $f && -x $f ]]; then bad+=("${f/#$home/~} was a pi-sandbox-guard wrapper and is still executable"); continue; fi
    hist+=("$n")
  done
  if (( $#bad )); then
    for f in $bad; do ag_err "$f"; done
    ag_err "remove or restore these, or deploy them again with pi-sandbox-guard, then run this again; after the install, agent-guard wrapper add records a wrapper. Nothing changed."
    return 1
  fi
  if [[ -z $st ]]; then
    [[ -e $pi_wrappers ]] || created=1
    ag_backup psg-wrappers "$pi_wrappers" && ag_jnl psg-wrappers begun "created=$created" || return 1
  fi
  test_point psg-wrappers || return 1
  base='{"wrappers":{},"historical":[]}'
  if [[ -f $txn_dir/backup/psg-wrappers/file ]]; then
    base=$(/usr/bin/jq -ce 'select((.wrappers | type) == "object" and (.historical | type) == "array")' "$txn_dir/backup/psg-wrappers/file") ||
      { ag_err "cannot read $pi_wrappers"; return 1 }
  fi
  json=$(/usr/bin/jq -c --argjson h "$(/usr/bin/jq -cn '$ARGS.positional' --args $hist)" 'reduce ($ARGS.positional | if length > 0 then _nwise(2) else empty end) as [$n, $s] (.;
      if .wrappers | has($n) then . else .wrappers[$n] = {sha256: $s} end)
    | .historical = ((.historical + $h) - (.wrappers | keys) | unique)' --args $wrappers <<< "$base") &&
    print -r -- "$json" > "$tmp" && /bin/mv -f -- "$tmp" "$pi_wrappers" || { /bin/rm -f -- "$tmp"; return 1 }
  for n h in $wrappers; do ag_say "wrappers: imported ${pi_bin/#$home/~}/$n"; done
  ag_jnl psg-wrappers done
}

undo_psg_wrappers() {
  local b="$txn_dir/backup/psg-wrappers/file"
  ag_jlast psg-wrappers
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind psg-wrappers begun
  ag_jval created
  if [[ $REPLY == 1 ]]; then /bin/rm -f -- "$pi_wrappers" || return 1
  elif [[ -f $b ]] && ! /usr/bin/cmp -s -- "$b" "$pi_wrappers"; then replace_file "$pi_wrappers" "$b" || return 1
  fi
  ag_jnl psg-wrappers undone
}

# The switch time, last in the migration's switch, as OpenCode Guard's M8.
do_psg_switch_time() {
  ag_jlast psg-switch-time
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then ag_backup psg-switch-time "$migration" && ag_jnl psg-switch-time begun || return 1; fi
  test_point psg-switch-time || return 1
  ag_mig_put "$(/usr/bin/jq -cn --argjson t "$EPOCHSECONDS" '{from: "pi-sandbox-guard", switched_at: $t, retired: false}')" pi-sandbox-guard || return 1
  ag_jnl psg-switch-time done
}

undo_psg_switch_time() {
  local b="$txn_dir/backup/psg-switch-time/file"
  ag_jlast psg-switch-time
  [[ $REPLY == (begun|done) ]] || return 0
  if [[ -f $b ]]; then replace_file "$migration" "$b" || return 1; else /bin/rm -f -- "$migration" || return 1; fi
  ag_jnl psg-switch-time undone
}

# ag_psg_into FROM TO: FROM moved to TO by one rename; an earlier TO is kept under a
# time suffix.
ag_psg_into() {
  /bin/mkdir -p -- "${2:h}" || return 1
  if [[ -e $2 || -L $2 ]]; then /bin/mv -- "$2" "$2.$EPOCHSECONDS" || return 1; fi
  /bin/mv -- "$1" "$2"
}

# After the stamp, before the cleanup deletes the transaction backup: the files
# the switch replaced, pi-sandbox-guard's originals, move into the legacy bundle:
# local-bin/ for pi, omp, pi-sandbox.sb and pi-sandbox-preamble.zsh, extension/
# for the extension folder with its .deployed-version. A file the switch left
# because it was identical (7ad441f's launcher is Agent Guard's) is copied, so the
# bundle holds all of pi-sandbox-guard. An entry that was not the guard's is the
# Pi harness's (state/legacy/replaced).
ag_m_pi_sandbox_guard_keep() {
  local a name b
  test_point psg-keep || return 1
  for a name in pi-preamble pi-sandbox-preamble.zsh pi-profile pi-sandbox.sb pi-launcher-pi pi pi-launcher-omp omp; do
    b="$txn_dir/backup/$a/file"
    if [[ -e $b || -L $b ]]; then
      if [[ $a == pi-launcher-* ]]; then
        ag_jfind $a begun
        ag_jval old
        [[ $REPLY == guard ]] || continue
      fi
      ag_psg_into "$b" "$psg_legacy/local-bin/$name" || return 1
    elif ! ag_jfind $a begun && [[ -f $pi_bin/$name && ! -L $pi_bin/$name ]]; then
      ag_psg_copy "$pi_bin/$name" "$psg_legacy/local-bin/$name" || return 1
    fi
  done
  b="$txn_dir/backup/pi-extension/folder"
  if [[ -e $b || -L $b ]]; then ag_psg_into "$b" "$psg_legacy/extension/pi-sandbox-guard" || return 1
  elif ! ag_jfind pi-extension begun && [[ -d $pi_ext && ! -L $pi_ext ]]; then
    ag_psg_copy "$pi_ext" "$psg_legacy/extension/pi-sandbox-guard" || return 1
  fi
  return 0
}

# ag_psg_copy FROM TO: a copy of FROM at TO, built beside it and renamed; an
# existing TO is left, so a rerun does not copy again.
ag_psg_copy() {
  [[ -e $2 || -L $2 ]] && return 0
  /bin/mkdir -p -- "${2:h}" && /bin/rm -rf -- "$2.partial" && /bin/cp -Rp -- "$1" "$2.partial" && /bin/mv -- "$2.partial" "$2"
}

# --- Retirement (design section 11, The adoption, item 7), after the keep step of
# the migration's transaction, journaled while it is open: what pi-sandbox-guard
# left beside its files moves into the legacy bundle, out of reach of Pi sessions:
# the launcher backups ~/.local/bin/<name>.bak.*, the launcher stamp and
# ~/.pi/agent/extension-backups. The security event log and executables.conf stay
# in place. Nothing is deleted. Each item runs while it is unfinished.

ag_m_pi_sandbox_guard_retire() { ag_psg_retire }

ag_psg_retire() {
  local rec f
  local -a names
  ag_mig_get pi-sandbox-guard || return 0
  [[ -n $REPLY && $(/usr/bin/jq -r '.retired' <<< "$REPLY") == false ]] || return 0
  rec=$REPLY
  ag_say 'retiring pi-sandbox-guard'
  test_point psg-retire-launchers || return 1
  # The names it installed, from its stamp, or from the bundle's copy once moved.
  f=$psg_stamp
  [[ -f $f ]] || f="$psg_legacy/local-bin/.pi-sandbox-launchers-version"
  ag_psg_stamp_get launcher_names "$f"
  names=(pi omp pi-sandbox.sb pi-sandbox-preamble.zsh ${(s:,:)REPLY})
  ag_psg_stamp_get launcher_names_seen "$f"
  names+=(${(s:,:)REPLY})
  names=(${(u)${(M)names:#[A-Za-z0-9._-]##}})
  for f in "$pi_bin"/${^names}.bak.<->.<->(N); do
    ag_psg_into "$f" "$psg_legacy/local-bin/${f:t}" || { ag_warn "cannot move $f into $psg_legacy"; return 1 }
  done
  if [[ -e $psg_stamp ]]; then
    ag_psg_into "$psg_stamp" "$psg_legacy/local-bin/${psg_stamp:t}" || { ag_warn "cannot move $psg_stamp into $psg_legacy"; return 1 }
  fi
  ag_rjnl psg-retire-launchers done
  test_point psg-retire-backups || return 1
  if [[ -e $psg_ext_backups || -L $psg_ext_backups ]]; then
    ag_psg_into "$psg_ext_backups" "$psg_legacy/extension-backups" || { ag_warn "cannot move $psg_ext_backups into $psg_legacy"; return 1 }
  fi
  ag_rjnl psg-retire-backups done
  ag_mig_put "$(/usr/bin/jq -c '.retired = true' <<< "$rec")" pi-sandbox-guard || return 1
  ag_rjnl psg-retire done
  ag_say 'pi-sandbox-guard is retired'
}

ag_m_pi_sandbox_guard_report() {
  ag_say "pi-sandbox-guard is replaced: agent-guard update, doctor, bind and wrapper take the place of its npm scripts."
  ag_say "Its files from before are kept in $psg_legacy; ~/.pi/agent/security-events.log and ${pi_conf/#$home/~} stay where they are."
}

# --- Uninstall (design section 11, The adoption, Uninstall).

# U6: retirement if it is unfinished, then a copy of the legacy bundle in
# ~/Agent Guard, as U7 copies the permission record, and the steps that reinstate
# pi-sandbox-guard from it. Fails when the copy fails, so the engine is kept.
ag_m_pi_sandbox_guard_uninstall() {
  local dest=$psg_copy partial="$list_dir/.pi-sandbox-guard-legacy.partial"
  reply=()
  if [[ -f $migration ]] && ag_mig_get pi-sandbox-guard && [[ -n $REPLY ]]; then
    ag_psg_retire || reply+=("pi-sandbox-guard's files named above")
  fi
  [[ -d $psg_legacy ]] || return 0
  test_point psg-uninstall-copy || return 1
  if [[ -e $dest ]] && ! /usr/bin/diff -rq -- "$psg_legacy" "$dest" >/dev/null 2>&1; then
    dest="$psg_copy-$(/bin/date -u +%Y%m%dT%H%M%SZ)"
  fi
  if [[ ! -e $dest ]]; then
    /bin/rm -rf -- "$partial"
    if ! { /bin/mkdir -p -- "$list_dir" && /bin/cp -Rp -- "$psg_legacy" "$partial" && /bin/mv -- "$partial" "$dest" }; then
      /bin/rm -rf -- "$partial"
      ag_err "could not copy pi-sandbox-guard's files from $psg_legacy to $dest, so $engine is kept. Run agent-guard uninstall again."
      return 1
    fi
  fi
  ag_say "pi-sandbox-guard's files from before Agent Guard are in $dest. To reinstate pi-sandbox-guard 7ad441f there:"
  ag_say "  /bin/cp -p \"$dest/local-bin/\"{pi,omp,pi-sandbox.sb,pi-sandbox-preamble.zsh} ~/.local/bin/"
  ag_say "  /bin/cp -Rp \"$dest/extension/pi-sandbox-guard\" ~/.pi/agent/extensions/"
  ag_say "or run npm run setup in a pi-sandbox-guard checkout. ${pi_conf/#$home/~} and ~/.pi/agent/security-events.log are where they were."
  return 0
}

# Agent Guard installer: the Grok harness (docs/DESIGN.md section 3, Grok): the
# link at ~/.local/bin/grok to Agent Guard's launcher, the recorded real
# executable, their switch actions with backup and undo, the staged and gate
# checks, the doctor entry and the uninstall steps, and the hooks of the harness
# interface (actions.zsh). The backup helpers are the Pi harness's
# (ag_pi_backup, ag_pi_put, ag_pi_put_undo, ag_pi_missing, ag_pi_rmdirs).

ag_h_grok_init() {
  grok_shim="$home/.local/bin/grok"
  grok_default="$home/.grok/bin/grok"
  grok_record="$state/grok-executable"
  grok_kept="$state/grok-kept"
  grok_replaced="$state/grok-replaced"
  grok_release_files=(args.zsh credentials.sb grok harness.zsh hooks.zsh)
  ag_grok_exec=
}

ag_h_grok_title() { REPLY=Grok }

# Installed when the stamp lists it or Grok's own executable or link is in the
# account home. Nothing else is looked up, so the test home alone decides.
ag_h_grok_detect() {
  ag_stamp_harnesses
  (( ${reply[(Ie)grok]} )) && return 0
  [[ -x $grok_default && ! -d $grok_default ]] && return 0
  [[ -x $grok_shim && ! -d $grok_shim ]]
}

ag_h_grok_volume() { reply=("${grok_shim:h}") }

# The executable the launcher runs: the recorded one while it still works, else
# the target of a link that is not ours, else Grok's own install folder, else a
# regular executable at the link's place, which the link replaces and so which
# the install copies to $grok_kept first (ag_grok_stage). Sets ag_grok_exec, to
# the link's own path for that last case, or fails when there is none.
ag_grok_resolve() {
  local t
  ag_grok_exec=
  if [[ -r $grok_record ]]; then
    t=$(<"$grok_record")
    [[ $t == /* && -x $t && ! -d $t ]] && [[ ${t:A} != "$engine"/* || ${t:A} == ${grok_kept:A}/grok ]] && { ag_grok_exec=$t; return 0 }
  fi
  if [[ -L $grok_shim && $(/usr/bin/readlink -- "$grok_shim") != "$engine/bin/grok" ]]; then
    t=$(/usr/bin/readlink -- "$grok_shim")
    [[ $t == /* ]] || t="${grok_shim:h}/$t"
    [[ -x $t && ! -d $t && ${t:A} != "$engine"/* ]] && { ag_grok_exec=$t; return 0 }
  fi
  [[ -x $grok_default && ! -d $grok_default ]] && { ag_grok_exec=$grok_default; return 0 }
  [[ -f $grok_shim && ! -L $grok_shim && -x $grok_shim ]] && { ag_grok_exec=$grok_shim; return 0 }
  return 1
}

ag_h_grok_prepare() {
  ag_grok_resolve ||
    { ag_err "no Grok executable: ${grok_default/#$home/~} is missing and ${grok_shim/#$home/~} is not a link to one"; return 1 }
}

# P4: the release's Grok files and bin/grok, which ~/.local/bin/grok links to.
ag_h_grok_assemble() {  # RELEASE-FOLDER
  local r=$1 f
  /bin/mkdir -p -- "$r/profiles/grok" || return 1
  for f in $grok_release_files; do
    /bin/cp -- "$ag_tree/profiles/grok/$f" "$r/profiles/grok/$f" || return 1
  done
  /bin/cp -- "$ag_tree/profiles/grok/grok" "$r/bin/grok" && /bin/chmod 755 "$r/bin/grok" || return 1
  for f in args.zsh harness.zsh hooks.zsh grok; do
    /bin/zsh -fn "$r/profiles/grok/$f" || { ag_err "profiles/grok/$f does not parse"; return 1 }
  done
}

# The staged record and its identical copy, which ag_pi_put compares against.
# A regular executable at the link's place is copied for grok-kept, and the record
# names the copy, since the link is about to replace the original.
ag_grok_stage() {
  local s="$ag_tstage/grok"
  /bin/rm -rf -- "$s"
  /bin/mkdir -p -- "$s" || return 1
  ag_grok_resolve || return 1
  if [[ $ag_grok_exec == "$grok_shim" ]]; then
    /bin/cp -p -- "$grok_shim" "$s/grok-kept" && /bin/cp -p -- "$grok_shim" "$s/grok-kept.want" || return 1
    ag_grok_exec="$grok_kept/grok"
  fi
  print -r -- "$ag_grok_exec" > "$s/grok-executable" && print -r -- "$ag_grok_exec" > "$s/grok-executable.want" &&
    /bin/chmod 644 "$s/grok-executable" "$s/grok-executable.want"
}

# P7: the staged release's own check, with the executable found as the launcher
# finds it before the switch.
ag_h_grok_staged() {
  local out rc
  local -a found
  ag_grok_stage || { ag_failed+=('FAIL cannot stage the Grok record'); return 1 }
  out=$("$engine/releases/$ag_rid_new/launch" --harness grok check staged 2>&1)
  rc=$?
  ag_say "$out"
  (( rc == 0 )) && return 0
  found=(${(M)${(f)out}:#FAIL*})
  (( $#found )) || found=("FAIL Grok check staged exited $rc")
  ag_failed+=($found)
  return 1
}

# --- Switch actions, registered in actions.zsh: the record, then the link, so the
# launcher can find the executable the moment the link points at it.

# The copy of a regular executable the link replaces, in the engine's state folder,
# which a guarded session cannot write. Nothing to do for any other layout.
do_grok_kept() {
  ag_grok_stage || return 1
  [[ -e $ag_tstage/grok/grok-kept ]] || { ag_jlast grok-kept; [[ $REPLY == done ]] || return 0 }
  ag_pi_put grok-kept "$grok_kept/grok" "$ag_tstage/grok/grok-kept" "$ag_tstage/grok/grok-kept.want"
}
undo_grok_kept() { ag_pi_put_undo grok-kept "$grok_kept/grok" }

do_grok_binding() {
  ag_grok_stage || return 1
  ag_pi_put grok-binding "$grok_record" "$ag_tstage/grok/grok-executable" "$ag_tstage/grok/grok-executable.want"
}
undo_grok_binding() { ag_pi_put_undo grok-binding "$grok_record" }

do_grok_shim() {
  local tmp="${grok_shim:h}/.grok.partial" want="$engine/bin/grok"
  ag_jlast grok-shim
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -L $grok_shim && $(/usr/bin/readlink -- "$grok_shim") == "$want" ]]; then test_point grok-shim; return; fi
    ag_pi_missing "$grok_shim"
    ag_pi_backup grok-shim "$grok_shim" && ag_jnl grok-shim begun "mk=$REPLY" || return 1
  fi
  test_point grok-shim || return 1
  /bin/mkdir -p -- "${grok_shim:h}" && /bin/rm -f -- "$tmp" && /bin/ln -s "$want" "$tmp" && /bin/mv -fh -- "$tmp" "$grok_shim" || return 1
  [[ -L $grok_shim && $(/usr/bin/readlink -- "$grok_shim") == "$want" ]] || return 1
  ag_jnl grok-shim done
}
undo_grok_shim() { ag_pi_put_undo grok-shim "$grok_shim" }

# --- After the switch.

# The gate's launch through $engine/bin: the log's first line names the release.
ag_h_grok_gate() {
  local out log="$list_dir/last-launch-grok.log" first=
  integer rc
  /bin/rm -f -- "$log"
  out=$(ag_bounded 20 "$engine/bin/grok" --version 2>&1)
  rc=$?
  [[ -r $log ]] && first=$(/usr/bin/head -1 -- "$log")
  if (( rc == 124 )); then
    ag_failed+=('FAIL grok --version through bin/grok did not finish within 20 seconds')
  elif (( rc )); then
    ag_failed+=("FAIL grok --version through bin/grok exited $rc: ${${(f)out}[-1]:-no output}")
  elif [[ $first != "Agent Guard cli $ag_rid_new "* ]]; then
    ag_failed+=("FAIL grok --version through bin/grok did not run release $ag_rid_new")
  else
    ag_say "ok   grok --version through bin/grok ran release $ag_rid_new"
  fi
}

ag_h_grok_links() { reply=("$grok_shim" "$(/usr/bin/readlink -- "$grok_shim")") }

# After the stamp: the entry the link replaced moves from the transaction backup to
# state/grok-replaced, which outlives the cleanup and from which uninstall puts it
# back.
ag_h_grok_keep() {
  local b="$txn_dir/backup/grok-shim/file"
  test_point grok-keep || return 1
  [[ -e $b || -L $b ]] || return 0
  /bin/mkdir -p -- "$grok_replaced" || return 1
  [[ -e $grok_replaced/grok || -L $grok_replaced/grok ]] && { /bin/mv -- "$grok_replaced/grok" "$grok_replaced/grok.$EPOCHSECONDS" || return 1 }
  /bin/mv -- "$b" "$grok_replaced/grok"
}

ag_h_grok_report() {
  ag_say "Grok: grok in ${grok_shim:h} and in Agent Guard's bin starts Grok inside the guard with --sandbox off; sign in, switch accounts and update Grok with ${grok_default/#$home/~}, outside the guard"
  return 0
}

# Which grok each kind of shell finds first. The lookup runs in a clean
# environment with this account's home, as a new terminal window would.
ag_grok_lookup() {  # LABEL SHELL-OPTIONS...
  local label=$1 p
  local -a found
  shift
  p=$(ag_bounded 20 /usr/bin/env -i "HOME=$home" "PATH=/usr/bin:/bin:/usr/sbin:/sbin" /bin/zsh "$@" -c 'whence -p grok' 2>/dev/null </dev/null)
  found=("${(@f)p}")
  p=${found[-1]:-}
  if [[ -z $p ]]; then
    print -r -- "skip grok in $label: not found"
  elif [[ ${p:A} == "$engine"/releases/*/bin/grok ]]; then
    print -r -- "ok   grok in $label resolves to ${p/#$home/~}, Agent Guard's launcher"
  else
    print -r -- "FAIL grok in $label resolves to ${p/#$home/~}, not Agent Guard's launcher; run the installer again to put the link back"
    return 1
  fi
}

# Grok's part of agent-guard doctor: the release's launch check, then the lookups.
ag_h_grok_doctor() {  # RELEASE [--json]
  local out
  local -a lines
  integer rc=0
  out=$("$1/launch" --harness grok check 2>&1) || rc=1
  lines=("${(@f)out}")
  out=$(ag_grok_lookup 'a new terminal window' -l -i) || rc=1
  lines+=("${(@f)out}")
  out=$(ag_grok_lookup 'zsh -c') || rc=1
  lines+=("${(@f)out}")
  if [[ ${2:-} == --json ]]; then reply=("${lines[@]}") REPLY='{}'; else print -rl -- "${lines[@]}"; fi
  return $rc
}

# --- Uninstall.

# U3: the link goes, and the entry it replaced is put back by one rename, a link
# with its original target text. A grok that is no longer our link is left.
ag_h_grok_uninstall_remove() {
  local f=$grok_shim
  /bin/rm -f -- "${f:h}/.grok.partial"
  if [[ -L $f && $(/usr/bin/readlink -- "$f") == "$engine/bin/grok" ]]; then
    if [[ -e $grok_replaced/grok || -L $grok_replaced/grok ]]; then
      /bin/mv -fh -- "$grok_replaced/grok" "$f" ||
        { ag_err "cannot put back ${f/#$home/~}; $engine is kept, so agent-guard uninstall can run again"; return 1 }
      ag_say "put back ${f/#$home/~} as it was before Agent Guard"
    else
      /bin/rm -f -- "$f" || { ag_err "cannot remove ${f/#$home/~}; $engine is kept, so agent-guard uninstall can run again"; return 1 }
    fi
  elif [[ -e $f || -L $f ]]; then
    ag_warn "${f/#$home/~} is not Agent Guard's link; left as it is"
  fi
  return 0
}

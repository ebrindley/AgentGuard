# Agent Guard installer: the transaction machinery and the engine's own steps
# (docs/DESIGN.md section 6). install.sh sources this file, actions.zsh and the
# harness and migration modules that actions.zsh names, then calls one of the
# entries at the end of this file. Only functions are defined here.

test_point() { : }

ag_say() { print -r -- "$*" }
ag_warn() { print -ru2 -- "warning: $*" }
ag_err() { print -ru2 -- "Agent Guard: $*" }

# ag_hook h|m NAME HOOK [ARGS...]: runs harness NAME's ag_h_<NAME>_<HOOK>, or
# migration NAME's ag_m_<NAME>_<HOOK>, with - in NAME read as _ (actions.zsh).
# ag_hook_opt does the same for a hook a module may leave out, and then returns 0.
ag_hook() { local ag_fn="ag_${1}_${2//-/_}_$3"; shift 3; "$ag_fn" "$@" }
ag_hook_opt() { local ag_fn="ag_${1}_${2//-/_}_$3"; shift 3; (( $+functions[$ag_fn] )) || return 0; "$ag_fn" "$@" }

# Paths every entry uses. Home comes only from account_home, in account.zsh next
# to the entry install.sh (a release folder or state/txn) or in the tree's engine/.
# install.sh's main sets ag_self to that file before anything calls this.
ag_init() {
  local account h m
  account="${ag_self:h}/account.zsh"
  [[ -f $account ]] || account="${ag_self:h:h:h}/engine/account.zsh"
  source "$account" || { ag_err "cannot load $account"; return 1 }
  account_home || { ag_err 'cannot resolve account home'; return 1 }
  { zmodload zsh/system zsh/datetime && zmodload -F zsh/stat b:zstat } 2>/dev/null ||
    { ag_err 'zsh/system, zsh/datetime or zsh/stat not available'; return 1 }
  home=${REPLY:A}
  engine="$home/Library/Application Support/AgentGuard"
  state="$engine/state"
  txn_dir="$state/txn"
  record="$state/permissions.json"
  stamp="$state/stamp.json"
  migration="$state/migration.json"
  list_dir="$home/Agent Guard"
  list="$list_dir/Guard List.txt"
  app="$home/Applications/Agent Guard.app"
  cc="$home/.cc-safety-net/rules"
  marker_start='# >>> agent-guard >>>'
  marker_end='# <<< agent-guard <<<'
  bundle_id=io.github.ebrindley.agentguard
  ag_locked=0 ag_perm_failed=0 ag_unreadable=0 ag_kind= ag_source=
  typeset -ga ag_warnings ag_failed ag_configs ag_unrestored ag_harnesses ag_keep ag_migrated ag_probe_dirs ag_old_blocks
  typeset -gA ag_mig_state
  ag_warnings=() ag_failed=() ag_unrestored=() ag_harnesses=() ag_keep=() ag_migrated=() ag_probe_dirs=() ag_old_blocks=()
  ag_mig_state=()
  ag_registry
  for h in $ag_harness_modules; do ag_hook_opt h $h init || return 1; done
  for m in $ag_migration_modules; do ag_hook_opt m $m init || return 1; done
  return 0
}

ag_tools() {
  local t
  [[ $(/usr/bin/uname -s) == Darwin ]] || { ag_err 'macOS only'; return 1 }
  for t in /usr/bin/{sandbox-exec,jq,osacompile,codesign,curl,shasum,tar,plutil,xattr,dscl,stat,awk,cmp,readlink,pgrep} /usr/sbin/sysctl /bin/{ps,sync}; do
    [[ -x $t ]] || { ag_err "missing $t (macOS 15 or later required)"; return 1 }
  done
}

# Inside a guard or another sandbox the state folder is not writable and the
# write fails with EPERM. Refuse then, before anything changes. The state folders
# of older guards (ag_probe_dirs, from the migration modules), when present, are
# probed too: each guard denies the other's.
ag_probe() {
  local d
  ag_probe_dir "$state" create || return 1
  for d in $ag_probe_dirs; do
    if [[ -e $d || -L $d ]]; then ag_probe_dir "$d" || return 1; fi
  done
  return 0
}

ag_probe_dir() {  # DIR [create]
  local d=$1 err= eperm= fd=
  syserror -e eperm EPERM
  [[ -L $d ]] && { ag_err "$d is a symbolic link; not changed"; return 1 }
  /bin/rm -f -- "$d/.probe-$$" 2>/dev/null
  if { [[ ${2:-} == create ]] && ! err=$(/bin/mkdir -p -- "$d" 2>&1) } ||
     ! err=$( { sysopen -w -o creat,excl -u fd "$d/.probe-$$" } 2>&1 ); then
    [[ ${(L)err} == *": ${(L)eperm}" ]] && { ag_err 'run this from Terminal, outside any guard or sandbox'; return 1 }
    ag_err "cannot write $d: ${err##*: }"
    return 1
  fi
  /bin/rm -f -- "$d/.probe-$$"
}

# --- Lock: the folder state/lock with files start and pid, as the bootstrap
# writes them. start is `ps -o lstart=` of pid with blanks collapsed. exec keeps
# both, so a lock taken by agent-guard or the bootstrap passes to this script.

ag_start_of() {
  local s
  s=$(/bin/ps -o lstart= -p $1 2>/dev/null) || return 1
  REPLY=${(j: :)${=s}}
  [[ -n $REPLY ]]
}

# 0: held by ag_lock_pid with ag_lock_start; 1: held by another live run; 2:
# stale; 3: absent. A lock without a complete owner record counts as held for 10
# seconds after the folder last changed. Sets ag_lock_owner to the recorded pid.
ag_lock_status() {
  local start= c=
  local -a m
  ag_lock_owner=
  [[ -e $state/lock || -L $state/lock ]] || return 3
  { [[ -r $state/lock/pid ]] && ag_lock_owner=$(<"$state/lock/pid") } 2>/dev/null
  { [[ -r $state/lock/start ]] && start=$(<"$state/lock/start") } 2>/dev/null
  if [[ $ag_lock_owner != <-> || -z $start ]]; then
    ag_lock_owner=
    zstat -L -A m +mtime -- "$state/lock" 2>/dev/null || return 3
    (( EPOCHSECONDS - m[1] < 10 )) && return 1
    return 2
  fi
  [[ $ag_lock_owner == "$ag_lock_pid" && $start == "$ag_lock_start" ]] && return 0
  c=$(/bin/ps -o comm= -p $ag_lock_owner 2>/dev/null) && [[ ${c:t} == zsh ]] &&
    c=$(/bin/ps -o lstart= -p $ag_lock_owner 2>/dev/null) && [[ ${(j: :)${=c}} == "$start" ]] && return 1
  return 2
}

# Renames a stale lock away, after checking again under an fcntl lock on
# state/.lock-takeover, so two runs that found the same lock stale cannot both
# remove it, nor remove its successor.
ag_take_over() {
  local fd= gone="$state/.lock-stale-$$"
  { : >> "$state/.lock-takeover" && zsystem flock -t 10 -f fd "$state/.lock-takeover" } 2>/dev/null ||
    { ag_err "cannot lock $state/.lock-takeover"; return 1 }
  ag_lock_status
  if (( $? == 2 )); then
    /bin/rm -rf -- "$gone"
    /bin/mv -- "$state/lock" "$gone" && /bin/rm -rf -- "$gone"
  fi
  zsystem flock -u $fd
}

# ag_lock [parent]: takes state/lock, or keeps it when this process already holds
# it. With parent (recovery), requires that the calling process holds it.
ag_lock() {
  integer tries=0 adopted=0
  ag_lock_pid=$$
  [[ ${1:-} == parent ]] && ag_lock_pid=$PPID
  ag_start_of $ag_lock_pid || { ag_err "cannot read the start time of process $ag_lock_pid"; return 1 }
  ag_lock_start=$REPLY
  if [[ ${1:-} == parent ]]; then
    ag_lock_status
    (( $? == 0 )) || { ag_err "recovery runs only under its caller's lock ($state/lock)"; return 1 }
    return 0
  fi
  until /bin/mkdir -- "$state/lock" 2>/dev/null; do
    (( ++tries <= 5 )) || { ag_err "cannot take $state/lock"; return 1 }
    ag_lock_status
    case $? in
      (0) adopted=1; break ;;
      (1) ag_err "another Agent Guard install is running${ag_lock_owner:+ (process $ag_lock_owner)}"; return 1 ;;
      (2) ag_take_over || return 1 ;;
    esac
  done
  # Created exclusively and read back: a run that found the folder stale may have
  # replaced it with its own.
  if (( ! adopted )); then
    { ( setopt no_clobber; print -r -- "$ag_lock_start" > "$state/lock/start" && print -r -- $$ > "$state/lock/pid" ) &&
      [[ $(<"$state/lock/start") == "$ag_lock_start" && $(<"$state/lock/pid") == $$ ]] } 2>/dev/null ||
      { ag_err "cannot write the owner of $state/lock"; return 1 }
  fi
  ag_locked=1
}

ag_unlock() {
  local owner=
  (( ag_locked )) || return 0
  { owner=$(<"$state/lock/pid") } 2>/dev/null
  [[ $owner == $$ ]] && /bin/rm -rf -- "$state/lock"
  ag_locked=0
}

# Unlocks. An engine folder that holds nothing but this run's lock is removed
# instead, by renaming it while the lock inside is still held, so a run that
# starts meanwhile finds no engine folder to lose.
ag_release_engine() {
  local -a left
  /bin/rmdir -- "$engine/stage" "$engine/releases" 2>/dev/null
  left=("$engine"/*(DN) "$state"/*(DN))
  if (( ag_locked )) && [[ ${(j:|:)left} == "$state|$state/lock" || ${(j:|:)left} == "$state|$state/.lock-takeover|$state/lock" ]]; then
    ag_remove_engine && return 0
  fi
  ag_unlock
  /bin/rmdir -- "$state" "$engine" 2>/dev/null
  return 0
}

# Removes the whole engine folder by renaming it first, while this run's lock inside it is held.
ag_remove_engine() {
  local gone="${engine:h}/.AgentGuard-failed-$$"
  /bin/mv -- "$engine" "$gone" || return 1
  ag_locked=0
  /bin/rm -rf -- "$gone"
}

# --- Recovery (design section 2.3), run first by every mutating entry.

# ag_recover CALLER [ACTIVE]: finishes an interrupted run with the transaction's
# own copy of the installer, then removes stage/* except ACTIVE, this run's stage.
# The copy is whatever release opened the transaction, so a transaction left
# open by an earlier release is finished by that release's code.
ag_recover() {
  local caller=$1 keep=${2:-} pid= c= s
  if [[ -f $state/.serve.pid ]]; then
    { pid=$(<"$state/.serve.pid") } 2>/dev/null
    [[ $pid == <-> ]] && c=$(/bin/ps -o command= -p $pid 2>/dev/null) && [[ $c == *'serve --hostname 127.0.0.1'* ]] &&
      kill $pid 2>/dev/null
    /bin/rm -f -- "$state/.serve.pid" "$state"/.serve.<->(N)
  fi
  /bin/rm -rf -- "$state/txn.new" "$state"/.txn-done-*(N)
  if [[ -d $txn_dir ]]; then
    [[ -f $txn_dir/install.sh ]] || { ag_err "$txn_dir holds no copy of the installer; nothing changed"; return 1 }
    /bin/zsh -f "$txn_dir/install.sh" --recover "$caller" ||
      { ag_err "the interrupted run in $txn_dir could not be finished; it is kept for the next run"; return 1 }
    [[ ! -e $txn_dir ]] || { ag_err "$txn_dir is still open"; return 1 }
  fi
  for s in "$engine/stage"/*(DN); do
    [[ -n $keep && ${s:t} == "$keep" ]] || /bin/rm -rf -- "$s"
  done
  return 0
}

# --- Primitives (design section 2.1).

# replace_file PATH NEWFILE: one rename at the resolved target, so a symlinked
# file stays a link and keeps its mode.
replace_file() {
  [[ -L $1 && ! -e $1 ]] && { ag_warn "$1 is a broken symbolic link; not changed"; return 1 }
  local target=${1:A} tmp
  tmp="${target:h}/.${target:t}.partial"
  /bin/rm -f -- "$tmp"
  if [[ -e $target ]]; then /bin/cp -p -- "$target" "$tmp" || return 1; fi
  /bin/cat -- "$2" > "$tmp" || { /bin/rm -f -- "$tmp"; return 1 }
  /bin/mv -f -- "$tmp" "$target"
}

# replace_link LINK TARGET: a link under a temporary name, then one rename, so LINK
# exists at every moment. -h renames onto a link to a folder instead of into it.
replace_link() {
  local tmp="${1:h}/.${1:t}.partial"
  /bin/rm -f -- "$tmp"
  /bin/ln -s "$2" "$tmp" && /bin/mv -fh -- "$tmp" "$1"
}

# restore_over_link LINK FILE: replaces LINK itself, never its target, with a copy of FILE.
restore_over_link() {
  local tmp="${1:h}/.${1:t}.partial"
  /bin/rm -f -- "$tmp"
  /bin/cp -p -- "$2" "$tmp" && [[ -f $tmp && ! -L $tmp ]] && /bin/mv -fh -- "$tmp" "$1"
}

ag_sha() {
  local s
  [[ -f $1 ]] || { REPLY=absent; return 0 }
  s=$(/usr/bin/shasum -a 256 < "$1") || return 1
  REPLY=${s%% *}
}

# Boot time in seconds since 1970, from kern.boottime ("{ sec = N, usec = M } ...").
boot_time() {
  local out
  out=$(/usr/sbin/sysctl -n kern.boottime 2>/dev/null) || return 1
  [[ $out == (#b)'{ sec = '([0-9]##)', '* ]] || return 1
  REPLY=$match[1]
}

# ag_proc_check [-f [-a FLAG]] HINT NAME...: fails while a process named NAME runs
# (pgrep -x), saying HINT, and when processes cannot be listed. With -f each NAME is
# a path matched as a word of a process's argument list (pgrep -f), for a harness
# whose process has another name: a Pi session's is node. With -a it matches only
# as FLAG's argument, FLAG NAME or FLAG=NAME, so a pager or editor that has the
# file open does not count. A migration runs only while the harness it hands over
# does not run (design section 8.2).
ag_proc_check() {
  local hint n mode=-x what flag= cls='[][\\^$.|?*+(){}]'
  local pgrep=/usr/bin/pgrep
  integer rc
  [[ $1 == -f ]] && { mode=-f; shift }
  [[ $mode == -f && $1 == -a ]] && { flag="${2//(#m)$~cls/\\$MATCH}([[:space:]]+|=)"; shift 2 }
  hint=$1
  shift
  for n in ${(u)@}; do
    what=$n
    [[ $mode == -f ]] && what="(^|[[:space:]])$flag${n//(#m)$~cls/\\$MATCH}([[:space:]]|\$)"
    $pgrep $mode -- "$what" >/dev/null 2>&1
    rc=$?
    case $rc in
      (0)
        if [[ $mode == -f ]]; then ag_err "a running process runs $n. $hint, then run this command again."
        else ag_err "$n is running. $hint, then run this command again."; fi
        return 1 ;;
      (1) ;;
      (*) ag_err "cannot list processes (pgrep exited $rc); run this from Terminal, outside any sandbox."; return 1 ;;
    esac
  done
  return 0
}

# --- Journal (design section 2.2). Lines are "<action> <begun|done|undone>
# [detail]"; for actions repeated per file the detail starts with the file's key.
# A line of another form, such as a torn last line, is ignored.

ag_jnl() {
  print -r -- "$*" >> "$txn_dir/journal" || return 1
  [[ ${2:-} == begun ]] && /bin/sync
  return 0
}

# ag_rjnl: ag_jnl when a transaction is open; steps that also run outside one
# (retirement) journal only then.
ag_rjnl() { [[ -d $txn_dir && -f $txn_dir/journal ]] || return 0; ag_jnl "$@" }

# ag_jlast ACTION [KEY]: REPLY = the state on ACTION's last line, or empty.
ag_jlast() {
  local l
  local -a w
  REPLY=
  [[ -r $txn_dir/journal ]] || return 0
  for l in "${(@f)$(<"$txn_dir/journal")}"; do
    [[ $l == [a-z-]##' '(begun|done|undone)(|' '*) ]] || continue
    w=("${(@s: :)l}")
    [[ $w[1] == "$1" ]] || continue
    [[ -n ${2:-} && ${w[3]:-} != "$2" ]] && continue
    REPLY=$w[2]
  done
  return 0
}

# ag_jfind ACTION STATE [KEY]: REPLY = the detail of ACTION's last line in STATE.
ag_jfind() {
  local l
  local -a w
  integer found=1
  REPLY=
  [[ -r $txn_dir/journal ]] || return 1
  for l in "${(@f)$(<"$txn_dir/journal")}"; do
    [[ $l == [a-z-]##' '(begun|done|undone)(|' '*) ]] || continue
    w=("${(@s: :)l}")
    [[ $w[1] == "$1" && $w[2] == "$2" ]] || continue
    [[ -n ${3:-} && ${w[3]:-} != "$3" ]] && continue
    REPLY=${${l#"$w[1] $w[2]"}# }
    found=0
  done
  return $found
}

# ag_jval NAME: REPLY = the value of NAME=VALUE in the detail in REPLY.
ag_jval() {
  local d=" $REPLY "
  REPLY=
  [[ $d == *" $1="(#b)([^[:space:]]#)" "* ]] && REPLY=$match[1]
  return 0
}

# True when the journal names any switch action of the registry (actions.zsh), in
# any state, whichever kind of transaction registered it: recovery then finishes
# or undoes the switch rather than discarding the release.
ag_switch_begun() {
  local l pat
  ag_action_names switch
  (( $#reply )) || return 1
  pat="(${(j:|:)reply})"
  [[ -r $txn_dir/journal ]] || return 1
  for l in "${(@f)$(<"$txn_dir/journal")}"; do
    [[ $l == ${~pat}' '(begun|done|undone)(|' '*) ]] && return 0
  done
  return 1
}

# ag_backup NAME [FILE]: backup/NAME holds a copy of FILE as "file", or nothing
# when FILE is absent. Built under NAME.new and renamed, so the folder is complete.
ag_backup() {
  local b="$txn_dir/backup/$1"
  /bin/rm -rf -- "$b.new" "$b"
  /bin/mkdir -p -- "$b.new" || return 1
  if [[ -n ${2:-} && -e $2 ]]; then /bin/cp -p -- "$2" "$b.new/file" || return 1; fi
  /bin/mv -- "$b.new" "$b"
}

# --- Plan (state/txn/plan.json) and transaction state. Only the copy of the
# installer in the same transaction reads its plan.

ag_plan_write() {
  local harnesses keep
  harnesses=$(/usr/bin/jq -cn '$ARGS.positional' --args "${ag_harnesses[@]}") &&
    keep=$(/usr/bin/jq -cn '$ARGS.positional' --args "${ag_keep[@]}") || return 1
  /usr/bin/jq -n --arg txn "$ag_txn" --arg kind "$ag_kind" --arg source "$ag_source" --arg rid_new "$ag_rid_new" --arg rid_old "$ag_rid_old" \
    --argjson started "$EPOCHSECONDS" --argjson app "$ag_app_rebuild" --arg app_inputs "$ag_app_inputs" \
    --arg version "$ag_version" --arg tag "$ag_tag" --arg commit "$ag_commit" --argjson harnesses "$harnesses" --argjson keep "$keep" \
    '{txn: $txn, kind: $kind, migration: (if $source == "" then null else $source end), harnesses: $harnesses,
      rid_new: $rid_new, rid_old: (if $rid_old == "" then null else $rid_old end), keep: $keep,
      started_at: $started, app: ($app == 1), app_inputs: $app_inputs,
      version: $version, tag: $tag, commit: $commit, configs: $ARGS.positional}' --args "${ag_configs[@]}" > "$1"
}

ag_txn_load() {
  local p="$txn_dir/plan.json" out h
  local -a v
  out=$(/usr/bin/jq -r '.txn, .kind, (.migration // ""), .rid_new, (.rid_old // ""), (if .app then "1" else "0" end), .app_inputs, .version, .tag, .commit' "$p" 2>/dev/null) ||
    { ag_err "cannot read $p"; return 1 }
  v=("${(@f)out}")
  (( $#v == 10 )) || { ag_err "cannot read $p"; return 1 }
  ag_txn=$v[1] ag_kind=$v[2] ag_source=$v[3] ag_rid_new=$v[4] ag_rid_old=$v[5] ag_app_rebuild=$v[6] ag_app_inputs=$v[7]
  ag_version=$v[8] ag_tag=$v[9] ag_commit=$v[10]
  [[ $ag_txn == [0-9A-Za-z.-]## && $ag_rid_new == [0-9A-Za-z.+-]## && $ag_rid_old == [0-9A-Za-z.+-]# && $ag_kind == (install|update|migrate) ]] &&
    [[ -z $ag_source || ${ag_migration_modules[(Ie)$ag_source]} != 0 ]] || { ag_err "unexpected values in $p"; return 1 }
  ag_configs=(${(f)"$(/usr/bin/jq -r '.configs[]' "$p")"})
  ag_harnesses=(${(f)"$(/usr/bin/jq -r '.harnesses[]' "$p")"})
  ag_keep=(${(f)"$(/usr/bin/jq -r '.keep[]' "$p")"})
  for h in $ag_harnesses; do
    (( ${ag_harness_modules[(Ie)$h]} )) || { ag_err "unexpected harness in $p: $h"; return 1 }
  done
  ag_tstage="$engine/stage/$ag_txn"
  /bin/mkdir -p -- "$ag_tstage"
}

# Opens the transaction with the frozen copies recovery runs: install.sh, every
# installer module, account.zsh, uninstall.sh and each harness's bundle files, so
# recovery never reads the new release folder's code. Refuses while a transaction
# is open: mv would put the new one inside it, and recovery would read the old
# journal and backups for the new transaction.
ag_txn_open() {
  local n="$state/txn.new" h f
  local -a extra
  if [[ -e $txn_dir || -L $txn_dir ]]; then
    ag_err "$txn_dir is still open; the next run finishes it before opening another"
    return 1
  fi
  /bin/rm -rf -- "$n"
  for h in $ag_harnesses; do reply=(); ag_hook_opt h $h bundle || return 1; extra+=("${reply[@]}"); done
  /bin/mkdir -p -- "$n/backup" &&
    /bin/cp -p -- "$ag_self" "$n/install.sh" &&
    /bin/cp -Rp -- "$ag_tree/installer" "$n/installer" &&
    /bin/cp -p -- "$ag_tree/engine/account.zsh" "$n/account.zsh" &&
    /bin/cp -p -- "$ag_tree/profiles/opencode/uninstall.sh" "$n/uninstall.sh" || return 1
  for f in $extra; do
    /bin/mkdir -p -- "$n/${f:h}" && /bin/cp -p -- "$ag_tree/$f" "$n/$f" || return 1
  done
  ag_plan_write "$n/plan.json" && : > "$n/journal" || return 1
  /bin/sync
  /bin/mv -- "$n" "$txn_dir"
}

# --- Migration records (state/migration.json): one {from, switched_at, retired}
# record per source moved to Agent Guard. A single record is written as one object,
# the 0.1.x form, which 0.1.x installers also read; two or more are a list.

# ag_mig_records: REPLY = the records as a compact JSON list, [] without the file.
# Fails when the file is not an object or a list of objects with a boolean retired.
ag_mig_records() {
  REPLY='[]'
  [[ -f $migration ]] || return 0
  REPLY=$(/usr/bin/jq -c 'if type == "object" then [.] else . end
    | if type == "array" and all(.[]; type == "object" and (.retired | type) == "boolean") then . else error("invalid") end' "$migration" 2>/dev/null)
}

# ag_mig_get FROM...: REPLY = the first record whose from is one of FROM, or empty.
ag_mig_get() {
  ag_mig_records || return 1
  REPLY=$(/usr/bin/jq -c '[.[] | select(.from | IN($ARGS.positional[]))][0] // empty' --args "$@" <<< "$REPLY")
}

# ag_mig_put RECORD FROM...: RECORD replaces the records whose from is one of FROM,
# or is added; written with one rename.
ag_mig_put() {
  local rec=$1 tmp="$state/.migration-$$.json"
  shift
  ag_mig_records || return 1
  /usr/bin/jq --argjson r "$rec" '[.[] | select(.from | IN($ARGS.positional[]) | not)] + [$r] | if length == 1 then .[0] else . end' \
    --args "$@" <<< "$REPLY" > "$tmp" && replace_file "$migration" "$tmp" || { /bin/rm -f -- "$tmp"; return 1 }
  /bin/rm -f -- "$tmp"
}

# --- Preflight (design section 3.1).

ag_tree_info() {
  [[ -f $ag_tree/VERSION ]] || { ag_err "$ag_tree has no VERSION"; return 1 }
  ag_version=$(<"$ag_tree/VERSION")
  [[ $ag_version == [0-9A-Za-z][0-9A-Za-z.+-]# ]] || { ag_err "invalid VERSION: $ag_version"; return 1 }
  ag_commit=checkout
  [[ -f $ag_tree/COMMIT ]] && ag_commit=$(<"$ag_tree/COMMIT")
  [[ $ag_commit == [0-9A-Za-z]## ]] || { ag_err "invalid COMMIT: $ag_commit"; return 1 }
  ag_tag="v$ag_version"
  [[ $ag_commit == checkout ]] && ag_tag=checkout
  return 0
}

ag_layout() {
  local p
  if [[ -f $engine/launch && ! -L $engine/launch ]] || [[ -d $engine/bin && ! -L $engine/bin ]]; then
    ag_err "an earlier Agent Guard install without release folders is in $engine. Run \"$engine/uninstall.sh\" first; nothing changed."
    return 1
  fi
  ag_rid_old=
  if [[ -L $engine/current ]]; then
    p=$(/usr/bin/readlink -- "$engine/current")
    [[ $p == releases/[0-9A-Za-z.+-]## && -d $engine/$p ]] ||
      { ag_err "$engine/current does not name a release folder ($p); nothing changed"; return 1 }
    ag_rid_old=${p:t}
  elif [[ -e $engine/current ]]; then
    ag_err "$engine/current is not a link; nothing changed"
    return 1
  fi
  ag_detect
}

# Each migration module's state on this Mac, in ag_mig_state: migrate (a
# transaction moves it), retiring (switched, retirement unfinished), done or none.
ag_detect() {
  local m
  ag_mig_state=()
  for m in $ag_migration_modules; do
    ag_hook m $m detect || return 1
    ag_mig_state[$m]=$REPLY
  done
  return 0
}

# The next transaction (design section 6, Sequential migrations): it migrates the
# first registered source still in state migrate, if any, and installs every
# harness found on this Mac, except one that only another pending source hands
# over, which waits for that source's transaction.
ag_txn_plan() {
  local m h own=
  local -a waiting=()
  ag_source=
  for m in $ag_migration_modules; do
    [[ ${ag_mig_state[$m]:-} == migrate ]] || continue
    ag_hook m $m harness
    if [[ -z $ag_source ]]; then ag_source=$m own=$REPLY; elif [[ $REPLY != "$own" ]]; then waiting+=("$REPLY"); fi
  done
  ag_kind=install
  [[ -n $ag_rid_old ]] && ag_kind=update
  [[ -n $ag_source ]] && ag_kind=migrate
  ag_harnesses=()
  for h in $ag_harness_modules; do
    (( ${waiting[(Ie)$h]} )) && continue
    ag_hook h $h detect && ag_harnesses+=("$h")
  done
  return 0
}

# True when an install is due although the latest release is installed: a
# registered source still to migrate or retire, or a harness found on this Mac
# that the stamp does not list. REPLY names them. Returns 0 when pending, 1
# when current, and 2 when migration detection failed (with its diagnostic).
ag_pending() {
  local m h
  local -a stamped what
  ag_stamp_harnesses
  stamped=($reply)
  ag_detect || return 2
  for m in $ag_migration_modules; do
    [[ ${ag_mig_state[$m]:-} == (migrate|retiring) ]] || continue
    REPLY=$m
    ag_hook_opt m $m title
    what+=("the move from $REPLY")
  done
  for h in $ag_harness_modules; do
    (( ${stamped[(Ie)$h]} )) && continue
    ag_hook h $h detect || continue
    REPLY=$h
    ag_hook_opt h $h title
    what+=("$REPLY")
  done
  REPLY=${(j:, :)what}
  (( $#what ))
}

# The harnesses the stamp lists, in reply. A 0.1.x stamp has no list: it installed
# OpenCode alone.
ag_stamp_harnesses() {
  local out
  reply=(opencode)
  [[ -f $stamp ]] && out=$(/usr/bin/jq -r 'if (.harnesses | type) == "array" then .harnesses[] else empty end' "$stamp" 2>/dev/null) &&
    [[ -n $out ]] && reply=(${(f)out})
  return 0
}

# The harnesses agent-guard doctor checks for release RID, in reply: the open
# transaction's while it installs RID (its gate runs before the stamp names
# them), else the stamp's.
ag_doctor_harnesses() {
  local p="$txn_dir/plan.json" out
  if [[ -f $p ]] && out=$(/usr/bin/jq -r --arg r "$1" 'select(.rid_new == $r) | .harnesses[]' "$p" 2>/dev/null) && [[ -n $out ]]; then
    reply=(${(f)out})
    return 0
  fi
  ag_stamp_harnesses
}

# The startup files that get a PATH block: .zprofile and .zshrc, and .bash_profile if present.
ag_rc_files() {
  reply=("$home/.zprofile" "$home/.zshrc")
  [[ -e $home/.bash_profile || -L $home/.bash_profile ]] && reply+=("$home/.bash_profile")
  return 0
}

# A start marker without its end marker, Agent Guard's or an older guard's
# (ag_old_blocks): removing that block would remove the rest of the file.
ag_rc_unfinished() {
  local rc s e
  for rc in "$home"/{.zprofile,.zshrc,.bash_profile}; do
    [[ -f $rc ]] || continue
    for s e in "$marker_start" "$marker_end" $ag_old_blocks; do
      /usr/bin/grep -Fxq -- "$s" "$rc" || continue
      /usr/bin/grep -Fxq -- "$e" "$rc" && continue
      ag_err "$rc has a start marker ($s) without an end marker; fix it by hand. Nothing changed."
      return 1
    done
  done
  return 0
}

# rename(2) is atomic only within one volume. Each target is checked through its
# nearest existing folder, so a fresh account without them passes, and through
# symbolic links to where it really is.
ag_volume() {
  local p h want dev
  local -a paths=("$home/Applications")
  want=$(/usr/bin/stat -L -f %d -- "$engine") || return 1
  for h in $ag_harness_modules; do
    ag_hook h $h detect || continue
    reply=()
    ag_hook_opt h $h volume
    paths+=("${reply[@]}")
  done
  paths+=("$cc")
  for p in $paths; do
    while [[ ! -e $p ]]; do p=${p:h}; done
    dev=$(/usr/bin/stat -L -f %d -- "$p") || return 1
    [[ $dev == "$want" ]] ||
      { ag_err "$p is on another volume than $engine; Agent Guard replaces files by rename and needs one volume. Nothing changed."; return 1 }
  done
  return 0
}

# Each harness's own preparation before the transaction (OpenCode: which configs
# get permission values).
ag_prepare() {
  local h
  for h in $ag_harness_modules; do
    ag_hook h $h detect || continue
    ag_hook_opt h $h prepare || return 1
  done
  return 0
}

# Each migration module's checks, before any change.
ag_checks() {
  local m
  for m in $ag_migration_modules; do ag_hook_opt m $m checks || return 1; done
  return 0
}

ag_projects_check() {
  local s
  if [[ -z $ag_projects && $ag_gui == 0 && $ag_update == 0 && -t 0 ]]; then
    print -n "Drag your projects folder here and press Return (Return alone skips): "
    read -r ag_projects
  fi
  ag_projects=${${ag_projects##[[:space:]]##}%%[[:space:]]##}
  [[ -n $ag_projects ]] || return 0
  [[ -e $ag_projects ]] || ag_projects=${(Q)ag_projects}
  [[ -d $ag_projects ]] || { ag_err "not a folder: $ag_projects"; return 1 }
  ag_projects=${ag_projects:A}
  for s in "$home/Library/Application Support" "$home/.config" "$home/.local"; do
    if [[ $ag_projects == / || $s == "$ag_projects" || $s == "$ag_projects"/* ]]; then
      ag_err "$ag_projects is too broad to allow; choose the folder that holds your projects"
      return 1
    fi
  done
  return 0
}

# The app runs a path that does not change between releases, so it is rebuilt only
# when its inputs (script, bundle ID, icon) differ from the stamp's, or it is missing.
ag_app_script() { REPLY="do shell script quoted form of \"$engine/bin/opencode-gui\" & \" >/dev/null 2>&1 &\"" }

ag_app_decide() {
  local icon="$ag_tree/profiles/opencode/assets/AgentGuard.icns" s old=
  ag_app_script
  s=$( { print -r -- "$REPLY"; print -r -- "$bundle_id"; /usr/bin/shasum -a 256 < "$icon" } | /usr/bin/shasum -a 256 ) ||
    { ag_err "cannot hash $icon"; return 1 }
  ag_app_inputs=${s%% *}
  [[ -f $stamp ]] && old=$(/usr/bin/jq -r '.app_inputs // empty' "$stamp" 2>/dev/null)
  ag_app_rebuild=1
  [[ -d $app && $old == "$ag_app_inputs" ]] && ag_app_rebuild=0
  return 0
}

ag_new_rid() {
  local r
  while :; do
    r="$ag_version-$(/bin/date -u +%Y%m%dT%H%M%SZ)"
    [[ -e $engine/releases/$r || -L $engine/releases/$r ]] || break
    /bin/sleep 1
  done
  REPLY=$r
}

# --- Pre-switch phases (design section 3.2, P4 to P7).

# P4: the release folder, in the runtime layout, then renamed into releases/<rid>.
ag_assemble() {
  local r="$ag_stage/release" t=$ag_tree p="$ag_tree/profiles/opencode" f
  local -a zsh_files=(launch account.zsh install.sh uninstall.sh bin/opencode bin/opencode-gui bin/agent-guard
                      profiles/opencode/harness.zsh profiles/opencode/hooks.zsh)
  /bin/rm -rf -- "$r"
  /bin/mkdir -p -- "$r/bin" "$r/profiles/opencode/check-config/opencode/plugins" "$engine/releases" || return 1
  /bin/cp -- "$t/engine/launch" "$t/engine/profile.sb" "$t/engine/account.zsh" "$p/install.sh" "$p/uninstall.sh" \
    "$t/LICENSE" "$t/VERSION" "$r/" || return 1
  print -r -- "$ag_commit" > "$r/COMMIT" && print -r -- "$ag_rid_new" > "$r/RELEASE" || return 1
  /bin/cp -- "$p/opencode" "$p/opencode-gui" "$t/engine/agent-guard" "$r/bin/" || return 1
  /bin/cp -R -- "$t/engine/vendor" "$r/vendor" || return 1
  /bin/cp -- "$t/engine/peers.zsh" "$t/engine/peer-runtime.sb" "$r/" || return 1
  /bin/cp -R -- "$t/engine/peers" "$r/peers" || return 1
  # The release's install.sh, which agent-guard and uninstall.sh source, loads these.
  /bin/cp -R -- "$t/installer" "$r/installer" || return 1
  /bin/cp -- "$p/harness.zsh" "$p/hooks.zsh" "$p/protected.sb" "$p/skills.zsh" "$p/plugin.js" "$r/profiles/opencode/" || return 1
  /bin/cp -R -- "$p/templates" "$p/assets" "$r/profiles/opencode/" || return 1
  # check staged points OpenCode's config folder here; its only plugin is this
  # release's. OpenCode 1.18.33 loads no config, and so no plugin, when it cannot
  # create .gitignore in the config folder, and the guard denies writes here.
  /bin/ln -s ../../../plugin.js "$r/profiles/opencode/check-config/opencode/plugins/agent-guard.js" || return 1
  print -l node_modules package.json package-lock.json bun.lock .gitignore > "$r/profiles/opencode/check-config/opencode/.gitignore" || return 1
  /bin/chmod 755 "$r/launch" "$r/install.sh" "$r/uninstall.sh" "$r/bin/opencode" "$r/bin/opencode-gui" "$r/bin/agent-guard" || return 1
  for f in $ag_harnesses; do ag_hook_opt h $f assemble "$r" || return 1; done
  /usr/bin/xattr -dr com.apple.quarantine "$r" 2>/dev/null
  [[ $(<"$r/VERSION") == "$ag_version" ]] || { ag_err "VERSION in the release does not match $ag_version"; return 1 }
  for f in "$r"/installer/**/*.zsh(.N); do zsh_files+=("${f#$r/}"); done
  for f in $zsh_files; do
    /bin/zsh -fn "$r/$f" || { ag_err "$f does not parse"; return 1 }
  done
  /bin/mv -- "$r" "$engine/releases/$ag_rid_new"
}

ag_rule_merge() {  # IN OUT TEMPLATE
  /usr/bin/jq --slurpfile t "$3" '.rules = ((.rules // []) + ["agent-guard"] | unique)
    | .transparent_wrappers = ((.transparent_wrappers // []) + $t[0].transparent_wrappers | unique)' "$1" > "$2" 2>/dev/null &&
    /usr/bin/jq -e 'type == "object"' "$2" >/dev/null 2>&1
}

# P5: validates the rulebook and the merged rule.json; builds the app when needed.
ag_build() {
  local rel="$engine/releases/$ag_rid_new" s="$ag_stage/Agent Guard.app" tpl id
  tpl="$rel/profiles/opencode/templates/cc-safety-net/rules"
  /usr/bin/jq -e '.name == "agent-guard"' "$tpl/agent-guard/rulebook.json" >/dev/null 2>&1 ||
    { ag_err "the release's rulebook is not valid"; return 1 }
  ag_rule_merge "$tpl/rule.json" "$ag_stage/rule.template.json" "$tpl/rule.json" ||
    { ag_err "the release's rule.json template is not valid"; return 1 }
  if [[ -e $cc/rule.json ]] && ! ag_rule_merge "$cc/rule.json" "$ag_stage/rule.json" "$tpl/rule.json"; then
    ag_warnings+=("$cc/rule.json not changed (invalid JSON): add agent-guard to its rules and env, exec, nice, nohup, setsid, stdbuf, time and timeout to its transparent_wrappers")
  fi
  (( ag_app_rebuild )) || return 0
  ag_app_script
  /bin/rm -rf -- "$s"
  /usr/bin/osacompile -o "$s" -e "$REPLY" || return 1
  /usr/bin/plutil -replace CFBundleIdentifier -string "$bundle_id" "$s/Contents/Info.plist" || return 1
  /bin/cp -- "$rel/profiles/opencode/assets/AgentGuard.icns" "$s/Contents/Resources/applet.icns" || return 1
  /bin/rm -f -- "$s/Contents/Resources/Assets.car"
  /usr/bin/plutil -remove CFBundleIconName "$s/Contents/Info.plist" >/dev/null 2>&1
  /usr/bin/codesign --force --sign - "$s" 2>/dev/null || { ag_err 'cannot sign the app'; return 1 }
  /usr/bin/codesign --verify --strict "$s" 2>/dev/null || { ag_err 'the built app fails codesign --verify --strict'; return 1 }
  id=$(/usr/bin/plutil -extract CFBundleIdentifier raw "$s/Contents/Info.plist") && [[ $id == "$bundle_id" ]] ||
    { ag_err "the built app's bundle ID is not $bundle_id"; return 1 }
}

# P6: the template list only when none exists; --projects adds an ALLOW entry
# through a temporary file and a rename.
ag_list_step() {
  local listed partial="$list_dir/.Guard List.txt.partial"
  /bin/mkdir -p -- "$list_dir" || return 1
  if [[ ! -e $list ]]; then
    /bin/cp -- "$ag_tree/profiles/opencode/templates/Guard List.txt" "$partial" && /bin/mv -n -- "$partial" "$list" || return 1
    /bin/rm -f -- "$partial"
  fi
  if [[ -n $ag_projects ]]; then
    listed=$(P=$ag_projects O=$list.tmp H=$home /usr/bin/awk '
      { print > ENVIRON["O"]; t = $0; sub(/\r$/, "", t); gsub(/^[[:space:]]+|[[:space:]]+$/, "", t); u = toupper(t)
        if (t ~ /^~(\/|$)/) t = ENVIRON["H"] substr(t, 2); if (t ~ /.\/+$/) sub(/\/+$/, "", t) }
      u ~ /^#/ { next }
      u ~ /^ALLOW([[:space:]]*[-:].*)?$/ { s = "ALLOW"; if (!done) print ENVIRON["P"] > ENVIRON["O"]; done = 1; next }
      u ~ /^READ([[:space:]]+|-)ONLY([[:space:]]*[-:].*)?$/ { s = "READ ONLY"; next }
      u ~ /^DENY([[:space:]]*[-:].*)?$/ { s = "DENY"; next }
      s != "" && t == ENVIRON["P"] { f[s] = 1 }
      END { print f["DENY"] ? "DENY" : f["READ ONLY"] ? "READ ONLY" : f["ALLOW"] ? "ALLOW" : done ? "added" : "" }' "$list") ||
      { /bin/rm -f -- "$list.tmp"; return 1 }
    if [[ $listed == added ]]; then
      /bin/mv -f -- "$list.tmp" "$list" || return 1
    else
      /bin/rm -f -- "$list.tmp"
    fi
    case $listed in
      (ALLOW|added) ag_say "allowed: $ag_projects" ;;
      ('') ag_err "no ALLOW heading in $list; add $ag_projects under ALLOW yourself"; return 1 ;;
      (*) ag_warnings+=("$ag_projects is listed under $listed in the list, so it is not writable; move it under ALLOW") ;;
    esac
  fi
  ag_say "list: $list"
}

# P7: each installed harness's check of the staged release, before anything
# outside the engine and list folders changes (design section 4.1).
ag_selftest_staged() {
  local h
  integer bad=0
  ag_say 'self-test of the staged release:'
  for h in $ag_harnesses; do ag_hook h $h staged || bad=1; done
  (( ! bad ))
}

# --- The engine's switch actions (design section 3.2, S1 to S7), registered in
# actions.zsh. Each is idempotent forward (do_*) and backward (undo_*): a begun
# action is finished or undone from its journal line and backup.

ag_factory_rulebook() {
  /usr/bin/jq -se 'length == 2 and .[0] == .[1]' "$1" "$2" >/dev/null 2>&1
}

do_rulebook() {
  local rb="$cc/agent-guard/rulebook.json" partial="$cc/agent-guard/.rulebook.json.partial" src folder
  src="$engine/releases/$ag_rid_new/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json"
  ag_jlast rulebook
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -f $rb ]]; then
      if /usr/bin/cmp -s -- "$src" "$rb"; then test_point rulebook; return; fi
      if ! ag_factory_rulebook "$src" "$rb" &&
         { [[ -z $ag_rid_old ]] || ! ag_factory_rulebook "$engine/releases/$ag_rid_old/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" "$rb"; }; then
        ag_warn "custom rulebook kept: $rb"
        test_point rulebook
        return
      fi
    fi
    folder=0
    [[ -d $cc/agent-guard ]] && folder=1
    ag_backup rulebook "$rb" && ag_jnl rulebook begun "folder=$folder" || return 1
  fi
  test_point rulebook || return 1
  /bin/mkdir -p -- "$cc/agent-guard" && /bin/cp -- "$src" "$partial" && /bin/mv -f -- "$partial" "$rb" || return 1
  ag_sha "$rb" && ag_jnl rulebook done "$REPLY"
}

undo_rulebook() {
  local rb="$cc/agent-guard/rulebook.json" partial="$cc/agent-guard/.rulebook.json.partial" b="$txn_dir/backup/rulebook/file"
  ag_jlast rulebook
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind rulebook begun
  ag_jval folder
  if [[ -f $b ]]; then
    /bin/mkdir -p -- "$cc/agent-guard" && /bin/cp -p -- "$b" "$partial" && /bin/mv -f -- "$partial" "$rb" || return 1
  elif [[ $REPLY == 0 ]]; then
    /bin/rm -rf -- "$cc/agent-guard" || return 1
  else
    /bin/rm -f -- "$rb" "$partial" || return 1
  fi
  ag_jnl rulebook undone
}

do_rulejson() {
  local rj="$cc/rule.json" new="$ag_tstage/rule.json" st existed=0 added=1 tpl in
  tpl="$engine/releases/$ag_rid_new/profiles/opencode/templates/cc-safety-net/rules/rule.json"
  ag_jlast rulejson
  st=$REPLY
  [[ $st == done ]] && return 0
  in=$rj
  [[ -e $rj ]] || in=$tpl
  if ! ag_rule_merge "$in" "$new" "$tpl"; then
    [[ -z $st ]] || return 1
    test_point rulejson
    return
  fi
  if [[ -z $st ]]; then
    if [[ -e $rj ]] && /usr/bin/cmp -s -- "$rj" "$new"; then test_point rulejson; return; fi
    if [[ -e $rj ]]; then
      existed=1
      /usr/bin/jq -e '(.rules // []) | index("agent-guard") != null' "$rj" >/dev/null 2>&1 && added=0
    fi
    ag_backup rulejson "$rj" && ag_jnl rulejson begun "existed=$existed added=$added" || return 1
  fi
  test_point rulejson || return 1
  /bin/mkdir -p -- "$cc" && replace_file "$rj" "$new" || return 1
  ag_sha "$rj" && ag_jnl rulejson done "$REPLY"
}

undo_rulejson() {
  local rj="$cc/rule.json" b="$txn_dir/backup/rulejson/file" tmp="$ag_tstage/rule.undo.json" st done_hash= existed added
  ag_jlast rulejson
  st=$REPLY
  [[ $st == (begun|done) ]] || return 0
  ag_jfind rulejson begun
  local detail=$REPLY
  ag_jval existed; existed=$REPLY
  REPLY=$detail; ag_jval added; added=$REPLY
  [[ $st == done ]] && ag_jfind rulejson done && done_hash=$REPLY
  ag_sha "$rj"
  if [[ $existed == 1 && -f $b ]] && /usr/bin/cmp -s -- "$rj" "$b"; then
    :
  elif [[ $existed == 0 && ! -e $rj ]]; then
    :
  elif [[ -n $done_hash && $REPLY == "$done_hash" ]]; then
    if [[ $existed == 1 ]]; then replace_file "$rj" "$b" || return 1; else /bin/rm -f -- "$rj" || return 1; fi
  elif [[ $added == 1 && -e $rj ]] && /usr/bin/jq '.rules -= ["agent-guard"]' "$rj" > "$tmp" 2>/dev/null; then
    /usr/bin/cmp -s -- "$rj" "$tmp" || replace_file "$rj" "$tmp" || return 1
  fi
  ag_jnl rulejson undone
}

# S3: two renames, the old app into the transaction folder, then the new app into
# place; between them there is no app (test point app-gap).
do_app() {
  local staged="$ag_tstage/Agent Guard.app" b="$txn_dir/backup/app" old
  if (( ! ag_app_rebuild )); then test_point app; return; fi
  ag_jlast app
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    old=0
    [[ -e $app ]] && old=1
    ag_jnl app begun "old=$old" || return 1
  fi
  test_point app || return 1
  ag_jfind app begun
  ag_jval old
  old=$REPLY
  if [[ $old == 1 && -e $app && ! -e $b && -e $staged ]]; then
    /bin/mkdir -p -- "${b:h}" && /bin/mv -- "$app" "$b" || return 1
  fi
  test_point app-gap || return 1
  if [[ ! -e $app && -e $staged ]]; then
    /bin/mkdir -p -- "${app:h}" && /bin/mv -- "$staged" "$app" || return 1
  fi
  [[ -e $app ]] || return 1
  ag_jnl app done
}

undo_app() {
  local staged="$ag_tstage/Agent Guard.app" b="$txn_dir/backup/app" old
  ag_jlast app
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind app begun
  ag_jval old
  old=$REPLY
  # The app in place is the new one once the staged copy has moved in.
  if [[ -e $app && ! -e $staged ]] && [[ $old != 1 || -e $b ]]; then
    /bin/mkdir -p -- "$ag_tstage" && /bin/mv -- "$app" "$staged" || return 1
  fi
  if [[ -e $b && ! -e $app ]]; then
    /bin/mv -- "$b" "$app" || return 1
  fi
  ag_jnl app undone
}

# S4: current, and bin on a fresh install. The shims and the plugin link go
# through current, so this one rename switches all of them.
do_current() {
  ag_jlast current
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then ag_jnl current begun "old=${ag_rid_old:--}" || return 1; fi
  test_point current || return 1
  replace_link "$engine/current" "releases/$ag_rid_new" || return 1
  if [[ ! -L $engine/bin || $(/usr/bin/readlink -- "$engine/bin") != current/bin ]]; then
    replace_link "$engine/bin" current/bin || return 1
  fi
  ag_jnl current done
}

undo_current() {
  ag_jlast current
  [[ $REPLY == (begun|done) ]] || return 0
  if [[ -n $ag_rid_old ]]; then
    replace_link "$engine/current" "releases/$ag_rid_old" || return 1
  else
    /bin/rm -f -- "$engine/bin" "$engine/current" "$engine/.bin.partial" "$engine/.current.partial" || return 1
  fi
  ag_jnl current undone
}

# S7: one rewrite per startup file at its resolved target. The block text does not
# change between releases, so an update finds it and writes nothing.
ag_rc_line() {
  if [[ $1 == *bash_profile ]]; then
    REPLY='PATH="$HOME/Library/Application Support/AgentGuard/bin:$PATH"'
  else
    REPLY='path=("$HOME/Library/Application Support/AgentGuard/bin" ${path:#"$HOME/Library/Application Support/AgentGuard/bin"})'
  fi
}

# ag_rc_strip FILE [old]: FILE without Agent Guard's complete blocks, and with old,
# also without the older guards' blocks (ag_old_blocks, start and end markers).
ag_rc_strip() {
  local olds=
  [[ ${2:-} == old ]] && olds=${(pj:\n:)ag_old_blocks}
  OLDS=$olds /usr/bin/awk -v s="$marker_start" -v e="$marker_end" '
    BEGIN { n = split(ENVIRON["OLDS"], o, "\n"); for (i = 1; i < n; i += 2) old[o[i]] = o[i + 1] }
    skip == "" && $0 == s { skip = e; next }
    skip == "" && ($0 in old) { skip = old[$0]; next }
    skip != "" && $0 == skip { skip = ""; next }
    skip == "" { print }' "$1"
}

ag_rc_has() {  # FILE LINE: FILE holds the complete block with LINE
  /usr/bin/awk -v s="$marker_start" -v l="$2" -v e="$marker_end" '
    { a[NR] = $0 }
    END { for (i = 1; i + 2 <= NR; i++) if (a[i] == s && a[i + 1] == l && a[i + 2] == e) f = 1; exit !f }' "$1"
}

# True when FILE holds an older guard's start marker.
ag_rc_has_old() {
  local s e
  for s e in $ag_old_blocks; do
    /usr/bin/grep -Fxq -- "$s" "$1" && return 0
  done
  return 1
}

do_rc() {
  local rc name st line new
  integer written=0
  ag_rc_files
  for rc in $reply; do
    name=${rc:t}
    ag_jlast rc "$name"
    st=$REPLY
    [[ $st == (done|undone) ]] && continue
    if [[ -L $rc && ! -e $rc ]]; then
      ag_warnings+=("$rc is a broken symbolic link; no PATH block written")
      continue
    fi
    ag_rc_line "$rc"
    line=$REPLY
    # A migration also removes the older guard's block, in the same rewrite.
    if [[ -e $rc ]] && ag_rc_has "$rc" "$line" && ! ag_rc_has_old "$rc"; then
      if [[ $st == begun ]]; then ag_sha "$rc" && ag_jnl rc done "$name $REPLY" || return 1; fi
      continue
    fi
    new="$ag_tstage/rc$name"
    { if [[ -e $rc ]]; then ag_rc_strip "$rc" old || return 1; fi
      print -r -- "$marker_start"; print -r -- "$line"; print -r -- "$marker_end" } > "$new" || return 1
    if [[ -z $st ]]; then ag_backup "rc$name" "$rc" && ag_jnl rc begun "$name" || return 1; fi
    replace_file "$rc" "$new" || return 1
    ag_sha "$rc" && ag_jnl rc done "$name $REPLY" || return 1
    (( written++ )) || test_point rc || return 1
  done
  (( written )) || test_point rc
}

undo_rc() {
  local rc name st b done_hash tmp s e
  ag_rc_files
  for rc in ${(Oa)reply}; do
    name=${rc:t}
    ag_jlast rc "$name"
    st=$REPLY
    [[ $st == (begun|done) ]] || continue
    b="$txn_dir/backup/rc$name/file" tmp="$ag_tstage/rc$name.undo"
    done_hash=
    if [[ $st == done ]] && ag_jfind rc done "$name"; then done_hash=${${(s: :)REPLY}[2]:-}; fi
    ag_sha "$rc"
    if [[ -f $b ]] && /usr/bin/cmp -s -- "$rc" "$b"; then
      :
    elif [[ ! -f $b && ! -e $rc ]]; then
      :
    elif [[ -n $done_hash && $REPLY == "$done_hash" ]]; then
      if [[ -f $b ]]; then replace_file "$rc" "$b" || return 1; else /bin/rm -f -- "$rc" || return 1; fi
    elif [[ -e $rc ]]; then
      # Changed since the switch: the inverse edit, which puts back an older guard's
      # block from the backup when this run removed it.
      { ag_rc_strip "$rc" || return 1
        for s e in $ag_old_blocks; do
          if [[ -f $b ]] && ! /usr/bin/grep -Fxq -- "$s" "$rc"; then
            /usr/bin/awk -v s="$s" -v e="$e" '$0 == s { on = 1 } on { print } on && $0 == e { on = 0 }' "$b" || return 1
          fi
        done } > "$tmp" && replace_file "$rc" "$tmp" || return 1
    fi
    ag_jnl rc undone "$name"
  done
  return 0
}

# Runs the switch actions this transaction selects from the registry, in order.
ag_switch() {
  ag_say "switching to release $ag_rid_new"
  ag_do_actions switch
}

# ag_bounded SECONDS CMD...: CMD's status, or 124 when it runs longer.
ag_bounded() {
  integer limit=$(( $1 * 10 )) i=0 pid
  shift
  "$@" </dev/null &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    if (( ++i > limit )); then
      /usr/bin/pkill -KILL -P $pid 2>/dev/null
      kill -KILL $pid 2>/dev/null
      wait $pid 2>/dev/null
      return 124
    fi
    /bin/sleep 0.1
  done
  wait $pid
}

# The checks that need the switched install (design section 4.2): the live
# doctor, then each installed harness's checks (OpenCode: a bounded launch through
# bin/opencode whose log names the release), then the migrated source's.
ag_gate() {
  local out h
  integer rc
  ag_say 'checks after the switch:'
  if ! test_point doctor-live; then ag_failed+=('FAIL doctor (stopped at doctor-live)'); return 1; fi
  # AGENT_GUARD_GATE=1: another plugin that fails to load is a warning here
  # (opencode_check), not a reason to roll back.
  out=$(AGENT_GUARD_GATE=1 "$engine/bin/agent-guard" doctor 2>&1)
  rc=$?
  ag_say "$out"
  if (( rc )); then
    ag_failed+=(${(M)${(f)out}:#FAIL*})
    (( $#ag_failed )) || ag_failed+=("FAIL agent-guard doctor exited $rc")
    return 1
  fi
  if ! test_point launch-check; then ag_failed+=('FAIL launch (stopped at launch-check)'); return 1; fi
  for h in $ag_harnesses; do ag_hook h $h gate; done
  [[ -n $ag_source ]] && ag_hook_opt m $ag_source gate
  (( $#ag_failed == 0 )) || { ag_say "${(F)ag_failed}"; return 1 }
}

# K1: the stamp is the commit point, written only after the checks passed. It
# records the harnesses the transaction installed (design section 6, Candidate
# inventory), and hashes the release folder, the rulebook, the app and each
# harness's installed files outside them (files hook).
ag_stamp_write() {
  local out="$ag_tstage/stamp.json" rel="$engine/releases/$ag_rid_new" sums links harnesses h m
  local -a files kv
  test_point stamp || return 1
  files=("$rel"/**/*(.DN) "$cc/agent-guard/rulebook.json"(N) "$app"/**/*(.DN))
  for h in $ag_harnesses; do reply=(); ag_hook_opt h $h files; files+=("${reply[@]}"); done
  sums=$(/usr/bin/shasum -a 256 -- $files) || return 1
  kv=("$engine/current" "$(/usr/bin/readlink -- "$engine/current")" "$engine/bin" "$(/usr/bin/readlink -- "$engine/bin")")
  for h in $ag_harnesses; do reply=(); ag_hook_opt h $h links; kv+=("${reply[@]}"); done
  for m in $ag_migration_modules; do reply=(); ag_hook_opt m $m links; kv+=("${reply[@]}"); done
  links=$(/usr/bin/jq -cn '[$ARGS.positional | _nwise(2) | {key: .[0], value: .[1]}] | from_entries' --args "${kv[@]}") &&
    harnesses=$(/usr/bin/jq -cn '$ARGS.positional' --args "${ag_harnesses[@]}") || return 1
  print -r -- "$sums" | /usr/bin/jq -Rn --arg version "$ag_version" --arg tag "$ag_tag" --arg commit "$ag_commit" \
    --arg release "$ag_rid_new" --argjson at "$EPOCHSECONDS" --arg app_inputs "$ag_app_inputs" --argjson links "$links" \
    --argjson harnesses "$harnesses" \
    '{version: $version, tag: $tag, commit: $commit, release: $release, installed_at: $at, app_inputs: $app_inputs,
      harnesses: $harnesses, files: ([inputs | select(length > 66) | {key: .[66:], value: .[0:64]}] | from_entries), links: $links}' > "$out" || return 1
  replace_file "$stamp" "$out" || return 1
  /bin/sync
}

# K2: removes release folders other than the new one, the one it replaced and
# any in the plan's keep (the release current named before an earlier
# transaction of the same command), which keep serving OpenCode sessions started
# from them, then the transaction. The tree of the running install stays for the
# command's next transaction; ag_install_main removes it at the end.
ag_cleanup() {
  local r
  ag_jlast cleanup
  if [[ -z $REPLY ]]; then ag_jnl cleanup begun || return 1; fi
  test_point cleanup || return 1
  for r in "$engine"/releases/*(N/); do
    [[ ${r:t} == "$ag_rid_new" || ${r:t} == "$ag_rid_old" ]] || (( ${ag_keep[(Ie)${r:t}]} )) || /bin/rm -rf -- "$r" || return 1
  done
  if [[ ${ag_tree:-} == "$ag_tstage/tree/"* ]]; then
    /bin/rm -rf -- "$ag_tstage"/^tree(DN) "$txn_dir/backup" || return 1
  else
    /bin/rm -rf -- "$ag_tstage" "$txn_dir/backup" || return 1
    /bin/rmdir -- "$engine/stage" 2>/dev/null
  fi
  ag_drop_txn
}

# After the stamp and before the cleanup deletes txn/backup: each installed
# harness's keep, then the migrated source's, move what must outlive the
# transaction into state/ (design section 6, Frozen recovery bundle). A failure
# leaves the transaction open; the next run's recovery repeats it.
ag_keep() {
  local h
  for h in $ag_harnesses; do ag_hook_opt h $h keep || return 1; done
  [[ -z $ag_source ]] || ag_hook_opt m $ag_source keep || return 1
}

# Before the switch: undoes the staged actions (the imported records this
# transaction created), removes the new release, its stage and the transaction.
ag_discard() {
  local cur=
  test_point discard
  ag_undo_actions staged || return 1
  [[ -L $engine/current ]] && cur=$(/usr/bin/readlink -- "$engine/current")
  if [[ -n $ag_rid_new && $cur != "releases/$ag_rid_new" ]]; then /bin/rm -rf -- "$engine/releases/$ag_rid_new" || return 1; fi
  /bin/rm -rf -- "$ag_tstage" || return 1
  /bin/rmdir -- "$engine/stage" "$engine/releases" 2>/dev/null
  ag_drop_txn
}

# Closes the transaction with one rename, so a deletion cut short never leaves a
# transaction without its plan or its copy of the installer. recover removes a
# leftover.
ag_drop_txn() {
  local gone="$state/.txn-done-$$"
  /bin/rm -rf -- "$gone"
  /bin/mv -- "$txn_dir" "$gone" && /bin/rm -rf -- "$gone"
}

# ag_rollback [recover]: undoes every switch action the transaction selects, in
# reverse registry order (design section 4.3). On a fresh install the engine
# folder goes too, except during recovery, whose caller still runs inside it.
ag_rollback() {
  integer bad=0
  ag_jlast rollback
  if [[ -z $REPLY ]]; then ag_jnl rollback begun || return 1; fi
  test_point rollback
  ag_undo_actions switch || bad=1
  if (( bad )); then
    ag_err "the rollback is unfinished; $txn_dir is kept and the next run continues it"
    return 1
  fi
  ag_jnl rollback done
  ag_discard || return 1
  (( $#ag_unrestored )) && ag_warn "permission values not restored: ${(j:, :)ag_unrestored}"
  if [[ -z $ag_rid_old && ${1:-} != recover ]]; then
    /bin/rm -f -- "$stamp"
    if ! ag_save_record; then
      ag_err "could not save $record; $engine is kept"
      ag_unlock
      return 0
    fi
    ag_remove_engine || ag_unlock
  fi
  return 0
}

# True when the permission record still holds entries: values not restored.
ag_record_left() {
  [[ -s $record ]] && ! /usr/bin/jq -e '. == {}' "$record" >/dev/null 2>&1
}

# Before the engine goes: a record that still holds entries is copied to
# ~/Agent Guard/permissions-backup.json. Fails only when that copy fails.
ag_save_record() {
  local backup="$list_dir/permissions-backup.json" partial="$list_dir/.permissions-backup.json.partial"
  ag_record_left || return 0
  if /bin/mkdir -p -- "$list_dir" && /bin/cp -- "$record" "$partial" && /bin/mv -f -- "$partial" "$backup"; then
    ag_warn "the permission record is saved to $backup"
    return 0
  fi
  /bin/rm -f -- "$partial"
  return 1
}

# Run at the end of every successful install or update and by agent-guard update
# (design section 8.7): each migration module's maintenance.
ag_maintenance() {
  local m
  for m in $ag_migration_modules; do ag_hook_opt m $m maintenance; done
  return 0
}

# --- Entries.

# Undoes what this run changed, for the phase it reached, and exits 1.
ag_abort() {
  (( $# )) && ag_err "$*"
  case ${ag_phase:-prep} in
    (prep)
      [[ -n ${ag_stage:-} ]] && /bin/rm -rf -- "$ag_stage"
      ag_release_engine ;;
    (staged)
      ag_discard
      ag_release_engine ;;
    (switch)
      if ag_rollback; then
        [[ -n $ag_rid_old ]] && ag_say "rolled back; release $ag_rid_old is active again"
      fi
      ag_unlock ;;
    (*) ag_unlock ;;
  esac
  (( $#ag_failed )) && print -ru2 -- "failed checks:"$'\n'"${(F)ag_failed}"
  exit 1
}

# zsh install.sh: stages the checkout like the bootstrap stages an archive.
ag_checkout_main() {
  local root version txn dest f
  ag_init || exit 1
  ag_phase=prep ag_stage=
  root=${ag_self:h:h:h}
  ag_tools || exit 1
  ag_probe || exit 1
  ag_lock || exit 1
  if [[ ! -e $txn_dir && ! -e $state/txn.new ]]; then /bin/rm -rf -- "$engine/stage"/*(DN); fi
  version=dev
  [[ -f $root/VERSION ]] && version=$(<"$root/VERSION")
  [[ $version == [0-9A-Za-z][0-9A-Za-z.+-]# ]] || ag_abort "invalid VERSION: $version"
  txn=$(/bin/date -u +%Y%m%dT%H%M%SZ)-$$
  ag_stage="$engine/stage/$txn"
  dest="$ag_stage/tree/agent-guard-$version"
  /bin/mkdir -p -m 700 -- "$ag_stage/tree" && /bin/mkdir -- "$dest" || ag_abort "cannot create $dest"
  for f in engine profiles installer LICENSE install.sh VERSION COMMIT; do
    [[ -e $root/$f ]] || continue
    /bin/cp -R -- "$root/$f" "$dest/" || ag_abort "cannot copy $root/$f"
  done
  [[ -f $dest/VERSION ]] || print -r -- "$version" > "$dest/VERSION"
  [[ -f $dest/COMMIT ]] || print -r -- checkout > "$dest/COMMIT"
  /usr/bin/xattr -dr com.apple.quarantine "$ag_stage/tree" 2>/dev/null
  exec /bin/zsh -f "$dest/profiles/opencode/install.sh" --stage "$txn" "$@"
}

# One transaction: the release staged, tested, switched, checked, stamped and
# cleaned up; a migration's source is retired after its stamp. Exits on failure.
ag_txn_run() {
  local m
  ag_phase=prep
  ag_app_decide || ag_abort
  ag_new_rid
  ag_rid_new=$REPLY

  ag_txn_open || ag_abort "cannot open a transaction in $txn_dir"
  ag_phase=staged
  test_point txn-open || ag_abort 'stopped at txn-open'
  ag_say "engine: $engine (release $ag_rid_new)"
  [[ -n $ag_source ]] && ag_hook_opt m $ag_source begin
  ag_assemble || ag_abort "cannot assemble release $ag_rid_new"
  test_point assemble || ag_abort 'stopped at assemble'
  ag_build || ag_abort 'cannot build the release files'
  test_point build || ag_abort 'stopped at build'
  for m in $ag_migration_modules; do ag_hook_opt m $m list_import || ag_abort; done
  test_point list-import || ag_abort 'stopped at list-import'
  ag_list_step || ag_abort
  test_point list || ag_abort 'stopped at list'
  ag_do_actions staged || ag_abort
  test_point import || ag_abort 'stopped at import'
  ag_selftest_staged || ag_abort 'the staged release failed its self-test; the installed version is unchanged'
  test_point selftest-staged || ag_abort 'stopped at selftest-staged'
  # The list prompt can take minutes: the harness may have been started meanwhile.
  [[ -n $ag_source ]] && { ag_hook_opt m $ag_source before_switch || ag_abort }

  ag_phase=switch
  ag_switch || ag_abort 'the switch failed'
  ag_gate || ag_abort 'the checks after the switch failed'
  ag_stamp_write || ag_abort "cannot write $stamp"
  ag_phase=committed
  if ! ag_keep; then
    ag_err "cannot keep what the transaction replaced; $txn_dir is kept and the next run finishes it"
    ag_unlock
    exit 1
  fi
  if [[ -n $ag_source ]] && ! ag_hook m $ag_source retire; then
    ag_unlock
    exit 1
  fi
  ag_cleanup || ag_warn 'cleanup is unfinished; the next run finishes it'
  for m in $ag_migration_modules; do ag_hook_opt m $m after_install; done
  return 0
}

# install.sh --stage TXN: the staged install (design sections 3 and 4). One
# transaction migrates one source; with several sources on this Mac they follow
# each other in registry order (actions.zsh), each a whole transaction, and
# otherwise one transaction installs or updates.
ag_install_main() {
  local w m
  ag_txn=$1
  shift
  ag_gui=0 ag_projects= ag_update=0
  while (( $# )); do
    case $1 in
      (--gui) ag_gui=1 ;;
      (--update) ag_update=1 ;;
      (--projects) (( $# >= 2 )) || { ag_err 'usage: install.sh [--projects DIR] [--gui]'; exit 2 }; ag_projects=$2; shift ;;
      (*) ag_err "unknown option: $1"; exit 2 ;;
    esac
    shift
  done
  ag_init || exit 1
  ag_phase=prep ag_stage=
  [[ $ag_txn == [0-9A-Za-z.-]## ]] || { ag_err "invalid stage name: $ag_txn"; exit 2 }
  ag_stage="$engine/stage/$ag_txn"
  ag_tstage=$ag_stage
  ag_tree=${ag_self:h:h:h}
  [[ ${ag_tree:h} == "$ag_stage/tree" ]] || { ag_err "the installer runs only from $ag_stage/tree"; exit 1 }
  ag_tools || exit 1
  ag_probe || exit 1
  ag_lock || exit 1

  ag_recover install "$ag_txn" || ag_abort
  ag_tree_info || ag_abort
  ag_layout || ag_abort
  ag_rc_unfinished || ag_abort
  ag_volume || ag_abort
  ag_prepare || ag_abort
  ag_checks || ag_abort
  ag_projects_check || ag_abort
  # A migration whose retirement stopped: finish it, then install as an update.
  for m in $ag_migration_modules; do
    if [[ ${ag_mig_state[$m]:-} == retiring ]]; then ag_hook m $m retire || ag_abort; fi
  done

  ag_txn_plan
  while :; do
    ag_txn_run
    [[ -n $ag_source ]] || break
    ag_migrated+=("$ag_source")
    # A later source's transaction also keeps the release current named before the command.
    (( $#ag_migrated > 1 )) || ag_keep=(${ag_rid_old:+$ag_rid_old})
    ag_rid_old=$ag_rid_new
    ag_detect || ag_abort
    # A failed cleanup leaves the committed transaction open. The next run finishes
    # it, then migrates the sources still pending; none starts in this run.
    if [[ -e $txn_dir ]]; then
      for m in $ag_migration_modules; do
        [[ ${ag_mig_state[$m]:-} == migrate ]] || continue
        REPLY=$m
        ag_hook_opt m $m title
        ag_warnings+=("the move from $REPLY has not started; the next run finishes the cleanup, then continues with it")
      done
      break
    fi
    ag_txn_plan
    [[ -n $ag_source ]] || break
  done
  if [[ ! -e $txn_dir ]]; then
    /bin/rm -rf -- "$ag_stage"
    /bin/rmdir -- "$engine/stage" 2>/dev/null
  fi
  ag_maintenance
  ag_unlock

  ag_say "Agent Guard $ag_version is installed (release $ag_rid_new)."
  for w in $ag_harnesses; do ag_hook_opt h $w report; done
  for m in $ag_migrated; do ag_hook_opt m $m report; done
  for w in $ag_warnings; do ag_say "warning: $w"; done
  if [[ $ag_gui == 1 || -t 1 ]]; then
    local msg answer
    msg=$'Agent Guard is installed.\n\nOpen OpenCode with Agent Guard, or type opencode in a new terminal window.'
    (( $#ag_warnings )) && msg+=$'\n\n'"${(pj:\n:)ag_warnings}"
    answer=$(/usr/bin/osascript -e 'on run argv' -e 'button returned of (display dialog (item 1 of argv) & return & return & "Edit the allow and deny list now?" buttons {"Later", "Edit List"} default button "Edit List" with title "Agent Guard")' -e 'end run' "$msg" 2>/dev/null)
    [[ $answer == "Edit List" ]] && /usr/bin/open -e "$list"
  fi
  ag_say done
}

# install.sh --recover CALLER, as state/txn/install.sh (design section 2.3). It
# reads only the transaction's own copies (ag_txn_open), never the new release's
# code. Exit 0 when the transaction is closed: committed, discarded or rolled back.
ag_recover_main() {
  local caller=${1:-} rel=
  [[ $caller == (install|update|uninstall) ]] || { ag_err 'usage: install.sh --recover install|update|uninstall'; exit 2 }
  ag_init || exit 1
  [[ ${ag_self:h} == "$txn_dir" ]] || { ag_err "--recover runs only as $txn_dir/install.sh"; exit 1 }
  ag_lock parent || exit 1
  ag_txn_load || exit 1
  # Harness data the checks below read (the process names) comes from the copies.
  ag_tree=$txn_dir
  [[ -f $stamp ]] && rel=$(/usr/bin/jq -r '.release // empty' "$stamp" 2>/dev/null)
  if [[ $rel == "$ag_rid_new" ]]; then
    ag_say "finishing the cleanup after release $ag_rid_new"
    ag_keep || exit 1
    # Uninstall goes on without it and repeats retirement itself (U6).
    if [[ -n $ag_source ]] && ! ag_hook m $ag_source retire && [[ $caller != uninstall ]]; then exit 1; fi
    ag_cleanup
    exit
  fi
  if ! ag_switch_begun; then
    ag_say "discarding the unfinished install of release $ag_rid_new"
    ag_discard
    exit
  fi
  # A harness started since the interrupted run may hold either guard's profile;
  # finishing or undoing the switch would give it the other guard's plugin.
  if [[ -n $ag_source ]]; then ag_hook_opt m $ag_source recover_check || exit 1; fi
  ag_jlast rollback
  if [[ -n $REPLY || $caller == uninstall ]]; then
    ag_say "rolling back the unfinished switch to release $ag_rid_new"
    ag_rollback recover
    exit
  fi
  # The switch cannot be finished without the new release; undoing it needs only
  # the journal, the backups and these copies.
  if [[ ! -f $engine/releases/$ag_rid_new/RELEASE ]]; then
    ag_say "release $ag_rid_new is missing; rolling back the unfinished switch to it"
    ag_rollback recover
    exit
  fi
  ag_say "resuming the unfinished switch to release $ag_rid_new"
  if ag_switch && ag_gate && ag_stamp_write; then
    ag_say "Agent Guard $ag_version is installed (release $ag_rid_new)."
    ag_keep || exit 1
    if [[ -n $ag_source ]]; then ag_hook m $ag_source retire || exit 1; fi
    ag_cleanup || ag_warn 'cleanup is unfinished; the next run finishes it'
    exit 0
  fi
  (( $#ag_failed )) && print -ru2 -- "failed checks:"$'\n'"${(F)ag_failed}"
  ag_say "rolling back the switch to release $ag_rid_new"
  ag_rollback recover
}

#!/bin/zsh
# Agent Guard installer for OpenCode (docs/DESIGN.md section 6).
#   zsh install.sh [--projects DIR] [--gui]
#       From a checkout or an unpacked archive: copies the tree into the engine
#       folder's stage/<txn>/tree, then runs that copy with --stage.
#   install.sh --stage TXN [--projects DIR] [--gui] [--update]
#       The bootstrap's form: installs the tree in stage/TXN/tree, under the
#       bootstrap's lock.
#   install.sh --recover install|update|uninstall
#       Run by recovery as state/txn/install.sh, under its caller's lock: discards,
#       resumes, rolls back or cleans up the open transaction, then exits.
#   source install.sh --lib
#       Defines the functions only; uninstall.sh and agent-guard use them.
# Nothing runs until the last line.

test_point() { : }

ag_say() { print -r -- "$*" }
ag_warn() { print -ru2 -- "warning: $*" }
ag_err() { print -ru2 -- "Agent Guard: $*" }

# Paths every entry uses. Home comes only from account_home, in account.zsh next
# to this file (a release folder or state/txn) or in the tree's engine/.
ag_init() {
  local self=${${(%):-%x}:A} account
  ag_self=$self
  account="${self:h}/account.zsh"
  [[ -f $account ]] || account="${self:h:h:h}/engine/account.zsh"
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
  ocg="$home/Library/Application Support/OpenCodeGuard"
  list_dir="$home/Agent Guard"
  list="$list_dir/Guard List.txt"
  conf="$home/.config/opencode"
  plugins="$conf/plugins"
  plugin="$plugins/agent-guard.js"
  plugin_target="$engine/current/profiles/opencode/plugin.js"
  app="$home/Applications/Agent Guard.app"
  cc="$home/.cc-safety-net/rules"
  marker_start='# >>> agent-guard >>>'
  marker_end='# <<< agent-guard <<<'
  bundle_id=io.github.ebrindley.agentguard
  ag_locked=0 ag_perm_failed=0
  typeset -ga ag_warnings ag_failed ag_configs ag_unrestored
  ag_warnings=() ag_failed=() ag_unrestored=()
}

ag_tools() {
  local t
  [[ $(/usr/bin/uname -s) == Darwin ]] || { ag_err 'macOS only'; return 1 }
  for t in /usr/bin/{sandbox-exec,jq,osacompile,codesign,curl,shasum,tar,plutil,xattr,dscl,stat,awk,cmp,readlink} /bin/{ps,sync}; do
    [[ -x $t ]] || { ag_err "missing $t (macOS 15 or later required)"; return 1 }
  done
}

# Inside a guard or another sandbox the state folder is not writable and the
# write fails with EPERM. Refuse then, before anything changes.
ag_probe() {
  local err= eperm= fd=
  syserror -e eperm EPERM
  [[ -L $state ]] && { ag_err "$state is a symbolic link; not changed"; return 1 }
  /bin/rm -f -- "$state/.probe-$$" 2>/dev/null
  if ! err=$(/bin/mkdir -p -- "$state" 2>&1) ||
     ! err=$( { sysopen -w -o creat,excl -u fd "$state/.probe-$$" } 2>&1 ); then
    [[ ${(L)err} == *": ${(L)eperm}" ]] && { ag_err 'run this from Terminal, outside any guard or sandbox'; return 1 }
    ag_err "cannot write $state: ${err##*: }"
    return 1
  fi
  /bin/rm -f -- "$state/.probe-$$"
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

# --- Journal (design section 2.2). Lines are "<action> <begun|done|undone>
# [detail]"; for actions repeated per file the detail starts with the file's key.
# A line of another form, such as a torn last line, is ignored.

ag_jnl() {
  print -r -- "$*" >> "$txn_dir/journal" || return 1
  [[ ${2:-} == begun ]] && /bin/sync
  return 0
}

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

ag_switch_begun() {
  local l
  [[ -r $txn_dir/journal ]] || return 1
  for l in "${(@f)$(<"$txn_dir/journal")}"; do
    [[ $l == (rulebook|rulejson|app|current|plugin|permissions|rc)' '(begun|done|undone)(|' '*) ]] && return 0
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

# --- Plan (state/txn/plan.json) and transaction state.

ag_plan_write() {
  /usr/bin/jq -n --arg txn "$ag_txn" --arg kind "$ag_kind" --arg rid_new "$ag_rid_new" --arg rid_old "$ag_rid_old" \
    --argjson started "$EPOCHSECONDS" --argjson app "$ag_app_rebuild" --arg app_inputs "$ag_app_inputs" \
    --arg version "$ag_version" --arg tag "$ag_tag" --arg commit "$ag_commit" \
    '{txn: $txn, kind: $kind, rid_new: $rid_new, rid_old: (if $rid_old == "" then null else $rid_old end),
      started_at: $started, app: ($app == 1), app_inputs: $app_inputs,
      version: $version, tag: $tag, commit: $commit, configs: $ARGS.positional}' --args "${ag_configs[@]}" > "$1"
}

ag_txn_load() {
  local p="$txn_dir/plan.json" out
  local -a v
  out=$(/usr/bin/jq -r '.txn, .kind, .rid_new, (.rid_old // ""), (if .app then "1" else "0" end), .app_inputs, .version, .tag, .commit' "$p" 2>/dev/null) ||
    { ag_err "cannot read $p"; return 1 }
  v=("${(@f)out}")
  (( $#v == 9 )) || { ag_err "cannot read $p"; return 1 }
  ag_txn=$v[1] ag_kind=$v[2] ag_rid_new=$v[3] ag_rid_old=$v[4] ag_app_rebuild=$v[5] ag_app_inputs=$v[6]
  ag_version=$v[7] ag_tag=$v[8] ag_commit=$v[9]
  [[ $ag_txn == [0-9A-Za-z.-]## && $ag_rid_new == [0-9A-Za-z.+-]## && $ag_rid_old == [0-9A-Za-z.+-]# ]] ||
    { ag_err "unexpected values in $p"; return 1 }
  ag_configs=(${(f)"$(/usr/bin/jq -r '.configs[]' "$p")"})
  ag_tstage="$engine/stage/$ag_txn"
  /bin/mkdir -p -- "$ag_tstage"
}

ag_txn_open() {
  local n="$state/txn.new"
  /bin/rm -rf -- "$n"
  /bin/mkdir -p -- "$n/backup" &&
    /bin/cp -p -- "$ag_self" "$n/install.sh" &&
    /bin/cp -p -- "$ag_tree/engine/account.zsh" "$n/account.zsh" &&
    /bin/cp -p -- "$ag_tree/profiles/opencode/uninstall.sh" "$n/uninstall.sh" &&
    ag_plan_write "$n/plan.json" && : > "$n/journal" || return 1
  /bin/sync
  /bin/mv -- "$n" "$txn_dir"
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
  for p in "$ocg" "$plugins/opencode-guard.js"; do
    if [[ -e $p || -L $p ]]; then
      ag_err "OpenCode Guard is installed ($p). Migration from OpenCode Guard arrives in a later release; nothing changed."
      return 1
    fi
  done
  if [[ -f $engine/launch && ! -L $engine/launch ]] || [[ -d $engine/bin && ! -L $engine/bin ]]; then
    ag_err "an earlier Agent Guard install without release folders is in $engine. Run \"$engine/uninstall.sh\" first; nothing changed."
    return 1
  fi
  ag_rid_old= ag_kind=install
  if [[ -L $engine/current ]]; then
    p=$(/usr/bin/readlink -- "$engine/current")
    [[ $p == releases/[0-9A-Za-z.+-]## && -d $engine/$p ]] ||
      { ag_err "$engine/current does not name a release folder ($p); nothing changed"; return 1 }
    ag_rid_old=${p:t} ag_kind=update
  elif [[ -e $engine/current ]]; then
    ag_err "$engine/current is not a link; nothing changed"
    return 1
  fi
  return 0
}

# The startup files that get a PATH block: .zprofile and .zshrc, and .bash_profile if present.
ag_rc_files() {
  reply=("$home/.zprofile" "$home/.zshrc")
  [[ -e $home/.bash_profile || -L $home/.bash_profile ]] && reply+=("$home/.bash_profile")
  return 0
}

ag_rc_unfinished() {
  local rc
  for rc in "$home"/{.zprofile,.zshrc,.bash_profile}; do
    [[ -f $rc ]] && /usr/bin/grep -Fxq -- "$marker_start" "$rc" || continue
    /usr/bin/grep -Fxq -- "$marker_end" "$rc" && continue
    ag_err "$rc has an agent-guard start marker without an end marker; fix it by hand. Nothing changed."
    return 1
  done
  return 0
}

# rename(2) is atomic only within one volume. Each target is checked through its
# nearest existing folder, so a fresh account without them passes, and through
# symbolic links to where it really is.
ag_volume() {
  local p want dev
  want=$(/usr/bin/stat -L -f %d -- "$engine") || return 1
  for p in "$home/Applications" "${plugins:A}" "$cc"; do
    while [[ ! -e $p ]]; do p=${p:h}; done
    dev=$(/usr/bin/stat -L -f %d -- "$p") || return 1
    [[ $dev == "$want" ]] ||
      { ag_err "$p is on another volume than $engine; Agent Guard replaces files by rename and needs one volume. Nothing changed."; return 1 }
  done
  return 0
}

ag_classify_configs() {
  local f
  ag_configs=()
  for f in "$conf/config.json" "$conf/opencode.json" "$conf/opencode.jsonc"; do
    [[ -e $f ]] || continue
    if ! /usr/bin/jq -e 'type == "object"' "$f" >/dev/null 2>&1; then
      ag_warnings+=("${f:t} not changed (comments or invalid JSON): set permission edit, bash and external_directory to allow yourself")
    elif /usr/bin/jq -e '.permission | type == "string"' "$f" >/dev/null; then
      ag_warnings+=("${f:t} not changed (permission is a single value)")
    else
      ag_configs+=("$f")
    fi
  done
  [[ -e $conf/config.json || -e $conf/opencode.json || -e $conf/opencode.jsonc ]] || ag_configs=("$conf/opencode.json")
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
  /bin/cp -- "$p/harness.zsh" "$p/hooks.zsh" "$p/protected.sb" "$p/plugin.js" "$r/profiles/opencode/" || return 1
  /bin/cp -R -- "$p/templates" "$p/assets" "$r/profiles/opencode/" || return 1
  # check staged points OpenCode's config folder here; its only plugin is this
  # release's. OpenCode 1.18.33 loads no config, and so no plugin, when it cannot
  # create .gitignore in the config folder, and the guard denies writes here.
  /bin/ln -s ../../../plugin.js "$r/profiles/opencode/check-config/opencode/plugins/agent-guard.js" || return 1
  print -l node_modules package.json package-lock.json bun.lock .gitignore > "$r/profiles/opencode/check-config/opencode/.gitignore" || return 1
  /bin/chmod 755 "$r/launch" "$r/install.sh" "$r/uninstall.sh" "$r/bin/opencode" "$r/bin/opencode-gui" "$r/bin/agent-guard" || return 1
  /usr/bin/xattr -dr com.apple.quarantine "$r" 2>/dev/null
  [[ $(<"$r/VERSION") == "$ag_version" ]] || { ag_err "VERSION in the release does not match $ag_version"; return 1 }
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

# P7: the staged release's own check, before anything outside the engine and list
# folders changes (design section 4.1).
ag_selftest_staged() {
  local out rc
  ag_say 'self-test of the staged release:'
  out=$("$engine/releases/$ag_rid_new/launch" check staged 2>&1)
  rc=$?
  ag_say "$out"
  (( rc == 0 )) && return 0
  ag_failed+=(${(M)${(f)out}:#FAIL*})
  (( $#ag_failed )) || ag_failed+=("FAIL check staged exited $rc")
  return 1
}

# --- Switch actions (design section 3.2, S1 to S7). Each is idempotent forward
# (do_*) and backward (undo_*): a begun action is finished or undone from its
# journal line and backup.

do_rulebook() {
  local rb="$cc/agent-guard/rulebook.json" partial="$cc/agent-guard/.rulebook.json.partial" src folder
  src="$engine/releases/$ag_rid_new/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json"
  ag_jlast rulebook
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -f $rb ]] && /usr/bin/cmp -s -- "$src" "$rb"; then test_point rulebook; return; fi
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

# S5: the plugin link, through the temporary name .agent-guard.js.partial, which
# OpenCode does not load. An update finds the link in place and writes nothing.
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
  /usr/bin/jq '.permission = ((.permission // {}) as $p | reduce ("edit", "bash", "external_directory") as $k ($p;
      .[$k] = (if (.[$k] | type) == "object" then {"*": "allow"} + (.[$k] | del(.["*"])) else "allow" end)))' "$1" > "$2"
}

ag_perm_entry() {  # CUR NEW: REPLY = the record entry
  REPLY=$(/usr/bin/jq -cn --slurpfile c "$1" --slurpfile n "$2" '($c[0].permission // {}) as $p
    | reduce ("edit", "bash", "external_directory") as $k ({};
        .[$k] = {orig: (if $p | has($k) then $p[$k] else null end), wrote: $n[0].permission[$k]})')
}

ag_perm_is() {  # CUR ENTRY orig|wrote: each of the three keys equals that side of ENTRY
  /usr/bin/jq -e --argjson e "$2" --arg w "$3" '(.permission // {}) as $c
    | all(("edit", "bash", "external_directory"); $c[.] == $e[.][$w])' "$1" >/dev/null 2>&1
}

ag_perm_report() {  # FILE CUR ENTRY: names each key changed after install
  local k
  for k in edit bash external_directory; do
    if /usr/bin/jq -e --argjson e "$3" --arg k "$k" '($e[$k] // {} | has("wrote")) and ((.permission // {})[$k] != $e[$k].wrote)' "$2" >/dev/null 2>&1; then
      ag_warnings+=("left unchanged: $1 $k was changed after install")
    fi
  done
}

# ag_perm_restore FILE ENTRY TMP: puts back each orig value where FILE still holds
# the wrote value (null deletes the key). FILE is rewritten only when that
# changes its content, so a file the user changed back is not reformatted.
ag_perm_restore() {
  /usr/bin/jq --argjson e "$2" 'reduce ($e | to_entries[]) as $x (.;
      if .permission[$x.key] == $x.value.wrote then
        (if $x.value.orig == null then del(.permission[$x.key]) else .permission[$x.key] = $x.value.orig end)
      else . end)' "$1" > "$3" 2>/dev/null || return 1
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

do_permissions() {
  local f n st cur new entry created
  integer i
  for (( i = 1; i <= $#ag_configs; i++ )); do
    f=$ag_configs[i] n=$i
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

# S7: one rewrite per startup file at its resolved target. The block text does not
# change between releases, so an update finds it and writes nothing.
ag_rc_line() {
  if [[ $1 == *bash_profile ]]; then
    REPLY='PATH="$HOME/Library/Application Support/AgentGuard/bin:$PATH"'
  else
    REPLY='path=("$HOME/Library/Application Support/AgentGuard/bin" ${path:#"$HOME/Library/Application Support/AgentGuard/bin"})'
  fi
}

ag_rc_strip() {  # FILE: FILE without Agent Guard's complete blocks
  /usr/bin/awk -v s="$marker_start" -v e="$marker_end" '
    $0 == s { skip = 1; next }
    skip && $0 == e { skip = 0; next }
    !skip { print }' "$1"
}

ag_rc_has() {  # FILE LINE: FILE holds the complete block with LINE
  /usr/bin/awk -v s="$marker_start" -v l="$2" -v e="$marker_end" '
    { a[NR] = $0 }
    END { for (i = 1; i + 2 <= NR; i++) if (a[i] == s && a[i + 1] == l && a[i + 2] == e) f = 1; exit !f }' "$1"
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
    if [[ -e $rc ]] && ag_rc_has "$rc" "$line"; then
      if [[ $st == begun ]]; then ag_sha "$rc" && ag_jnl rc done "$name $REPLY" || return 1; fi
      continue
    fi
    new="$ag_tstage/rc$name"
    { if [[ -e $rc ]]; then ag_rc_strip "$rc" || return 1; fi
      print -r -- "$marker_start"; print -r -- "$line"; print -r -- "$marker_end" } > "$new" || return 1
    if [[ -z $st ]]; then ag_backup "rc$name" "$rc" && ag_jnl rc begun "$name" || return 1; fi
    replace_file "$rc" "$new" || return 1
    ag_sha "$rc" && ag_jnl rc done "$name $REPLY" || return 1
    (( written++ )) || test_point rc || return 1
  done
  (( written )) || test_point rc
}

undo_rc() {
  local rc name st b done_hash tmp
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
      ag_rc_strip "$rc" > "$tmp" && replace_file "$rc" "$tmp" || return 1
    fi
    ag_jnl rc undone "$name"
  done
  return 0
}

ag_switch() {
  ag_say "switching to release $ag_rid_new"
  do_rulebook && do_rulejson && do_app && do_current && do_plugin && do_permissions && do_rc
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
# doctor, then a bounded launch through bin/opencode whose log names the release.
ag_gate() {
  local out log="$list_dir/last-launch-opencode.log" first=
  integer rc
  ag_say 'checks after the switch:'
  if ! test_point doctor-live; then ag_failed+=('FAIL doctor (stopped at doctor-live)'); return 1; fi
  out=$("$engine/bin/agent-guard" doctor 2>&1)
  rc=$?
  ag_say "$out"
  if (( rc )); then
    ag_failed+=(${(M)${(f)out}:#FAIL*})
    (( $#ag_failed )) || ag_failed+=("FAIL agent-guard doctor exited $rc")
    return 1
  fi
  if ! test_point launch-check; then ag_failed+=('FAIL launch (stopped at launch-check)'); return 1; fi
  out=$(ag_bounded 20 "$engine/bin/opencode" --version 2>&1)
  rc=$?
  [[ -r $log ]] && first=$(/usr/bin/head -1 -- "$log")
  if (( rc != 0 && rc != 124 )) && [[ $out == *'agent-guard: opencode not found'* ]]; then
    ag_say 'skip launch check (opencode CLI not found)'
  elif (( rc == 124 )); then
    ag_failed+=('FAIL opencode --version through bin/opencode did not finish within 20 seconds')
  elif (( rc )); then
    ag_failed+=("FAIL opencode --version through bin/opencode exited $rc")
  elif [[ $first != "Agent Guard cli $ag_rid_new "* ]]; then
    ag_failed+=("FAIL opencode --version through bin/opencode did not run release $ag_rid_new")
  else
    ag_say "ok   opencode --version through bin/opencode ran release $ag_rid_new"
  fi
  (( $#ag_failed == 0 )) || { ag_say "${(F)ag_failed}"; return 1 }
}

# K1: the stamp is the commit point, written only after the checks passed.
ag_stamp_write() {
  local out="$ag_tstage/stamp.json" rel="$engine/releases/$ag_rid_new" sums links
  local -a files
  test_point stamp || return 1
  files=("$rel"/**/*(.DN) "$cc/agent-guard/rulebook.json"(N) "$app"/**/*(.DN))
  sums=$(/usr/bin/shasum -a 256 -- $files) || return 1
  links=$(/usr/bin/jq -cn --arg c "$engine/current" --arg cv "$(/usr/bin/readlink -- "$engine/current")" \
    --arg b "$engine/bin" --arg bv "$(/usr/bin/readlink -- "$engine/bin")" \
    --arg p "$plugin" --arg pv "$(/usr/bin/readlink -- "$plugin")" '{($c): $cv, ($b): $bv, ($p): $pv}') || return 1
  print -r -- "$sums" | /usr/bin/jq -Rn --arg version "$ag_version" --arg tag "$ag_tag" --arg commit "$ag_commit" \
    --arg release "$ag_rid_new" --argjson at "$EPOCHSECONDS" --arg app_inputs "$ag_app_inputs" --argjson links "$links" \
    '{version: $version, tag: $tag, commit: $commit, release: $release, installed_at: $at, app_inputs: $app_inputs,
      files: ([inputs | select(length > 66) | {key: .[66:], value: .[0:64]}] | from_entries), links: $links}' > "$out" || return 1
  replace_file "$stamp" "$out" || return 1
  /bin/sync
}

# K2: removes release folders other than the new one and the one it replaced,
# which keeps serving OpenCode sessions started from it, then the transaction.
ag_cleanup() {
  local r
  ag_jlast cleanup
  if [[ -z $REPLY ]]; then ag_jnl cleanup begun || return 1; fi
  test_point cleanup || return 1
  for r in "$engine"/releases/*(N/); do
    [[ ${r:t} == "$ag_rid_new" || ${r:t} == "$ag_rid_old" ]] || /bin/rm -rf -- "$r" || return 1
  done
  /bin/rm -rf -- "$ag_tstage" "$txn_dir/backup" || return 1
  /bin/rmdir -- "$engine/stage" 2>/dev/null
  ag_drop_txn
}

# Before the switch: removes the new release, its stage and the transaction.
ag_discard() {
  local cur=
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

# ag_rollback [recover]: undoes every switch action in reverse (design section
# 4.3). On a fresh install the engine folder goes too, except during recovery,
# whose caller still runs inside it.
ag_rollback() {
  integer bad=0
  ag_jlast rollback
  if [[ -z $REPLY ]]; then ag_jnl rollback begun || return 1; fi
  test_point rollback
  undo_rc || bad=1
  undo_permissions || bad=1
  undo_plugin || bad=1
  undo_current || bad=1
  undo_app || bad=1
  undo_rulejson || bad=1
  undo_rulebook || bad=1
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
  for f in engine profiles LICENSE install.sh VERSION COMMIT; do
    [[ -e $root/$f ]] || continue
    /bin/cp -R -- "$root/$f" "$dest/" || ag_abort "cannot copy $root/$f"
  done
  [[ -f $dest/VERSION ]] || print -r -- "$version" > "$dest/VERSION"
  [[ -f $dest/COMMIT ]] || print -r -- checkout > "$dest/COMMIT"
  /usr/bin/xattr -dr com.apple.quarantine "$ag_stage/tree" 2>/dev/null
  exec /bin/zsh -f "$dest/profiles/opencode/install.sh" --stage "$txn" "$@"
}

# install.sh --stage TXN: the staged install (design sections 3 and 4).
ag_install_main() {
  local w
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
  ag_classify_configs
  ag_projects_check || ag_abort
  ag_app_decide || ag_abort
  ag_new_rid
  ag_rid_new=$REPLY

  ag_txn_open || ag_abort "cannot open a transaction in $txn_dir"
  ag_phase=staged
  test_point txn-open || ag_abort 'stopped at txn-open'
  ag_say "engine: $engine (release $ag_rid_new)"
  ag_assemble || ag_abort "cannot assemble release $ag_rid_new"
  test_point assemble || ag_abort 'stopped at assemble'
  ag_build || ag_abort 'cannot build the release files'
  test_point build || ag_abort 'stopped at build'
  ag_list_step || ag_abort
  test_point list || ag_abort 'stopped at list'
  ag_selftest_staged || ag_abort 'the staged release failed its self-test; the installed version is unchanged'
  test_point selftest-staged || ag_abort 'stopped at selftest-staged'

  ag_phase=switch
  ag_switch || ag_abort 'the switch failed'
  ag_gate || ag_abort 'the checks after the switch failed'
  ag_stamp_write || ag_abort "cannot write $stamp"
  ag_phase=committed
  ag_cleanup || ag_warn 'cleanup is unfinished; the next run finishes it'
  ag_unlock

  ag_say "Agent Guard $ag_version is installed (release $ag_rid_new)."
  ag_say 'PATH: new terminal windows run opencode inside the guard'
  ag_say "GUI: $app (drag it to the Dock)"
  "$engine/current/launch" find-app >/dev/null 2>&1 || ag_warnings+=('OpenCode.app not found: install it, then open Agent Guard')
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

# install.sh --recover CALLER, as state/txn/install.sh (design section 2.3).
# Exit 0 when the transaction is closed: committed, discarded or rolled back.
ag_recover_main() {
  local caller=${1:-} rel=
  [[ $caller == (install|update|uninstall) ]] || { ag_err 'usage: install.sh --recover install|update|uninstall'; exit 2 }
  ag_init || exit 1
  [[ ${ag_self:h} == "$txn_dir" ]] || { ag_err "--recover runs only as $txn_dir/install.sh"; exit 1 }
  ag_lock parent || exit 1
  ag_txn_load || exit 1
  [[ -f $stamp ]] && rel=$(/usr/bin/jq -r '.release // empty' "$stamp" 2>/dev/null)
  if [[ $rel == "$ag_rid_new" ]]; then
    ag_say "finishing the cleanup after release $ag_rid_new"
    ag_cleanup
    exit
  fi
  if ! ag_switch_begun; then
    ag_say "discarding the unfinished install of release $ag_rid_new"
    ag_discard
    exit
  fi
  ag_jlast rollback
  if [[ -n $REPLY || $caller == uninstall ]]; then
    ag_say "rolling back the unfinished switch to release $ag_rid_new"
    ag_rollback recover
    exit
  fi
  ag_say "resuming the unfinished switch to release $ag_rid_new"
  if ag_switch && ag_gate && ag_stamp_write; then
    ag_say "Agent Guard $ag_version is installed (release $ag_rid_new)."
    ag_cleanup || ag_warn 'cleanup is unfinished; the next run finishes it'
    exit 0
  fi
  (( $#ag_failed )) && print -ru2 -- "failed checks:"$'\n'"${(F)ag_failed}"
  ag_say "rolling back the switch to release $ag_rid_new"
  ag_rollback recover
}

main() {
  [[ ${1:-} == --lib ]] && return 0
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  case ${1:-} in
    (--recover) shift; ag_recover_main "$@" ;;
    (--stage) (( $# >= 2 )) || { ag_err 'usage: install.sh --stage TXN [options]'; exit 2 }; shift; ag_install_main "$@" ;;
    (*) ag_checkout_main "$@" ;;
  esac
}
main "$@"

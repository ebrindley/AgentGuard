#!/bin/zsh
# Agent Guard bootstrap, published as the release asset install.sh:
#   /bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)" install.sh [args]
# scripts/release.sh fills in the tag, the version and the account lookup.
# Everything runs inside agent_guard_bootstrap, called in a brace group on the
# last line: text cut off anywhere, even inside that line, fails to parse and runs nothing.
agent_guard_bootstrap() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local tag='@TAG@' version='@VERSION@'
  local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')
  local home= engine= state= stage= txn= a= f= url= err= eperm= owner= me= want= got= sums=
  local -a field left
  integer fresh=0 locked=0 adopted=0 tries=0

  # Removes what this run created, then exits. An engine folder this run created
  # is first renamed to a name only this run uses, while the lock inside it is
  # still held, so a run starting meanwhile finds no engine folder to lose.
  die() {
    local gone="${engine:h}/.AgentGuard-failed-$$"
    print -ru2 -- "Agent Guard: $*"
    if (( fresh && locked )) && /bin/mv -- "$engine" "$gone"; then
      /bin/rm -rf -- "$gone"
    else
      [[ -n $stage ]] && { /bin/rm -rf -- "$stage"; /bin/rmdir -- "$engine/stage" 2>/dev/null }
      (( locked )) && /bin/rm -rf -- "$state/lock"
    fi
    exit 1
  }
  # 0: this process holds state/lock; 1: another live run holds it; 2: it is
  # stale; 3: it is gone. Sets owner to the recorded pid, if any.
  lock_status() {
    local start= c=
    local -a m
    owner=
    [[ -e $state/lock || -L $state/lock ]] || return 3
    { [[ -r $state/lock/pid ]] && owner=$(<"$state/lock/pid") } 2>/dev/null
    { [[ -r $state/lock/start ]] && start=$(<"$state/lock/start") } 2>/dev/null
    if [[ $owner != <-> || -z $start ]]; then
      owner=
      zstat -L -A m +mtime -- "$state/lock" 2>/dev/null || return 3
      (( EPOCHSECONDS - m[1] < 10 )) && return 1
      return 2
    fi
    [[ $owner == $$ && $start == "$me" ]] && return 0
    c=$(/bin/ps -o comm= -p $owner 2>/dev/null) && [[ ${c:t} == zsh ]] &&
      c=$(/bin/ps -o lstart= -p $owner 2>/dev/null) && [[ ${(j: :)${=c}} == "$start" ]] && return 1
    return 2
  }
  # Renames a stale lock away. The check is repeated under an fcntl lock on
  # state/.lock-takeover, which ends with its process, so two runs that both
  # found the same lock stale cannot both remove it, nor remove its successor.
  take_over() {
    local fd= gone="$state/.lock-stale-$$"
    { : >> "$state/.lock-takeover" && zsystem flock -t 10 -f fd "$state/.lock-takeover" } 2>/dev/null ||
      die "cannot lock $state/.lock-takeover"
    lock_status
    if (( $? == 2 )); then
      /bin/rm -rf -- "$gone"
      /bin/mv -- "$state/lock" "$gone" && /bin/rm -rf -- "$gone"
    fi
    zsystem flock -u $fd
  }
  test_point() { : }

@ACCOUNT_HOME@

  [[ $(/usr/bin/uname -s) == Darwin ]] || die "macOS only"
  for f in /usr/bin/curl /usr/bin/shasum /usr/bin/tar /usr/bin/awk /usr/bin/xattr /usr/bin/dscl /usr/bin/id /bin/ps; do
    [[ -x $f ]] || die "missing $f (macOS 15 or later required)"
  done
  { zmodload zsh/system zsh/datetime && zmodload -F zsh/stat b:zstat } || die "zsh/system, zsh/datetime or zsh/stat not available"
  account_home || die 'cannot resolve account home'
  home=${REPLY:A}
  engine="$home/Library/Application Support/AgentGuard"
  state="$engine/state"
  [[ ! -e $engine && ! -L $engine ]] && /bin/mkdir -- "$engine" 2>/dev/null && fresh=1

  # Inside a guard or another sandbox the state folder is not writable and the
  # write fails with EPERM. Refuse then, before anything changes.
  syserror -e eperm EPERM
  [[ -L $state ]] && die "$state is a symbolic link; not changed"
  [[ -L $engine/stage ]] && die "$engine/stage is a symbolic link; not changed"
  if ! err=$(/bin/mkdir -p -- "$state" 2>&1) ||
     ! err=$( { sysopen -w -o creat,excl -u f "$state/.probe-$$" } 2>&1 ); then
    (( fresh )) && /bin/rmdir -- "$state" "$engine" 2>/dev/null
    [[ ${(L)err} == *": ${(L)eperm}" ]] && die "run this from Terminal, outside any guard or sandbox"
    die "cannot write $state: ${err##*: }"
  fi
  /bin/rm -f -- "$state/.probe-$$"

  # The lock is the folder state/lock, and creating it is the only way to take it.
  # Its owner record is start, the owner's `ps -o lstart=` with blanks collapsed,
  # then pid. exec keeps both, so a lock taken by `agent-guard update` passes to
  # this script and on to the installer. The lock is held while its pid runs zsh
  # with that start time. Without a complete record it counts as held for 10
  # seconds after the folder last changed; its owner may not have written it yet.
  me=$(/bin/ps -o lstart= -p $$) && me=${(j: :)${=me}} && [[ -n $me ]] || die "cannot read the start time of process $$"
  until /bin/mkdir -- "$state/lock" 2>/dev/null; do
    (( ++tries <= 5 )) || die "cannot take $state/lock"
    lock_status
    case $? in
      (0) adopted=1; break ;;
      (1) die "another Agent Guard install is running${owner:+ (process $owner)}" ;;
      (2) take_over ;;
    esac
  done
  # Both files are created exclusively and read back: a run that found this folder
  # stale may have replaced it and written its own record there, and then this
  # run stops.
  if (( ! adopted )); then
    { ( setopt no_clobber; print -r -- "$me" > "$state/lock/start" && print -r -- $$ > "$state/lock/pid" ) &&
      [[ $(<"$state/lock/start") == "$me" && $(<"$state/lock/pid") == $$ ]] } 2>/dev/null ||
      die "cannot write the owner of $state/lock"
  fi
  locked=1
  # A folder another run used before this run took the lock is not this run's to delete.
  if (( fresh )); then
    left=("$engine"/*(DN) "$state"/*(DN))
    [[ ${(j:|:)left} == "$state|$state/lock" ]] || fresh=0
  fi

  # Downloads left by a run that stopped before opening a transaction. With a
  # transaction open, the installer's recovery owns them.
  if [[ ! -e $state/txn && ! -e $state/txn.new ]]; then
    /bin/rm -rf -- "$engine/stage"/*(DN)
  fi

  txn=$(/bin/date -u +%Y%m%dT%H%M%SZ)-$$
  stage="$engine/stage/$txn"
  a="agent-guard-$version.tar.gz"
  /bin/mkdir -p -m 700 -- "$stage/dl" "$stage/tree" || die "cannot create $stage"
  for f in $a $a.sha256; do
    url="$repo/releases/download/$tag/$f"
    /usr/bin/curl -q -fsSL $curl_proto -o "$stage/dl/$f" -- "$url" || die "download failed (curl $?): $url"
  done
  test_point after-download || die "stopped at after-download"

  # Field by field: shasum -c would take the file name from the checksum file.
  sums=$(<"$stage/dl/$a.sha256")
  field=(${=sums})
  (( $#field == 2 )) && [[ ${field[1]} == [0-9a-f](#c64) && ${field[2]} == "$a" ]] || die "malformed $a.sha256"
  want=${field[1]}
  got=$(/usr/bin/shasum -a 256 -- "$stage/dl/$a") || die "cannot hash $a"
  got=${got%% *}
  [[ $got == "$want" ]] || die "checksum mismatch for $a: expected $want, got $got"
  test_point after-verify || die "stopped at after-verify"

  /usr/bin/tar -tzf "$stage/dl/$a" |
    /usr/bin/awk -v p="agent-guard-$version/" 'index($0, p) != 1 || /(^|\/)\.\.(\/|$)/ { bad = 1 } END { exit bad }' ||
    die "unexpected paths in $a"
  /usr/bin/tar -xzf "$stage/dl/$a" -C "$stage/tree" || die "cannot unpack $a"
  f="$stage/tree/agent-guard-$version"
  [[ -f $f/VERSION && $(<"$f/VERSION") == "$version" ]] || die "VERSION in $a does not match $tag"
  [[ -f $f/profiles/opencode/install.sh ]] || die "$a has no installer"
  /usr/bin/xattr -dr com.apple.quarantine "$stage/tree" 2>/dev/null
  test_point after-unpack || die "stopped at after-unpack"

  exec /bin/zsh -f "$f/profiles/opencode/install.sh" --stage "$txn" "$@"
}
{ agent_guard_bootstrap "$@" }

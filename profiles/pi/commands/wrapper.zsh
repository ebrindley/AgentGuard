# agent-guard wrapper add|remove|list (docs/DESIGN.md section 11, Custom wrappers).
# Sourced by agent-guard, which sets home, engine and release and defines die,
# load_installer and pi_installed.
#
# A wrapper is a copy in ~/.local/bin that hands off to the guard's pi next to it.
# add checks every wrapper as pi-sandbox-guard's deploy-launchers.sh
# --extra-launchers did, including check-launchers.mjs --sources, and installs
# nothing when one fails. state/wrappers.json records each installed name with its
# SHA-256, and the names removed since:
#   {"wrappers": {"NAME": {"sha256": "HEX"}}, "historical": ["NAME", ...]}

# pi and omp are the guard's launchers; the others are Agent Guard's commands and
# the files the launcher reads from its own folder. Lower case: add compares names
# ignoring case.
pi_wrapper_reserved=(pi omp opencode opencode-gui agent-guard pi-sandbox.sb pi-sandbox-preamble.zsh)
pi_wrapper_stage=

pi_wrapper_usage() { print -ru2 -- 'usage: agent-guard wrapper add FILE|FOLDER... | remove NAME... | list'; exit 2 }

pi_wrapper_die() {
  [[ -n $pi_wrapper_stage ]] && /bin/rm -rf -- "$pi_wrapper_stage"
  (( ${+functions[ag_unlock]} )) && ag_unlock
  die "$@"
}

pi_wrapper() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local cmd=${1:-} bin="$home/.local/bin" wrappers_json="$engine/state/wrappers.json"
  integer rc
  (( $# )) && shift
  case $cmd in
    (add|remove) (( $# )) || pi_wrapper_usage ;;
    (list) (( $# == 0 )) || pi_wrapper_usage; pi_wrapper_list; return ;;
    (*) pi_wrapper_usage ;;
  esac
  pi_installed || die 'Pi is not installed; a wrapper hands off to its launcher in ~/.local/bin'
  # Install and update read and write the record too.
  load_installer
  ag_probe || exit 1
  ag_lock || exit 1
  [[ -e $txn_dir ]] && pi_wrapper_die "an install, update or uninstall did not finish ($txn_dir); run agent-guard update first"
  pi_wrapper_$cmd "$@"
  rc=$?
  ag_unlock
  return $rc
}

# The record, or an empty one when there is none.
pi_wrapper_read() {
  pi_wrapper_regular "$wrappers_json"
  [[ -f $wrappers_json ]] || { REPLY='{"wrappers":{},"historical":[]}'; return 0 }
  REPLY=$(/usr/bin/jq -ce 'select((.wrappers | type) == "object" and (.historical | type) == "array")' "$wrappers_json" 2>/dev/null) ||
    pi_wrapper_die "cannot read $wrappers_json"
}

pi_wrapper_write() {
  local tmp
  pi_wrapper_regular "$wrappers_json"
  { tmp=$(/usr/bin/mktemp "$wrappers_json.XXXXXX") && print -r -- "$1" > "$tmp" && /bin/mv -f -- "$tmp" "$wrappers_json" } ||
    { [[ -n ${tmp:-} ]] && /bin/rm -f -- "$tmp"; pi_wrapper_die "cannot write $wrappers_json" }
}

# pi_wrapper_regular PATH: PATH is absent or a regular file. mv onto a link to a
# folder, or onto a folder, would move the new file into that folder.
pi_wrapper_regular() {
  [[ -L $1 ]] && pi_wrapper_die "$1 is a symbolic link; remove it first"
  [[ -e $1 && ! -f $1 ]] && pi_wrapper_die "$1 is not a regular file; remove it first"
  return 0
}

# REPLY: matches, changed or missing, for ~/.local/bin/NAME against SHA256.
pi_wrapper_state() {
  local f="$bin/$1" sum
  if [[ ! -e $f && ! -L $f ]]; then REPLY=missing
  elif [[ -f $f && ! -L $f ]] && sum=$(/usr/bin/shasum -a 256 -- "$f") && [[ ${sum[1,64]} == "$2" ]]; then REPLY=matches
  else REPLY=changed
  fi
}

pi_wrapper_add() {
  local arg src f name lname node out json dst tmp bak sum known backups="$engine/state/wrapper-backups"
  local -a srcs names lnames sums
  integer i
  for arg in "$@"; do
    if [[ -d $arg ]]; then
      # A folder adds its files, as --extra-launchers did: not documents, backups or temporary files.
      for f in "$arg"/*(N); do
        [[ ${f:t} == (*.md|*.bak.*|*.tmp.*) ]] || srcs+=("$f")
      done
    elif [[ -e $arg || -L $arg ]]; then
      srcs+=("$arg")
    else
      pi_wrapper_die "no such file or folder: $arg"
    fi
  done
  (( $#srcs )) || pi_wrapper_die 'no wrappers to add'
  # Names are compared ignoring case: on a case-insensitive volume, the default on
  # macOS, PI is the same file as pi.
  pi_wrapper_read
  json=$REPLY
  known=$(/usr/bin/jq -r '(.wrappers | keys[]), .historical[]' <<< "$json")
  for src in $srcs; do
    name=${src:t} lname=${(L)src:t} dst="$bin/${src:t}"
    [[ -L $src ]] && pi_wrapper_die "refusing symlink (install real files only): $src"
    [[ -f $src ]] || pi_wrapper_die "not a regular file: $src"
    (( ${pi_wrapper_reserved[(Ie)$lname]} )) && pi_wrapper_die "'$name' is reserved, ignoring case ($pi_wrapper_reserved): $src"
    [[ $name == [A-Za-z0-9._-]## ]] || pi_wrapper_die "wrapper name must match [A-Za-z0-9._-]: $src"
    (( ${lnames[(Ie)$lname]} )) && pi_wrapper_die "duplicate wrapper name '$name', ignoring case: $src"
    for f in ${(f)known}; do
      [[ ${(L)f} == $lname && $f != $name ]] && pi_wrapper_die "'$name' differs only in case from the recorded name '$f': $src"
    done
    [[ -L $dst ]] && pi_wrapper_die "$dst is a symbolic link; remove it, or choose another name"
    [[ -e $dst && ! -f $dst ]] && pi_wrapper_die "$dst is not a regular file; remove it, or choose another name"
    names+=("$name")
    lnames+=("$lname")
  done
  [[ -L $backups ]] && pi_wrapper_die "$backups is a symbolic link; remove it first"
  [[ -e $backups && ! -d $backups ]] && pi_wrapper_die "$backups is not a folder; remove it first"
  pi_wrapper_node
  node=$REPLY
  # The check and the install read the same copies, which no session can write.
  pi_wrapper_stage=$(/usr/bin/mktemp -d "$engine/state/.wrapper-stage.XXXXXX") ||
    pi_wrapper_die "cannot create a staging folder in $engine/state"
  for i in {1..$#srcs}; do
    /bin/cp -- "$srcs[i]" "$pi_wrapper_stage/$names[i]" || pi_wrapper_die "cannot copy $srcs[i]"
  done
  out=$(/usr/bin/env -u PI_SANDBOX_CHECK_DEPLOYED -u PI_SANDBOX_DEPLOYED_ROOT "HOME=$home" \
    "$node" "$release/profiles/pi/scripts/check-launchers.mjs" --sources "$pi_wrapper_stage"/${^names} 2>&1)
  if (( $? )); then
    for i in {1..$#srcs}; do
      f="$pi_wrapper_stage/$names[i]"
      out=${out//$f/$srcs[i]}
    done
    print -ru2 -- "$out"
    pi_wrapper_die 'wrapper check failed; nothing installed'
  fi
  for name in $names; do
    sum=$(/usr/bin/shasum -a 256 -- "$pi_wrapper_stage/$name") || pi_wrapper_die "cannot hash $name"
    sums+=("$name" "${sum[1,64]}")
  done
  # Recorded first: a wrapper the steps below then fail to install shows as changed
  # or missing in doctor, instead of sitting unrecorded on PATH.
  json=$(print -r -- "$json" | /usr/bin/jq -c 'reduce ($ARGS.positional | _nwise(2)) as [$n, $h] (.;
    .wrappers[$n] = {sha256: $h} | .historical -= [$n])' --args $sums) || pi_wrapper_die "cannot update $wrappers_json"
  pi_wrapper_write "$json"
  # Each new file is created only in its destination folder, under a name mktemp
  # makes, and renamed over a destination checked again just before.
  for name in $names; do
    dst="$bin/$name"
    if [[ -e $dst ]] && ! /usr/bin/cmp -s -- "$pi_wrapper_stage/$name" "$dst"; then
      if [[ ! -d $backups ]]; then
        /bin/mkdir -- "$backups" || pi_wrapper_die "cannot create $backups"
      fi
      [[ -L $backups || ! -d $backups ]] && pi_wrapper_die "$backups is not a folder"
      bak=$(/usr/bin/mktemp "$backups/$name.$(/bin/date -u '+%Y%m%dT%H%M%SZ').XXXXXX") && /bin/cp -p -- "$dst" "$bak" ||
        pi_wrapper_die "cannot back up $dst"
      print -r -- "backed up $dst to $bak"
    fi
    tmp=$(/usr/bin/mktemp "$bin/.$name.XXXXXX") || pi_wrapper_die "cannot create a file in $bin"
    { /bin/cp -- "$pi_wrapper_stage/$name" "$tmp" && /bin/chmod 755 "$tmp" && /usr/bin/cmp -s -- "$pi_wrapper_stage/$name" "$tmp" &&
      [[ ! -L $dst && ( ! -e $dst || -f $dst ) ]] && /bin/mv -f -- "$tmp" "$dst" } || { /bin/rm -f -- "$tmp"; pi_wrapper_die "cannot install $dst" }
    print -r -- "installed $dst"
  done
  /bin/rm -rf -- "$pi_wrapper_stage"
  pi_wrapper_stage=
}

# The checker Node from the guard extension's .guard-node runs check-launchers.mjs,
# accepted as doctor accepts it: outside every sandbox-writable root (lib-ops.sh).
pi_wrapper_node() {
  local f="$home/.pi/agent/extensions/pi-sandbox-guard/.guard-node" n= p
  { IFS= read -r n < "$f" } 2>/dev/null
  if [[ $n == /* && -x ${n:A} && ! -d ${n:A} ]]; then
    for p in "$n" "${n:A}"; do
      /bin/bash -c '. "$1" && ops_path_is_known_sandbox_write_root "$2" "$3"' _ \
        "$release/profiles/pi/scripts/lib-ops.sh" "$p" "$home" && n=
    done
  else
    n=
  fi
  [[ -n $n ]] || pi_wrapper_die "no usable checker Node in $f; record one with agent-guard bind --checker-node"
  REPLY=$n
}

pi_wrapper_remove() {
  local name json want dst
  local -a gone
  integer rc=0
  pi_wrapper_read
  json=$REPLY
  for name in "$@"; do
    [[ $name == [A-Za-z0-9._-]## ]] && /usr/bin/jq -e --arg n "$name" '.wrappers | has($n)' <<< "$json" >/dev/null ||
      pi_wrapper_die "not a recorded wrapper: $name"
  done
  for name in "$@"; do
    dst="$bin/$name"
    want=$(/usr/bin/jq -r --arg n "$name" '.wrappers[$n].sha256' <<< "$json")
    pi_wrapper_state "$name" "$want"
    case $REPLY in
      (missing) gone+=("$name"); print -r -- "$dst was already absent" ;;
      (matches) /bin/rm -f -- "$dst" || pi_wrapper_die "cannot remove $dst"; gone+=("$name"); print -r -- "removed $dst" ;;
      (*) print -ru2 -- "agent-guard: $dst changed since it was recorded; left in place"; rc=1 ;;
    esac
  done
  if (( $#gone )); then
    json=$(/usr/bin/jq -c '.wrappers |= with_entries(select(.key | IN($ARGS.positional[]) | not))
      | .historical = (.historical + $ARGS.positional | unique)' --args $gone <<< "$json") || pi_wrapper_die "cannot update $wrappers_json"
    pi_wrapper_write "$json"
  fi
  return $rc
}

# One line per name: its state (recorded, historical) and what is in ~/.local/bin.
pi_wrapper_list() {
  local name json want
  local -a names hist
  pi_wrapper_read
  json=$REPLY
  names=(${(f)"$(/usr/bin/jq -r '.wrappers | keys[]' <<< "$json")"})
  hist=(${(f)"$(/usr/bin/jq -r '.historical[]' <<< "$json")"})
  (( $#names + $#hist )) || { print -r -- 'no custom wrappers recorded'; return 0 }
  for name in $names; do
    want=$(/usr/bin/jq -r --arg n "$name" '.wrappers[$n].sha256' <<< "$json")
    pi_wrapper_state "$name" "$want"
    case $REPLY in
      (matches) REPLY='hash matches' ;;
      (changed) REPLY='changed since recorded' ;;
    esac
    printf '%-24s %-10s %s\n' "$name" recorded "$REPLY"
  done
  for name in $hist; do
    if [[ -f $bin/$name && -x $bin/$name ]]; then REPLY='still executable'
    elif [[ -e $bin/$name || -L $bin/$name ]]; then REPLY='present, not executable'
    else REPLY=absent
    fi
    printf '%-24s %-10s %s\n' "$name" historical "$REPLY"
  done
}

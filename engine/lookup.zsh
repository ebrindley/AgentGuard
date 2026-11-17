# How a new terminal window resolves a command, for the installer, agent-guard and
# the launcher: a bounded run, the lookup, and the OpenCode shadow check built on
# it. Callers set home and engine (the account-derived folders) first.

# ag_bounded SECONDS CMD...: CMD's status, or 124 when it runs longer. The limit
# is measured on the clock: on a loaded Mac each poll takes longer than its sleep,
# so a count of polls would allow far more than SECONDS.
ag_bounded() {
  zmodload zsh/datetime || return 1
  float end=$(( EPOCHREALTIME + $1 ))
  integer pid
  shift
  "$@" </dev/null &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    if (( EPOCHREALTIME > end )); then
      /usr/bin/pkill -KILL -P $pid 2>/dev/null
      kill -KILL $pid 2>/dev/null
      wait $pid 2>/dev/null
      return 124
    fi
    /bin/sleep 0.1
  done
  wait $pid
}

# ag_shell_resolve NAME [SHELL-OPTIONS...]: resolve NAME as a clean zsh with
# this account's home would (-l -i for a new terminal). Status 0 is Agent Guard's
# launcher, 1 a different executable (REPLY is the path), 2 a missing name,
# 3 a shell definition (REPLY describes its kind), and 4 a failed lookup.
# A tagged line distinguishes the answer from startup and logout output.
ag_shell_resolve() {
  local name=$1 output tag='agent-guard-lookup:' result
  local -a found
  shift
  REPLY=
  output=$(ag_bounded 20 /usr/bin/env -i "HOME=$home" "PATH=/usr/bin:/bin:/usr/sbin:/sbin" /bin/zsh "$@" -c '
    description=$(\builtin \whence -w -- "$1") || [[ -n $description ]] || exit 1
    kind=${description##*: }
    case $kind in
      (command|hashed)
        resolved=$(\builtin \whence -- "$1") || exit 1
        [[ $resolved == /* ]] || resolved="$PWD/$resolved"
        \builtin \print -r -- "${2}path:$resolved"
        ;;
      (alias|function|builtin|reserved|none) \builtin \print -r -- "$2$kind" ;;
    esac
  ' agent-guard-lookup "$name" "$tag" 2>/dev/null </dev/null) || return 4
  found=(${(M)${(@f)output}:#$tag*})
  result=${${found[-1]:-}#$tag}
  case $result in
    (path:*) REPLY=${result#path:}; [[ ${REPLY:A} == "$engine"/releases/*/bin/$name ]]; return ;;
    (alias) REPLY='a shell alias' ;;
    (function) REPLY='a shell function' ;;
    (builtin) REPLY='a shell builtin' ;;
    (reserved) REPLY='a reserved word' ;;
    (none) return 2 ;;
    (*) return 4 ;;
  esac
  return 3
}

# REPLY = the warning for a ZDOTDIR outside the home, whose startup files a new
# terminal reads instead of the account's; empty otherwise.
ag_opencode_path_warning() {
  REPLY=
  [[ -n ${ZDOTDIR:-} && ${ZDOTDIR:A} != "$home" ]] || return 0
  REPLY="ZDOTDIR uses ${ZDOTDIR:A}; add this line to its .zprofile and .zshrc for terminal activation: "
  REPLY+='export PATH="$HOME/Library/Application Support/AgentGuard/bin:$PATH"'
}

# True when a new terminal window resolves opencode to a different executable
# on PATH. This is the shadowing the installer can fix by moving its PATH block.
ag_opencode_path_shadowed() {
  ag_opencode_path_warning
  [[ -z $REPLY ]] || return 1
  ag_shell_resolve opencode -l -i
  (( $? == 1 ))
}

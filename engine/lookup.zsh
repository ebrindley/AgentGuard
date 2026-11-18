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

# ag_shell_paths [ZSH-OPTIONS...] -- NAME...: fill the caller's associative
# array ag_resolved in one shell. Startup helpers may outlive zsh with stdout
# open. Only the lookup writes to the private result file, after startup.
ag_shell_paths() {
  local result_file name value
  local -a opts
  while [[ $1 != -- ]]; do opts+=("$1"); shift; done
  shift
  result_file=$(/usr/bin/mktemp -t agent-guard-lookup) || return 1
  {
    ag_bounded 20 /usr/bin/env -i "HOME=$home" "PATH=/usr/bin:/bin:/usr/sbin:/sbin" /bin/zsh "${opts[@]}" -c '
      exec 3>|"$1" || exit 1
      shift
      for name; do
        description=$(\builtin \whence -w -- "$name") || [[ -n $description ]] || exit 1
        case ${description##*: } in
          (command|hashed)
            value=$(\builtin \whence -- "$name") || exit 1
            [[ $value == /* ]] || value="$PWD/$value" ;;
          (alias) value="a shell alias" ;;
          (function) value="a shell function" ;;
          (builtin) value="a shell builtin" ;;
          (reserved) value="a reserved word" ;;
          (none) value="" ;;
          (*) exit 1 ;;
        esac
        \builtin \print -rN -- "$name" "$value" >&3
      done
    ' agent-guard-lookup "$result_file" "$@" >/dev/null 2>&1 || return 1
    while IFS= read -r -d "" name && IFS= read -r -d "" value; do
      ag_resolved[$name]=$value
    done < "$result_file"
  } always {
    /bin/rm -f -- "$result_file"
  }
}

# ag_shell_resolve NAME [SHELL-OPTIONS...]: 0 for Guard's launcher, 1 for a
# different path, 2 for a missing name, 3 for a definition, 4 for no answer.
ag_shell_resolve() {
  local name=$1
  local -A ag_resolved
  shift
  REPLY=
  ag_shell_paths "$@" -- "$name" && (( ${+ag_resolved[$name]} )) || return 4
  REPLY=${ag_resolved[$name]}
  [[ -n $REPLY ]] || return 2
  [[ $REPLY == /* ]] || return 3
  [[ ${REPLY:A} == "$engine"/releases/*/bin/$name ]]
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

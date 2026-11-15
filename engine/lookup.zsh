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

# ag_shell_resolve NAME [SHELL-OPTIONS...]: which executable zsh finds for NAME in
# a clean environment with this account's home, as a new terminal window would
# (-l -i). REPLY = its path. Returns 0 when that is Agent Guard's launcher (a
# release's bin/NAME, reached through the current link), 1 when it is another
# file, and 2 when there is none. The answer is read from a tagged line, because
# startup and logout files may print lines of their own.
ag_shell_resolve() {
  local name=$1 p tag='agent-guard-lookup:'
  local -a found
  shift
  p=$(ag_bounded 20 /usr/bin/env -i "HOME=$home" "PATH=/usr/bin:/bin:/usr/sbin:/sbin" /bin/zsh "$@" -c "print -r -- \"$tag\$(whence -p ${(q)name})\"" 2>/dev/null </dev/null)
  found=(${(M)${(@f)p}:#$tag*})
  REPLY=${${found[-1]:-}#$tag}
  [[ -n $REPLY ]] || return 2
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

# True when a new terminal window starts an opencode other than Agent Guard's
# launcher, as a startup file that adds ~/.opencode/bin after Agent Guard's block
# does. With ZDOTDIR elsewhere the lookup would not read the files it asks about,
# and the warning above covers activation instead.
ag_opencode_shadowed() {
  ag_opencode_path_warning
  [[ -z $REPLY ]] || return 1
  ag_shell_resolve opencode -l -i
  (( $? == 1 ))
}

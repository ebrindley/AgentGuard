# Host version and server ownership. Every executable probe runs inside the
# launcher's sandbox, including the CLI bundled with the desktop application.
typeset -a opencode_host_env=() opencode_operator_env=(/usr/bin/env) opencode_maintenance_args=()

opencode_gui_environment() {
  local shell=${SHELL:-/bin/zsh} entry key fd pid
  local -a entries shell_args=(-lic)
  # An interactive zsh/bash probe must not take ownership of the launcher's
  # terminal: killing it would hang up that terminal's foreground process group.
  [[ ${shell:t} != (zsh|bash) ]] || shell_args=(+m -lic)
  integer deadline=$(( SECONDS + 5 )) started=0 complete=0
  # A separate pipe lets the launcher stop reading at the deadline even if a
  # startup helper inherits stdout. Values never go to a log or file.
  coproc exec $sandbox -D GUI=0 "$shell" "${shell_args[@]}" '/usr/bin/printf "\\0"; /usr/bin/env -0 && /usr/bin/printf "\\0"' </dev/null 2>/dev/null
  pid=$!
  exec {fd}<&p
  while (( SECONDS < deadline )); do
    IFS= read -r -u $fd -d '' -t $(( deadline - SECONDS )) entry || break
    if (( ! started )); then started=1; continue; fi
    if [[ -z $entry ]]; then complete=1; break; fi
    entries+=("$entry")
  done
  exec {fd}<&-
  # Logout hooks can also wait after the environment has been emitted.
  if (( pid > 0 )); then
    kill -KILL $pid 2>/dev/null || true
    wait $pid 2>/dev/null || true
  fi
  if (( ! complete )); then
    note 'could not load the Desktop login-shell environment within five seconds; inherited credentials remain available'
    return 0
  fi
  opencode_host_env=(/usr/bin/env)
  for entry in "${entries[@]}"; do
    key=${entry%%=*}
    [[ $entry == *=* && $key == [A-Za-z_][A-Za-z0-9_]# ]] || continue
    # These selectors and controls were consumed when the profile was built.
    # Importing new values now would split the client, server and sandbox roots.
    case $key in
      OPENCODE_API_KEY|OPENCODE_GO_API_KEY) ;;
      HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|SHLVL|TMPDIR|ZDOTDIR|XDG_*|OPENCODE_*|AGENT_GUARD_*|CC_SAFETY_NET_*|SAFETY_NET_*|PI_*|OMP_*|CODEX_HOME|CLAUDE_CONFIG_DIR|GROK_HOME|GROK_SANDBOX) continue ;;
    esac
    (( ${env_unset[(Ie)$key]} )) && continue
    if [[ $key == PATH ]]; then
      opencode_host_env+=("PATH=$release/peers:${entry#*=}" "AGENT_GUARD_PEER_PATH=${entry#*=}")
    else
      opencode_host_env+=("$entry")
    fi
  done
  opencode_host_env+=("${env_set[@]}")
  return 0
}

opencode_major() {
  local version
  version=$($sandbox -D GUI=0 "${opencode_host_env[@]}" "$1" --version 2>/dev/null) || fail "cannot read OpenCode version: $1"
  if [[ $version =~ '(^|[[:space:]])v?(([0-9]+)\.[^[:space:]]*)' ]]; then
    REPLY=$match[3]
    # The full version, for the update offer.
    opencode_version=$match[2]
  else
    fail "unrecognized OpenCode version: $version"
  fi
  [[ $REPLY == (1|2) ]] || fail "unsupported OpenCode major version: $REPLY"
}

# The project argument OpenCode itself will open, for @project (docs/DESIGN.md
# section 4): REPLY is the positional argument of `opencode [project]`, the
# --dir of `opencode run`, or empty when the command takes none. A subcommand
# name is never a project, as in OpenCode. It returns 1 with the reason in
# REPLY when an option this list does not know is followed by a word that could
# be its value, because the project could then be misread. It also sets
# opencode_subcommand (the subcommand, or empty) and opencode_attached (1 when
# --attach or --server names a server), which opencode_session_launch reads.
opencode_project_arg() {
  local arg name next unknown= command dir= letters letter
  integer i=1 end=0
  local -a args=("$@") positional
  typeset -g opencode_browser_needed=0 opencode_subcommand= opencode_attached=0
  local -a commands=(completion acp mcp attach run debug providers auth agent upgrade update uninstall serve web
                     models stats export import github pr session plugin plug db service api mini reload pair)
  local -a valued=(--log-level --port --hostname --mdns-domain --model --session --prompt --agent --replay-limit
                   --server --attach --password --username --command --title --format --variant --completions --cwd --dir)
  local -a listed=(--cors --file)
  local -a flags=(--print-logs --pure --mdns --continue --fork --auto --yolo --dangerously-skip-permissions
                  --mini --replay --demo --standalone --wizard --help --version --share --thinking --interactive)
  while (( i <= $#args )); do
    arg=$args[i]
    (( i++ ))
    if (( end )) || [[ $arg != -* || $arg == - ]]; then positional+=("$arg"); continue; fi
    [[ $arg == -- ]] && { end=1; continue }
    next=${args[i]:-}
    if [[ $arg == --* ]]; then
      name=${arg%%=*}
      if [[ $arg == *=* ]]; then
        [[ $name == --dir ]] && dir=${arg#*=}
        [[ $name == (--attach|--server) ]] && opencode_attached=1
      elif (( ${valued[(Ie)$arg]} )); then
        [[ $arg == --dir ]] && dir=$next
        [[ $arg == (--attach|--server) ]] && opencode_attached=1
        (( i++ ))
      elif (( ${listed[(Ie)$arg]} )); then
        (( i++ ))
        while (( i <= $#args )) && [[ ${args[i]} != -* ]]; do (( i++ )); done
      elif (( ! ${flags[(Ie)$arg]} )) && [[ $arg != --no-* ]]; then
        [[ -n $next && $next != -* ]] && unknown=$arg
      fi
      continue
    fi
    # Short options: m, s, p and u take a value, f takes several, the rest do not.
    letters=${arg#-}
    while [[ -n $letters ]]; do
      letter=${letters[1]}
      letters=${letters[2,-1]}
      case $letter in
        ([msup]) [[ -n $letters ]] || (( i++ ))
                 letters= ;;
        (f) [[ -n $letters ]] || { (( i++ )); while (( i <= $#args )) && [[ ${args[i]} != -* ]]; do (( i++ )); done }
            letters= ;;
        ([chvi]) ;;
        (*) [[ -z $next || $next == -* ]] || unknown=$arg ;;
      esac
    done
  done
  command=${positional[1]:-}
  if (( ${commands[(Ie)$command]} )); then
    [[ $command != auth || ${positional[2]:-} != login ]] || opencode_browser_needed=1
    opencode_subcommand=$command
    REPLY=
    [[ $command == run && $opencode_attached == 0 ]] && REPLY=$dir
    return 0
  fi
  if [[ -n $unknown ]]; then
    REPLY="cannot tell whether the word after $unknown is the project; write $unknown=<value>"
    return 1
  fi
  REPLY=${positional[1]:-}
  opencode_browser_needed=1
}

# ARG...: succeeds when ARG... starts an interactive session of OpenCode's own,
# `opencode` or `opencode <project>`: no subcommand and no server to attach to.
# It reads ARG... as opencode_project_arg does, so the two cannot disagree about
# what a subcommand is. REPLY is left as it was.
opencode_session_launch() {
  local REPLY
  opencode_project_arg "$@" || true
  [[ -z $opencode_subcommand && $opencode_attached == 0 ]]
}

# REPLY is the count of leading words that are OpenCode global options. Of
# those, only --log-level and --completions take a separate value.
opencode_global_skip() {
  integer n=0
  while (( n < $# )); do
    case ${@[n+1]} in
      (--print-logs|--print-logs=*|--no-print-logs|--pure|--wizard|--log-level=*|--completions=*) (( ++n )) ;;
      (--log-level|--completions) (( n += 2 )) ;;
      (*) break ;;
    esac
  done
  (( n <= $# )) || n=$#
  REPLY=$n
}

opencode_cli_args() {
  local arg command subcommand standalone=0
  integer sub=1
  local -a prefix rest
  reply=("$@")
  opencode_global_skip "$@"
  prefix=("${@:1:$REPLY}")
  rest=("${@:$(( REPLY + 1 ))}")
  command=${rest[1]:-}
  # Global options may also sit between a command and its subcommand.
  opencode_global_skip "${rest[@]:1}"
  sub=$(( REPLY + 2 ))
  subcommand=${rest[sub]:-}
  for arg in "$@"; do
    [[ $arg == -- ]] && break
    [[ $arg != --standalone ]] || standalone=1
    if [[ $arg == (--server|--server=*|--attach|--attach=*) || $command == attach ]]; then
      note 'attached client is sandboxed; the server executes tools under its own permissions'
      return
    fi
  done
  (( standalone )) && return
  case $command in
    (serve|--version|-v|--help|-h|upgrade|update|uninstall) return 0 ;;
    (service)
      [[ $subcommand != (start|restart) ]] || fail 'start the V2 server with opencode serve; shared-service maintenance runs outside Agent Guard'
      return ;;
    (acp)
      [[ $subcommand != --login ]] || fail 'run V2 ACP login outside Agent Guard'
      return ;;
    (run|mini|models|stats|api|reload) reply=("${prefix[@]}" "$command" --standalone "${rest[@]:1}") ;;
    (auth|session)
      [[ -n $subcommand && $subcommand != (--help|-h) ]] || return 0
      reply=("${prefix[@]}" "${(@)rest[1,sub]}" --standalone "${(@)rest[sub+1,-1]}") ;;
    (debug)
      [[ -n $subcommand && $subcommand != (paths|--help|-h) ]] || return 0
      managed=1 ;;
    (mcp)
      [[ -n $subcommand && $subcommand != (add|--help|-h) ]] || return 0
      managed=1 ;;
    (plugin)
      [[ -n $subcommand && $subcommand != (add|remove|--help|-h) ]] || return 0
      managed=1 ;;
    (pair)
      [[ $subcommand != (--help|-h) ]] || return 0
      managed=1 ;;
    (*) reply=("${prefix[@]}" --standalone "${rest[@]}") ;;
  esac
}

opencode_is_v2() { [[ $1 == (opencode\ v2.*|2.*|v2.*) ]] }

# MAJOR ARG...: succeeds when ARG... is OpenCode's own updater: upgrade on 1 and
# 2, update on 2 only (on 1 it opens a project of that name). The command is the
# first word after the global options and words after -- are data. A help
# request is not maintenance. The caller's REPLY is left as it was.
opencode_maintenance() {
  local major=$1 command arg REPLY
  integer skip
  shift
  opencode_global_skip "$@"
  skip=$REPLY
  command=${@[skip+1]:-}
  [[ $command == upgrade || ( $command == update && $major == 2 ) ]] || return 1
  for arg in "${@:$(( skip + 2 ))}"; do
    [[ $arg != -- ]] || break
    [[ $arg != (--help|-h) ]] || return 1
  done
  return 0
}

# VERSION ARG...: for an OpenCode that runs inside an Agent Guard session, ends
# with status 2 when ARG... is a maintenance command; VERSION is what
# `opencode --version` printed.
opencode_refuse_maintenance() {
  local major=1
  opencode_is_v2 "$1" && major=2
  shift
  opencode_maintenance $major "$@" || return 0
  print -ru2 -- 'agent-guard: Updates cannot run from an agent session. Quit the session, then run opencode upgrade in Terminal. Agent Guard may also offer the update at your next launch.'
  exit 2
}

# Records the operator's own values of every variable the launcher changes
# before the session starts (the profile's env_unset and env_set, HOME, PATH,
# the safety-net level and the rules snapshot) as an env command prefix for
# opencode_unconfined. Call it before the launcher changes any of them.
opencode_capture_env() {
  local name
  local -a unset_names set_values
  for name in $env_unset ${env_set%%=*} HOME PATH CC_SAFETY_NET_LEVEL AGENT_GUARD_CONTEXT; do
    if [[ -v $name ]]; then
      set_values+=("$name=${(P)name}")
    else
      unset_names+=(-u "$name")
    fi
  done
  # env reads its options before the first assignment.
  opencode_operator_env=(/usr/bin/env "${unset_names[@]}" "${set_values[@]}")
}

# ARG...: runs the resolved OpenCode ($cli) with ARG... outside the profile, with
# the operator's environment, and returns its status. The only place OpenCode
# runs unconfined; callers have established that no sandbox is in effect.
opencode_unconfined() {
  "${opencode_operator_env[@]}" "$cli" "$@"
}

# ARG...: OpenCode's updater, `opencode upgrade ARG...`, unconfined.
opencode_upgrade() {
  opencode_unconfined upgrade "$@"
}

# The command the operator typed, for the runner of ag_update_run, which passes
# one word.
opencode_maintenance_run() {
  opencode_unconfined "${opencode_maintenance_args[@]}"
}

# ARG...: the maintenance command the operator typed, outside any sandbox. Runs
# it through the shared runner and exits with its status; no session starts.
opencode_maintain() {
  local rc=0
  # A link on PATH can point into the app.
  if [[ ${cli:A} == */Contents/Resources/opencode-cli ]]; then
    fail 'this OpenCode belongs to the OpenCode app and is updated with the app; quit OpenCode, then run brew upgrade --cask opencode-desktop or install the download from opencode.ai'
  fi
  opencode_maintenance_args=("$@")
  print -ru2 -- "Updating OpenCode. The update runs without Agent Guard's protection; your next session will be protected as usual."
  ag_update_run "$mode" '' opencode_maintenance_run /dev/null OpenCode '' || rc=$?
  exit $rc
}

# Classifies `service status` in REPLY: running for one server URL, inactive
# for stopped or disabled (the service opt-out with no server), and unknown for
# anything else, including a failed probe. Raw output is never echoed because
# it is not known to be free of secrets.
opencode_service_state() {
  local output
  REPLY=unknown
  output=$($sandbox -D GUI=0 "${opencode_host_env[@]}" "$1" service status 2>/dev/null) || return 0
  if [[ $output =~ '^[[:space:]]*https?://[^[:space:]]+[[:space:]]*$' ]]; then
    REPLY=running
  elif [[ $output =~ '^[[:space:]]*(stopped|disabled)[[:space:]]*$' ]]; then
    REPLY=inactive
  fi
}

# Desktop and CLI commands without --standalone use a foreground service owned
# by this launcher. An incumbent is never silently adopted or stopped.
opencode_managed() {
  local cli=$1 rc=0 i
  shift
  opencode_service_state "$cli"
  case $REPLY in
    (running) fail 'OpenCode V2 has a background service. Close its clients, run opencode service stop outside Agent Guard, then reopen Agent Guard.' ;;
    (unknown) fail 'OpenCode V2 reported an unrecognized service status. Run opencode service status outside Agent Guard to inspect it.' ;;
  esac
  typeset -g opencode_server_pid= opencode_client_pid= opencode_client_done=0
  trap opencode_stop_children EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  [[ $mode != gui ]] || opencode_browser_start
  $sandbox -D GUI=0 "${opencode_host_env[@]}" "$cli" serve --service --hostname 127.0.0.1 > "$session/server.log" 2>&1 &
  opencode_server_pid=$!
  # The server writes its own log under its normal writable state root. This
  # launcher's capture is opened before confinement, like the diagnostic probe.
  for i in {1..60}; do
    kill -0 $opencode_server_pid 2>/dev/null || fail "OpenCode V2 server exited before readiness; its output is in $session/server.log"
    opencode_service_state "$cli"
    [[ $REPLY == running ]] && break
    sleep 0.25
  done
  [[ $REPLY == running ]] || fail "OpenCode V2 server did not become ready; its output is in $session/server.log"
  # The app may reconnect by spawning a detached replacement. End the client
  # when its original server exits, so a lost service ends this launch's lease.
  trap opencode_client_exited CHLD
  record_app_projects
  # zsh redirects descriptor 0 for an asynchronous command before applying its
  # redirections. Preserve the caller's terminal on a separate descriptor.
  local input_fd
  exec {input_fd}<&0
  if [[ $mode == gui ]]; then
    $sandbox -D GUI=1 "${opencode_host_env[@]}" "$app/Contents/MacOS/$main" $gui_args "${gui_rest[@]}" <&$input_fd &
  else
    $sandbox "$@" <&$input_fd &
  fi
  opencode_client_pid=$!
  exec {input_fd}<&-
  opencode_client_exited
  wait $opencode_server_pid || true
  trap - CHLD
  if (( ! opencode_client_done )); then
    # In the Desktop app note only logs; an alert tells the user why it closed.
    if (( $+functions[alert] )); then
      alert 'OpenCode V2 server stopped; closing its client. Reopen Agent Guard to start a new service.'
    else
      note 'OpenCode V2 server stopped; closing its client. Reopen Agent Guard to start a new service.'
    fi
    rc=1
  else
    wait $opencode_client_pid || rc=$?
    opencode_client_pid=
  fi
  exit $rc
}

opencode_client_exited() {
  [[ -n ${opencode_client_pid:-} && ${opencode_client_done:-0} == 0 ]] || return 0
  kill -0 $opencode_client_pid 2>/dev/null && return 0
  opencode_client_done=1
  kill $opencode_server_pid 2>/dev/null || true
}

opencode_stop_children() {
  local pid i
  trap - CHLD
  for pid in ${opencode_client_pid:-} ${opencode_server_pid:-}; do
    kill $pid 2>/dev/null || continue
    for i in {1..50}; do kill -0 $pid 2>/dev/null || break; sleep 0.1; done
    kill -KILL $pid 2>/dev/null || true
    wait $pid 2>/dev/null || true
  done
  opencode_client_pid= opencode_server_pid=
  opencode_browser_stop
}

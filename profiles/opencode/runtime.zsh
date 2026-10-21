# Host version and server ownership. Every executable probe runs inside the
# launcher's sandbox, including the CLI bundled with the desktop application.
opencode_major() {
  local version
  version=$($sandbox -D GUI=0 "$1" --version 2>/dev/null) || fail "cannot read OpenCode version: $1"
  if [[ $version =~ '(^|[[:space:]])v?([0-9]+)\.' ]]; then
    REPLY=$match[2]
  else
    fail "unrecognized OpenCode version: $version"
  fi
  [[ $REPLY == (1|2) ]] || fail "unsupported OpenCode major version: $REPLY"
}

opencode_cli_args() {
  local arg command subcommand standalone=0 at=1
  local -a prefix rest
  reply=("$@")
  while [[ ${reply[$at]:-} == (--print-logs|--print-logs=*) ]]; do (( at++ )); done
  prefix=("${@:1:$(( at - 1 ))}")
  rest=("${@:$at}")
  command=${rest[1]:-} subcommand=${rest[2]:-}
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
      reply=("${prefix[@]}" "$command" "$subcommand" --standalone "${rest[@]:2}") ;;
    (debug)
      [[ $subcommand != paths ]] || return 0
      managed=1 ;;
    (plugin|mcp|pair) managed=1 ;;
    (*) reply=("${prefix[@]}" --standalone "${rest[@]}") ;;
  esac
}

# Desktop and CLI commands without --standalone use a foreground service owned
# by this launcher. An incumbent is never silently adopted or stopped.
opencode_managed() {
  local cli=$1 existing rc=0 i
  shift
  existing=$($sandbox -D GUI=0 "$cli" service status 2>/dev/null) || fail 'cannot inspect the V2 background service'
  [[ $existing == stopped ]] || fail 'OpenCode V2 has a background service. Close its clients, run opencode service stop outside Agent Guard, then reopen Agent Guard.'
  $sandbox -D GUI=0 "$cli" serve --service --hostname 127.0.0.1 > "$session/server.log" 2>&1 &
  typeset -g opencode_server_pid=$! opencode_client_pid= opencode_client_done=0
  # The server writes its own log under its normal writable state root. This
  # launcher's capture is opened before confinement, like the diagnostic probe.
  trap opencode_stop_children EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  for i in {1..60}; do
    kill -0 $opencode_server_pid 2>/dev/null || fail 'OpenCode V2 server exited before readiness; check its launch log'
    existing=$($sandbox -D GUI=0 "$cli" service status 2>/dev/null) || existing=stopped
    [[ $existing != stopped ]] && break
    sleep 0.25
  done
  [[ $existing != stopped ]] || fail 'OpenCode V2 server did not become ready'
  # The app may reconnect by spawning a detached replacement. End the client
  # when its original server exits, so a lost service ends this launch's lease.
  trap opencode_client_exited CHLD
  $sandbox "$@" <&0 &
  opencode_client_pid=$!
  opencode_client_exited
  wait $opencode_server_pid || true
  trap - CHLD
  if (( ! opencode_client_done )); then
    note 'OpenCode V2 server stopped; closing its client. Reopen Agent Guard to start a new service.'
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
}

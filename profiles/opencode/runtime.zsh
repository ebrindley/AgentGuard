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
  local arg command=${1:-} subcommand=${2:-} standalone=0
  reply=("$@")
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
    (serve|--version|-v|--help|-h|upgrade|update|uninstall) return ;;
    (service)
      [[ $subcommand != (start|restart) ]] || fail 'start the V2 server with opencode serve; shared-service maintenance runs outside Agent Guard'
      return ;;
    (acp)
      [[ ${2:-} != --login ]] || fail 'run V2 ACP login outside Agent Guard'
      return ;;
    (run|mini|models|stats|api|reload) reply=("$command" --standalone "${@:2}") ;;
    (auth|session) reply=("$command" "$subcommand" --standalone "${@:3}") ;;
    (debug)
      [[ $subcommand != paths ]] || return
      managed=1 ;;
    (plugin|mcp|pair) managed=1 ;;
    (*) reply=(--standalone "$@") ;;
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
  typeset -g opencode_server_pid=$! opencode_client_pid=
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
  $sandbox "$@" <&0 &
  opencode_client_pid=$!
  wait $opencode_client_pid || rc=$?
  opencode_client_pid=
  exit $rc
}

opencode_stop_children() {
  local pid i
  for pid in ${opencode_client_pid:-} ${opencode_server_pid:-}; do
    kill $pid 2>/dev/null || continue
    for i in {1..50}; do kill -0 $pid 2>/dev/null || break; sleep 0.1; done
    kill -KILL $pid 2>/dev/null || true
    wait $pid 2>/dev/null || true
  done
  opencode_client_pid= opencode_server_pid=
}

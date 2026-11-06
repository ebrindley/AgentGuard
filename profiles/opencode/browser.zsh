# Browser authority stays in this launcher's child, never in the agent profile.
opencode_browser_cli_requested() {
  local arg
  for arg in "$@"; do
    [[ $arg != -- ]] || break
    [[ $arg != (--help|-h|--version|-v) ]] || return 1
  done
  opencode_project_arg "$@" || return 1
  (( opencode_browser_needed ))
}

opencode_browser_start() {
  local browser_path entry browser_path_env=$PATH config
  opencode_browser_pid= opencode_browser_dir=
  browser_path=$(/usr/bin/osascript -l JavaScript "$profile_dir/browser/default-browser.js" 2>/dev/null) || {
    note 'browser handoff unavailable: no default HTTPS browser'; return 0
  }
  [[ $browser_path == /* && -d $browser_path ]] || { note 'browser handoff unavailable: invalid browser application'; return 0; }
  opencode_browser_dir=$(/usr/bin/mktemp -d "$engine/state/b.XXXXXXXX") || return 1
  local socket="$opencode_browser_dir/s"
  if (( ${#socket} > 103 )); then
    /bin/rmdir "$opencode_browser_dir"
    opencode_browser_dir=
    note 'browser handoff unavailable: account path exceeds the local socket limit'
    return 0
  fi
  /bin/zsh -f "$profile_dir/browser/helper.zsh" "$socket" "$browser_path" </dev/null >/dev/null 2>&1 &
  opencode_browser_pid=$!
  local i
  for i in {1..40}; do
    [[ ! -S $socket ]] || break
    kill -0 "$opencode_browser_pid" 2>/dev/null || break
    /bin/sleep 0.05
  done
  if [[ ! -S $socket ]]; then
    opencode_browser_stop
    note 'browser handoff unavailable: helper failed to start'
    return 0
  fi
  for entry in "${opencode_host_env[@]}"; do
    [[ $entry != PATH=* ]] || browser_path_env=${entry#PATH=}
  done
  export AGENT_GUARD_BROWSER_SOCKET=$socket
  export PATH="$profile_dir/browser/bin:$browser_path_env"
  export BROWSER="$profile_dir/browser/bin/open"
  (( $#opencode_host_env )) || opencode_host_env=(/usr/bin/env)
  opencode_host_env+=("AGENT_GUARD_BROWSER_SOCKET=$socket" "PATH=$PATH" "BROWSER=$BROWSER")
  if [[ $mode == gui ]]; then
    config=$(/usr/bin/jq -ce --arg plugin "$profile_dir/browser" '
      if type != "object" then error("expected configuration object") else . end |
      .plugins = (.plugins // []) |
      if (.plugins | type) != "array" then error("expected plugin array") else . end |
      if (.plugins | index($plugin)) == null then .plugins += [$plugin] else . end
    ' <<< "${OPENCODE_CONFIG_CONTENT:-\{\}}") || { opencode_browser_stop; fail 'cannot add browser commands to inline OpenCode configuration'; }
    opencode_host_env+=("OPENCODE_CONFIG_CONTENT=$config")
  fi
}

opencode_browser_stop() {
  if [[ -n ${opencode_browser_pid:-} ]]; then
    kill "$opencode_browser_pid" 2>/dev/null || true
    wait "$opencode_browser_pid" 2>/dev/null || true
  fi
  if [[ -n ${opencode_browser_dir:-} ]]; then
    /bin/rm -f -- "$opencode_browser_dir/s"
    /bin/rmdir -- "$opencode_browser_dir" 2>/dev/null || true
  fi
  opencode_browser_pid= opencode_browser_dir=
}

opencode_browser_cli() {
  opencode_server_pid= opencode_client_pid=
  trap opencode_stop_children EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM HUP
  opencode_browser_start
  $sandbox "$@" <&0 &
  opencode_client_pid=$!
  local rc=0
  wait "$opencode_client_pid" || rc=$?
  opencode_client_pid=
  exit $rc
}

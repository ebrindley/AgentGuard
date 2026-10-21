# OpenCode-specific setup and the plugin-load check.

# Resolve only for diagnostics. A relocated cache gets no extra filesystem grant.
opencode_state_roots() {
  local given=${XDG_CACHE_HOME:-$home/.cache}
  [[ $given == /* && ( ! -e $given || -d $given ) ]] ||
    fail "XDG_CACHE_HOME must name a folder by its full path, or be unset: $given"
  cache_given=("$given")
  cache_roots=(${cache_given:A})
}

# A check's server and event reader run in the background, where a
# non-interactive shell ignores SIGINT, so the check stops them itself on a
# signal. The record holds the server's and this shell's start times, so
# recovery (installer/lib.zsh) can stop the server of a check killed outright
# without stopping one that is still running.
opencode_check_started() {  # SERVER-PID
  local owner server
  check_server=$1 check_events=
  owner=$(/bin/ps -o lstart= -p $$ 2>/dev/null) && server=$(/bin/ps -o lstart= -p $1 2>/dev/null) &&
    print -rl -- $1 "${(j: :)${=server}}" "${(j: :)${=owner}}" > "$engine/state/.serve.$$.pid" || true
  # The launcher's emulate -L sets local_traps, which would drop these traps
  # when this function returns.
  setopt local_options no_local_traps
  trap 'opencode_check_interrupted 129' HUP
  trap 'opencode_check_interrupted 130' INT
  trap 'opencode_check_interrupted 143' TERM
}

opencode_check_stop() {
  local p
  for p in ${check_events:-} ${check_server:-}; do
    kill $p 2>/dev/null || true
    wait $p 2>/dev/null || true
  done
  check_events= check_server=
  /bin/rm -f -- "$engine/state/.serve.$$.pid"
}

opencode_check_interrupted() {  # STATUS
  opencode_check_stop
  /bin/rm -f -- "$engine/state/.serve.$$" "$engine/state/.events.$$"
  exit $1
}

opencode_check() {
    # check staged replaces the global config folder with one inside the release
    # whose only plugin links to the release's plugin.js, so the live plugin is
    # not loaded. ~/.opencode is still read.
    local -a scope=(/usr/bin/env OPENCODE_DISABLE_PROJECT_CONFIG=1)
    local label= definitions= readiness= permission_report= permission_at=0 ready=0
    if (( staged )); then
      scope=(/usr/bin/env -u OPENCODE_CONFIG -u OPENCODE_CONFIG_DIR -u OPENCODE_CONFIG_CONTENT
             OPENCODE_DISABLE_PROJECT_CONFIG=1 "XDG_CONFIG_HOME=$profile_dir/check-config")
      label=' (staged)'
    fi
    if next_cli; then
      local cli=$REPLY
      opencode_major "$cli"
      if [[ $REPLY == 2 ]]; then
        opencode_check_v2 "$cli"
      else
      # OpenCode loads the configured plugins at the first request for a folder.
      # It reports a plugin that fails to install, resolve or import as an event,
      # and one whose init fails only in its log, so the check listens to both.
      /bin/mkdir -p "$session/check-project"
      out="$engine/state/.serve.$$" events="$engine/state/.events.$$"
      AGENT_GUARD_SANDBOXED=1 AGENT_GUARD_RELEASE=${release:t} $scope $sandbox -D GUI=0 "$cli" serve --print-logs --log-level ERROR --hostname 127.0.0.1 --port $(( 20000 + RANDOM % 30000 )) > "$out" 2>&1 &
      pid=$!
      opencode_check_started $pid
      ids= epid= listening=0
      local -a failed
      for i in {1..40}; do
        kill -0 $pid 2>/dev/null || break
        url=$(/usr/bin/grep -o 'http://127\.0\.0\.1:[0-9]*' "$out" 2>/dev/null | head -1) || true
        if [[ -n $url && -z $epid ]]; then
          /usr/bin/curl -sN "$url/global/event" > "$events" 2>/dev/null &
          epid=$! check_events=$!
          for j in {1..20}; do /usr/bin/grep -q '"server.connected"' "$events" 2>/dev/null && { listening=1; break }; sleep 0.1; done
          sleep 0.2
        fi
        [[ -n $url ]] && ids=$(/usr/bin/curl -sf --max-time 5 "$url/experimental/tool/ids?directory=${session// /%20}/check-project" 2>/dev/null) &&
          [[ $ids == *'"agent_guard_status"'* ]] && break
        sleep 0.5
      done
      # Plugin errors are published in the background; give them a moment.
      [[ $ids == *'"agent_guard_status"'* ]] && sleep 1
      if [[ $ids == *'"agent_guard_status"'* ]] &&
        definitions=$(/usr/bin/curl -sf --max-time 5 "$url/experimental/tool?directory=${session// /%20}/check-project&provider=agent-guard&model=agent-guard" 2>/dev/null); then
        readiness=$(print -r -- "$definitions" | /usr/bin/jq -r '[.[] | select(.id == "agent_guard_status") | .description] | first // ""' 2>/dev/null) || readiness=
        [[ $readiness == *'[agent-guard:ready]'* ]] && ready=1
      fi
      if (( ready && ! staged )); then
        permission_at=$(/bin/date +%s)
        permission_report=$(/usr/bin/curl -sf --max-time 5 "$url/agent?directory=${session// /%20}/check-project" 2>/dev/null |
          /usr/bin/jq -c '{agents:.,sessions:[]}' |
          /usr/bin/jq -c --arg scope global --arg outside '/agent-guard-external-probe/*' --argjson observed "$(( permission_at * 1000 ))" -f "$profile_dir/permissions.jq" 2>/dev/null) || permission_report=
      fi
      opencode_check_stop
      msgs=$(/usr/bin/sed -n 's/^data: //p' "$events" 2>/dev/null |
        /usr/bin/jq -rR 'fromjson? | select(.payload.type == "session.error") | .payload.properties.error.data.message // empty' 2>/dev/null) || true
      logs=$(<"$out") || true
      failed=(${(M)${(f)msgs}:#(Failed to install plugin |Failed to load plugin |Plugin )*}
              ${${(M)${(f)logs}:#*message=\"failed to load plugin\" *}#*message=\"failed to load plugin\" })
      /bin/rm -f "$out" "$events"
      # The installer's checks set AGENT_GUARD_GATE=1. There the other plugins are
      # the user's configuration: their failures are warnings, so they cannot roll
      # back an install or update. The guard's own plugin must load in every mode.
      local sev=FAIL
      [[ ${AGENT_GUARD_GATE:-} == 1 && $ready == 1 ]] && sev=warn
      if [[ $ids != *'"agent_guard_status"'* ]]; then print "FAIL plugins not loaded in OpenCode$label"; ok=0
      elif (( ! ready )); then print "FAIL Guard readiness degraded or unverified in OpenCode$label"; record 'agent-guard-stage:plugin-readiness'; ok=0
      elif (( listening && ! $#failed )); then print "ok   plugins loaded in OpenCode$label"
      else
        print "ok   guard plugin loaded in OpenCode$label"
        (( listening )) || { print "$sev cannot read OpenCode's events to check its plugins$label"; [[ $sev == warn ]] || ok=0 }
      fi
      for f in $failed; do
        [[ $f == 'Failed to install plugin '* ]] && f+="; check the package source and the cache's Guard List permissions"
        print -r -- "$sev plugin not loaded in OpenCode$label: $f"
        [[ $sev == warn ]] || ok=0
      done
      if (( ready && ! staged )); then
        if [[ -n $permission_report ]] && print -r -- "$permission_report" | /usr/bin/jq -e '.availability == "observed"' >/dev/null 2>&1; then
          print -r -- "$permission_report" | /usr/bin/jq -r '.agents[] | select(.agent == "build" or .agent == "plan" or .agent == "explore")
            | (if .probes.externalDirectory.action != "allow" or .probes.bashGitStatus.action != "allow" or (.agent == "explore" and .editToolVisible) or (.agent == "plan" and .probes.ordinaryEdit.action != "deny") then "warn" else "ok  " end)
              + " permissions global " + .agent + ": external_directory=" + .probes.externalDirectory.action + "; ordinary_edit=" + .probes.ordinaryEdit.action
              + "; planning_edit=" + .probes.planningEdit.action + "; bash_git_status=" + .probes.bashGitStatus.action + "; source=host-resolved (origin unknown)"'
        else
          print 'warn global effective permissions unverified (unsupported host response)'
        fi
        print 'note OpenCode client/desktop auto-approval mode is not observable from the server'
      fi
      fi
    else
      print "skip plugin check (opencode CLI not found)"
    fi
    # A desktop upgrade can leave a different major version on PATH. Probe its
    # bundled backend as well; a CLI pass does not establish desktop readiness.
    local bundled=
    if find_app && [[ -x $REPLY/Contents/Resources/opencode-cli ]]; then
      bundled="$REPLY/Contents/Resources/opencode-cli"
      if [[ ${bundled:A} != ${${cli:-}:A} ]]; then
        opencode_major "$bundled"
        if [[ $REPLY == 2 ]]; then
          label=' (desktop bundled CLI)'
          opencode_check_v2 "$bundled"
        fi
      fi
    fi
    # Live only: OpenCode Guard's plugin would enforce its own rules next to this one.
    if (( ! staged )); then
      local old="$home/.config/opencode/plugins/opencode-guard.js"
      if [[ ! -e $old && ! -L $old ]] || within "${old:A}" "$engine/releases"; then
        print "ok   one guard plugin"
      else
        print "warn OpenCode Guard's plugin is also in ~/.config/opencode/plugins"
      fi
      # OpenCode may download ripgrep into its writable cache when it is absent.
      if whence -p rg >/dev/null || [[ -x ${cache_prefix}opencode/bin/rg ]]; then
        print "ok   ripgrep found"
      else
        print -r -- "warn ripgrep is not on PATH or in ${cache_prefix}opencode/bin; OpenCode may download it if that cache is writable"
      fi
      # After a migration: OpenCode Guard's shim paths, while present, link to Agent Guard's shims.
      if [[ -f $engine/state/migration.json ]]; then
        local f p found=0 bad=0
        for f in opencode opencode-gui; do
          p="$home/Library/Application Support/OpenCodeGuard/bin/$f"
          [[ -e $p || -L $p ]] || continue
          found=1
          [[ -L $p && $(/usr/bin/readlink -- "$p") == "$engine/bin/$f" ]] || bad=1
        done
        if (( bad )); then print "FAIL forwarders do not point to Agent Guard"; ok=0
        elif (( found )); then print "ok   forwarders point to Agent Guard"
        fi
      fi
    fi
}

opencode_check_v2() {
  local cli=$1 out="$engine/state/.serve.$$" pid url= result= plugins= query i
  local password="agent-guard-probe-$$-$RANDOM-$RANDOM" sev=FAIL
  /bin/mkdir -p "$session/check-project"
  query=$(/usr/bin/jq -rn --arg p "$session/check-project" '$p|@uri')
  AGENT_GUARD_SANDBOXED=1 AGENT_GUARD_RELEASE=${release:t} OPENCODE_PASSWORD=$password \
    $scope $sandbox -D GUI=0 "$cli" serve --hostname 127.0.0.1 --port 0 > "$out" 2>&1 &
  pid=$!
  opencode_check_started $pid
  for i in {1..60}; do
    kill -0 $pid 2>/dev/null || break
    url=$(/usr/bin/grep -o 'http://127\.0\.0\.1:[0-9]*' "$out" 2>/dev/null | head -1) || true
    if [[ -n $url ]]; then
      result=$(/usr/bin/curl -sf --max-time 5 -u "opencode:$password" -H 'Content-Type: application/json' \
        -d '{"input":{}}' "$url/api/rpc/agent-guard/status?location%5Bdirectory%5D=$query" 2>/dev/null) && break
    fi
    sleep 0.25
  done
  if print -r -- "$result" | /usr/bin/jq -e '.output | .state=="active" and .sandbox.result=="confined" and .safetyNet.hooksReady==true' >/dev/null 2>&1; then
    print "ok   Guard readiness in OpenCode V2$label"
    [[ ${AGENT_GUARD_GATE:-} == 1 ]] && sev=warn
    plugins=$(/usr/bin/curl -sf --max-time 5 -u "opencode:$password" "$url/api/plugin?location%5Bdirectory%5D=$query" 2>/dev/null) || plugins=
    if ! print -r -- "$plugins" | /usr/bin/jq -e '.data | type=="array" and all(.[]; .state.status=="active")' >/dev/null 2>&1; then
      print "$sev configured plugins failed or unverified in OpenCode V2$label"
      [[ $sev == warn ]] || ok=0
    else
      print "ok   plugins loaded in OpenCode V2$label"
    fi
    if (( ! staged )); then
      permission_report=$(/usr/bin/curl -sf --max-time 5 -u "opencode:$password" -H 'Content-Type: application/json' \
        -d '{"input":{}}' "$url/api/rpc/agent-guard/permissions?location%5Bdirectory%5D=$query" 2>/dev/null | /usr/bin/jq -c .output) || permission_report=
      if print -r -- "$permission_report" | /usr/bin/jq -e '.availability=="observed"' >/dev/null 2>&1; then
        print -r -- "$permission_report" | /usr/bin/jq -r '.agents[] | select(.agent=="build" or .agent=="plan" or .agent=="explore")
          | "note permissions global V2 " + .agent + ": external_directory=" + .probes.externalDirectory.action + "; ordinary_edit=" + .probes.ordinaryEdit.action + "; planning_edit=" + .probes.planningEdit.action + "; shell_git_status=" + .probes.bashGitStatus.action'
      else
        print 'warn global V2 effective permissions unverified'
      fi
      print 'note OpenCode V2 private probe; shared service and desktop approval mode are not attested'
    fi
  else
    print "FAIL Guard readiness degraded or unverified in OpenCode V2$label"
    record 'agent-guard-stage:plugin-readiness'
    ok=0
  fi
  opencode_check_stop
  /bin/rm -f "$out"
}

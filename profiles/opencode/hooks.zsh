# OpenCode-specific setup and the plugin-load check.

# State roots: OpenCode's cache root, XDG_CACHE_HOME, else ~/.cache. OpenCode
# (xdg-basedir) treats an empty XDG_CACHE_HOME as unset. A value that is not an
# existing folder named by its full path refuses the launch, so a relocated
# package store is never left unprotected. The default root follows the launch's
# own, because ~/.cache is writable in every launch. cache_given holds the roots as
# named, cache_roots their canonical forms, the launch's first.
opencode_state_roots() {
  local given=${XDG_CACHE_HOME:-}
  [[ -z $given || ( $given == /* && -d $given ) ]] ||
    fail "XDG_CACHE_HOME must name an existing folder by its full path, or be unset: $given"
  cache_given=(${given:+${given:a}} "$home/.cache")
  cache_roots=(${cache_given:A})
}

opencode_prepare() {
oc="$home/.config/opencode"
/bin/mkdir -p "$oc"
[[ -e $oc/.gitignore ]] || print -l node_modules package.json package-lock.json bun.lock .gitignore > "$oc/.gitignore"
[[ -e $oc/config.json || -e $oc/opencode.json || -e $oc/opencode.jsonc ]] || print -r -- '{"$schema": "https://opencode.ai/config.json"}' > "$oc/opencode.json"

}
opencode_check() {
    # check staged replaces the global config folder with one inside the release
    # whose only plugin links to the release's plugin.js, so the live plugin is
    # not loaded. ~/.opencode is still read.
    local -a scope=()
    local label=
    if (( staged )); then
      scope=(/usr/bin/env -u OPENCODE_CONFIG -u OPENCODE_CONFIG_DIR -u OPENCODE_CONFIG_CONTENT
             "XDG_CONFIG_HOME=$profile_dir/check-config")
      label=' (staged)'
    fi
    if next_cli; then
      # OpenCode loads the configured plugins at the first request for a folder.
      # It reports a plugin that fails to install, resolve or import as an event,
      # and one whose init fails only in its log, so the check listens to both.
      out="$engine/state/.serve.$$" events="$engine/state/.events.$$"
      AGENT_GUARD_SANDBOXED=1 AGENT_GUARD_RELEASE=${release:t} $scope $sandbox -D GUI=0 "$REPLY" serve --print-logs --log-level ERROR --hostname 127.0.0.1 --port $(( 20000 + RANDOM % 30000 )) > "$out" 2>&1 &
      pid=$!
      print -r -- $pid > "$engine/state/.serve.pid"
      ids= epid= listening=0
      local -a failed
      for i in {1..40}; do
        kill -0 $pid 2>/dev/null || break
        url=$(/usr/bin/grep -o 'http://127\.0\.0\.1:[0-9]*' "$out" 2>/dev/null | head -1) || true
        if [[ -n $url && -z $epid ]]; then
          /usr/bin/curl -sN "$url/global/event" > "$events" 2>/dev/null &
          epid=$!
          for j in {1..20}; do /usr/bin/grep -q '"server.connected"' "$events" 2>/dev/null && { listening=1; break }; sleep 0.1; done
          sleep 0.2
        fi
        [[ -n $url ]] && ids=$(/usr/bin/curl -sf --max-time 5 "$url/experimental/tool/ids?directory=${darwin_temp// /%20}" 2>/dev/null) &&
          [[ $ids == *'"agent_guard_status"'* ]] && break
        sleep 0.5
      done
      # Plugin errors are published in the background; give them a moment.
      [[ $ids == *'"agent_guard_status"'* ]] && sleep 1
      if [[ -n $epid ]]; then kill $epid 2>/dev/null || true; wait $epid 2>/dev/null || true; fi
      kill $pid 2>/dev/null || true
      wait $pid 2>/dev/null || true
      msgs=$(/usr/bin/sed -n 's/^data: //p' "$events" 2>/dev/null |
        /usr/bin/jq -rR 'fromjson? | select(.payload.type == "session.error") | .payload.properties.error.data.message // empty' 2>/dev/null) || true
      logs=$(<"$out") || true
      failed=(${(M)${(f)msgs}:#(Failed to install plugin |Failed to load plugin |Plugin )*}
              ${${(M)${(f)logs}:#*message=\"failed to load plugin\" *}#*message=\"failed to load plugin\" })
      /bin/rm -f "$out" "$events" "$engine/state/.serve.pid"
      # The installer's checks set AGENT_GUARD_GATE=1. There the other plugins are
      # the user's configuration: their failures are warnings, so they cannot roll
      # back an install or update. The guard's own plugin must load in every mode.
      local sev=FAIL
      [[ ${AGENT_GUARD_GATE:-} == 1 && $ids == *'"agent_guard_status"'* ]] && sev=warn
      if [[ $ids != *'"agent_guard_status"'* ]]; then print "FAIL plugins not loaded in OpenCode$label"; ok=0
      elif (( listening && ! $#failed )); then print "ok   plugins loaded in OpenCode$label"
      else
        print "ok   guard plugin loaded in OpenCode$label"
        (( listening )) || { print "$sev cannot read OpenCode's events to check its plugins$label"; [[ $sev == warn ]] || ok=0 }
      fi
      for f in $failed; do
        [[ $f == 'Failed to install plugin '* ]] && f+="; install it outside the guard (Agent Guard's README, Maintenance outside the guard)"
        print -r -- "$sev plugin not loaded in OpenCode$label: $f"
        [[ $sev == warn ]] || ok=0
      done
    else
      print "skip plugin check (opencode CLI not found)"
    fi
    # Live only: OpenCode Guard's plugin would enforce its own rules next to this one.
    if (( ! staged )); then
      local old="$home/.config/opencode/plugins/opencode-guard.js"
      if [[ ! -e $old && ! -L $old ]] || within "${old:A}" "$engine/releases"; then
        print "ok   one guard plugin"
      else
        print "FAIL OpenCode Guard's plugin is also in ~/.config/opencode/plugins"
        ok=0
      fi
      # OpenCode's grep and glob tools need ripgrep, and cannot download it into
      # the write-protected bin.
      if whence -p rg >/dev/null || [[ -x ${cache_prefix}opencode/bin/rg ]]; then
        print "ok   ripgrep found"
      else
        print -r -- "warn ripgrep is not on PATH or in ${cache_prefix}opencode/bin, so OpenCode's grep and glob tools fail; install it outside the guard (Agent Guard's README, Maintenance outside the guard)"
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

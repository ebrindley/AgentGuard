# OpenCode-specific setup and the plugin-load check.
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
      out="$engine/state/.serve.$$"
      AGENT_GUARD_SANDBOXED=1 AGENT_GUARD_RELEASE=${release:t} $scope $sandbox -D GUI=0 "$REPLY" serve --hostname 127.0.0.1 --port $(( 20000 + RANDOM % 30000 )) > "$out" 2>&1 &
      pid=$!
      print -r -- $pid > "$engine/state/.serve.pid"
      ids=
      for i in {1..40}; do
        kill -0 $pid 2>/dev/null || break
        url=$(/usr/bin/grep -o 'http://127\.0\.0\.1:[0-9]*' "$out" 2>/dev/null | head -1) || true
        [[ -n $url ]] && ids=$(/usr/bin/curl -sf --max-time 5 "$url/experimental/tool/ids?directory=${darwin_temp// /%20}" 2>/dev/null) &&
          [[ $ids == *'"agent_guard_status"'* ]] && break
        sleep 0.5
      done
      kill $pid 2>/dev/null || true
      wait $pid 2>/dev/null || true
      /bin/rm -f "$out" "$engine/state/.serve.pid"
      [[ $ids == *'"agent_guard_status"'* ]] && print "ok   plugins loaded in OpenCode$label" || { print "FAIL plugins not loaded in OpenCode$label"; ok=0 }
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

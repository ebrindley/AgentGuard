# OpenCode-specific setup and the unchanged 1.0.3 plugin-load check.
opencode_prepare() {
oc="$home/.config/opencode"
/bin/mkdir -p "$oc"
[[ -e $oc/.gitignore ]] || print -l node_modules package.json package-lock.json bun.lock .gitignore > "$oc/.gitignore"
[[ -e $oc/config.json || -e $oc/opencode.json || -e $oc/opencode.jsonc ]] || print -r -- '{"$schema": "https://opencode.ai/config.json"}' > "$oc/opencode.json"

}
opencode_check() {
    if next_cli; then
      out="$engine/state/.serve.$$"
      AGENT_GUARD_SANDBOXED=1 $sandbox -D GUI=0 "$REPLY" serve --hostname 127.0.0.1 --port $(( 20000 + RANDOM % 30000 )) > "$out" 2>&1 &
      pid=$!
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
      /bin/rm -f "$out"
      [[ $ids == *'"agent_guard_status"'* ]] && print "ok   plugins loaded in OpenCode" || { print "FAIL plugins not loaded in OpenCode"; ok=0 }
    else
      print "skip plugin check (opencode CLI not found)"
    fi
}

# Grok-specific launch steps, run by engine/launch.

# Paths only a launch can name: the absolute targets of ~/.grok/hooks-paths,
# which Grok loads as hook sources, and the executable with the links it
# resolves through. Each is protected as named and at its resolved target.
grok_protect() {
  local line
  if [[ -r $home/.grok/hooks-paths ]]; then
    while IFS= read -r line || [[ -n $line ]]; do
      line=${line%%[[:space:]]#}
      [[ $line == /* ]] || continue
      protected_paths+=("$line" "${line:A}")
    done < "$home/.grok/hooks-paths"
  fi
  if next_cli; then protected_paths+=("$REPLY" "${REPLY:A}"); fi
  protected=($protected_paths)
}

# The extra step of check: the executable is found and cannot be written, Grok's
# settings cannot be written, and the launch arguments are accepted, which means no
# shared leader is configured and no sandbox profile is requested.
grok_check() {
  local f
  if next_cli; then
    f=$REPLY
    print "ok   Grok executable $f"
    $sandbox -D GUI=0 /usr/bin/touch -c "${f:A}" 2>/dev/null && { print "FAIL Grok executable write allowed"; ok=0 } || print "ok   Grok executable write denied"
  else
    print "FAIL Grok executable not found"; ok=0
  fi
  $sandbox -D GUI=0 /usr/bin/touch "$home/.grok/sandbox.toml" 2>/dev/null && { print "FAIL Grok settings write allowed"; ok=0 } || print "ok   Grok settings write denied"
  if grok_args --version; then print "ok   Grok runs locally: sandbox off, updater off, no shared leader"; else print "FAIL $REPLY"; ok=0; fi
}

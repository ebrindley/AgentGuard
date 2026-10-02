#!/bin/zsh
# Runs the Pi profile's suites: pi-sandbox-guard's vendored suites in profiles/pi,
# the file comparison against pi-sandbox-guard 7ad441f, and the tests of Agent
# Guard's recorded differences. Runs outside any sandbox; requires node.
emulate -L zsh
setopt no_unset pipe_fail
command -v node >/dev/null || { print -ru2 'Node is required'; exit 1 }

source_root=${0:A:h:h}
pi=$source_root/profiles/pi
# The launcher accepts only the per-user temp folder or /private/tmp as TMPDIR.
export TMPDIR=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
fails=0

suite() {
  local name=$1 out rc
  local -a summary
  shift
  out=$("$@" 2>&1)
  rc=$?
  if (( rc == 0 )); then
    summary=(${(M)${(f)out}:#*(passed,|FAILED of|OK:|failure\(s\))*})
    print -r -- "ok   $name${summary:+: ${summary[1]}}"
  else
    print -r -- "FAIL $name (exit $rc)"
    print -r -- "$out" | /usr/bin/sed 's/^/     /'
    fails=$((fails + 1))
  fi
}

# The analyzer appends each flagged command to $HOME/.pi/agent/security-events.log.
# Its suites need the account's home (corpus.mjs resolves ~/../.. and ../../../..
# against it), so they run with writes to ~/.pi denied: the appends fail, which the
# analyzer ignores, and the account's log is left alone.
no_pi_writes=(/usr/bin/sandbox-exec -D "PI_HOME=${HOME:A}/.pi" -p '(version 1)(allow default)(deny file-write* (subpath (param "PI_HOME")))')
for t in smoke corpus adapter degraded; do
  suite "profiles/pi/test/$t.mjs" $no_pi_writes node "$pi/test/$t.mjs"
done
suite profiles/pi/test/shim.mjs node "$pi/test/shim.mjs"
suite profiles/pi/scripts/check-launchers.mjs node "$pi/scripts/check-launchers.mjs"
suite profiles/pi/scripts/test-sandbox-profile.sh /usr/bin/env PI_SANDBOX_PROFILE_STRICT=1 /bin/bash "$pi/scripts/test-sandbox-profile.sh"
suite test/pi-files.mjs node "$source_root/test/pi-files.mjs"
suite test/pi-launch.mjs node "$source_root/test/pi-launch.mjs"

print -r -- "$fails failure(s)"
(( fails == 0 ))

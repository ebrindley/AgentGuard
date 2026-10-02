#!/bin/zsh
# Runs the Pi profile's suites: pi-sandbox-guard's vendored suites in profiles/pi,
# the file comparison against pi-sandbox-guard 7ad441f, and the tests of Agent
# Guard's recorded differences. Runs outside any sandbox; requires node.
# profiles/pi/test/shim.mjs runs unchanged: its launch cases run the preamble
# against the account's real home (its fixtures keep the real directory-service
# lookup), so they create ~/.cache/opencode/bin there when it is missing, as they
# create and remove ~/.local/share/pi-sandbox-bindable-* folders.
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
# Four corpus cases must finish within the analyzer's production time limit of 2
# seconds. That depends on the host: an eight-operand rm -rf takes about 1.3 seconds
# on a developer Mac and more than 2 on some GitHub-hosted macOS 26 runners. On
# GitHub Actions the corpus therefore runs from a copy of src and test with each
# case's time limit tripled.
corpus=$pi/test/corpus.mjs
if [[ -n ${GITHUB_ACTIONS:-} ]]; then
  copy=$(/usr/bin/mktemp -d "$TMPDIR/pi-corpus.XXXXXX") &&
    /bin/cp -R "$pi/src" "$pi/test" "$copy/" &&
    /usr/bin/jq '(.. | objects | select(has("timeoutMs")) | .timeoutMs) |= . * 3' \
      "$pi/test/corpus/corpus.json" > "$copy/test/corpus/corpus.json" || { print -ru2 'cannot copy the corpus'; exit 1 }
  corpus=$copy/test/corpus.mjs
  print -r -- "note profiles/pi/test/corpus.mjs runs from $copy with time limits tripled"
fi
for t in smoke corpus adapter degraded; do
  f=$pi/test/$t.mjs
  [[ $t == corpus ]] && f=$corpus
  suite "profiles/pi/test/$t.mjs" $no_pi_writes node "$f"
done
suite profiles/pi/test/shim.mjs node "$pi/test/shim.mjs"
suite profiles/pi/scripts/check-launchers.mjs node "$pi/scripts/check-launchers.mjs"
suite profiles/pi/scripts/test-sandbox-profile.sh /usr/bin/env PI_SANDBOX_PROFILE_STRICT=1 /bin/bash "$pi/scripts/test-sandbox-profile.sh"
suite test/pi-files.mjs node "$source_root/test/pi-files.mjs"
suite test/pi-launch.mjs node "$source_root/test/pi-launch.mjs"

print -r -- "$fails failure(s)"
(( fails == 0 ))

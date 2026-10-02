# The Pi checks of agent-guard doctor (docs/DESIGN.md section 11, Commands).
# Sourced by agent-guard, which sets home, engine and release.
#
# What pi-sandbox-guard's status.sh and check-path.sh checked, against the current
# release's profiles/pi copies instead of a checkout, plus the profile self-test,
# the analyzer and a --version start of each runtime through ~/.local/bin.

# Loads the installed extension as Pi does and asks it about one allowed and one
# blocked command. argv: the extension folder and a working folder.
pi_doctor_analyzer_js='
import { pathToFileURL } from "node:url";
const [ext, cwd] = process.argv.slice(1);
const core = await import(pathToFileURL(`${ext}/src/guard-core.mjs`).href);
const adapter = await import(pathToFileURL(`${ext}/src/index.mjs`).href);
const preflight = await core.preflight();
let handler;
adapter.default({
  isToolCallEventType: (name, event) => name === event.toolName,
  on: (event, fn) => { if (event === "tool_call") handler = fn; },
});
const verdict = async (command) =>
  (await handler({ toolName: "bash", input: { command, cwd } }, { cwd }))?.block === true ? "block" : "allow";
console.log(JSON.stringify({ preflight, allow: await verdict("ls -la"), block: await verdict("rm -rf /") }));
'

# pi_doctor [--json]: prints one ok, FAIL or skip line per check; with --json it
# prints nothing and sets REPLY to status.sh --json's fields. pi_lines holds the
# lines either way. Returns 1 when a check failed. drift counts what status.sh
# counted: installed files, links, the checker Node, wrappers and relocation
# variables; a stale binding fails the doctor but is not drift.
pi_doctor() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local cur="$engine/current" bin="$home/.local/bin" ext="$home/.pi/agent/extensions/pi-sandbox-guard"
  local conf="$home/.config/pi-sandbox-guard/executables.conf" wrec="$engine/state/wrappers.json"
  local scripts="$release/profiles/pi/scripts" checker= state=unbound pi_rec= omp_rec= node_rec=
  local p rel rt label rec out err want sum work darwin_temp l rid= rg= rl= match=absent
  local -a names lines wnames
  local -A where
  integer json=0 failed=0 drift=0 guard_present=0 launchers_present=0 rc
  typeset -ga pi_lines
  pi_lines=()
  [[ ${1:-} == --json ]] && json=1

  # Installed files: the launcher copies, the profile and preamble beside them, and
  # the extension.
  [[ -d $ext ]] && guard_present=1
  [[ -f $bin/pi-sandbox.sb || -f $bin/pi || -f $bin/omp ]] && launchers_present=1
  for p rel in "$bin/pi" launchers/pi "$bin/omp" launchers/pi \
      "$bin/pi-sandbox.sb" sandbox/pi-sandbox.sb "$bin/pi-sandbox-preamble.zsh" sandbox/pi-sandbox-preamble.zsh \
      "$ext/index.ts" scripts/extension-entry.ts "$ext/src/index.mjs" src/index.mjs \
      "$ext/src/guard-core.mjs" src/guard-core.mjs "$ext/src/validate-bash-command.sh" src/validate-bash-command.sh; do
    if [[ ! -f $cur/profiles/pi/$rel ]]; then pi_doctor_say "FAIL the current release has no profiles/pi/$rel" drift
    elif [[ -L $p ]]; then pi_doctor_say "FAIL ${p/#$home/~} is a link, not a copy of profiles/pi/$rel" drift
    elif [[ ! -f $p ]]; then pi_doctor_say "FAIL ${p/#$home/~} is missing" drift
    elif ! /usr/bin/cmp -s -- "$p" "$cur/profiles/pi/$rel"; then pi_doctor_say "FAIL ${p/#$home/~} differs from the release's profiles/pi/$rel" drift
    elif [[ $rel == launchers/* && ! -x $p ]]; then pi_doctor_say "FAIL ${p/#$home/~} is not executable" drift
    else pi_doctor_say "ok   ${p/#$home/~} matches the release"
    fi
  done
  # Agent Guard's PATH block reaches the launchers through these links.
  for rt in pi omp; do
    p="$engine/bin/$rt"
    if [[ -L $p && ${p:A} == ${bin:A}/$rt ]]; then pi_doctor_say "ok   ${p/#$home/~} links to ~/.local/bin/$rt"
    else pi_doctor_say "FAIL ${p/#$home/~} does not link to ~/.local/bin/$rt" drift
    fi
  done
  # check-path.sh: each entry point and each recorded wrapper resolves to its copy
  # in ~/.local/bin in a login shell, asked once for all names. This also catches an
  # npm update that puts a real pi back in ~/.local/bin.
  [[ -f $wrec ]] && wnames=(${(f)"$(/usr/bin/jq -r '.wrappers | objects | keys[]' "$wrec" 2>/dev/null)"})
  wnames=(${(M)wnames:#[A-Za-z0-9._-]##})
  out=$(pi_doctor_bounded 20 /usr/bin/env "HOME=$home" /bin/zsh -lc \
    'for n; do print -r -- "agent-guard-resolve:$n:$(command -v -- $n)"; done' zsh pi omp $wnames 2>/dev/null) || out=
  for l in ${(M)${(f)out}:#agent-guard-resolve:*}; do
    l=${l#agent-guard-resolve:}
    where[${l%%:*}]=${l#*:}
  done
  for rt in pi omp $wnames; do
    [[ -n ${where[$rt]:-} ]] || where[$rt]=$(command -v -- $rt 2>/dev/null) || where[$rt]=
  done
  pi_doctor_resolves pi 'the guard'
  pi_doctor_resolves omp 'the guard'

  # The checker Node, validated as deploy-local.sh and the launcher validate it.
  p="$ext/.guard-node"
  if [[ ! -f $p ]]; then
    pi_doctor_say "FAIL checker Node: ${p/#$home/~} is missing; record it with agent-guard bind --checker-node" drift
  else
    { IFS= read -r out < "$p" } 2>/dev/null || true
    if [[ $out != /* ]]; then pi_doctor_say "FAIL checker Node in ${p/#$home/~} is not an absolute path: $out" drift
    elif [[ ! -x ${out:A} || -d ${out:A} ]]; then pi_doctor_say "FAIL checker Node $out is not an executable file; record one with agent-guard bind --checker-node" drift
    elif pi_doctor_write_root "$out" || pi_doctor_write_root "${out:A}"; then pi_doctor_say "FAIL checker Node $out is inside a sandbox-writable root" drift
    else checker=$out; pi_doctor_say "ok   checker Node: $out"
    fi
  fi

  # Bindings, with status.sh's states: bind --check decides, and only when a Pi
  # binding is recorded. The checker Node's folder goes first on PATH because bind
  # resolves paths with node.
  if [[ -f $conf ]]; then
    pi_rec=$(/usr/bin/sed -n 's/^[[:space:]]*pi[[:space:]]*=[[:space:]]*//p' "$conf" | /usr/bin/head -1)
    omp_rec=$(/usr/bin/sed -n 's/^[[:space:]]*omp[[:space:]]*=[[:space:]]*//p' "$conf" | /usr/bin/head -1)
    node_rec=$(/usr/bin/sed -n 's/^[[:space:]]*node[[:space:]]*=[[:space:]]*//p' "$conf" | /usr/bin/head -1)
  fi
  if [[ -z $pi_rec ]]; then
    pi_doctor_say "skip bindings: no Pi binding recorded in ${conf/#$home/~}"
  elif out=$(pi_doctor_bind --check 2>&1); then
    state=ok
    pi_doctor_say "ok   bindings valid: pi=$pi_rec${omp_rec:+, omp=$omp_rec}${node_rec:+, node=$node_rec}"
  else
    rc=$?
    state=stale
    err=${(j:; :)${${(M)${(f)out}:#invalid: *}#invalid: }}
    pi_doctor_say "FAIL bindings stale: ${err:-$(pi_doctor_reason "$out" $rc 0)}; re-record with agent-guard bind"
  fi

  # Custom wrappers: each recorded hash, its execute bits and where its name resolves,
  # and each name removed since that is still executable, as status.sh checked
  # launcher_names_seen.
  if [[ ! -f $wrec ]]; then
    pi_doctor_say "ok   no custom wrappers recorded"
  elif ! out=$(/usr/bin/jq -ce 'select((.wrappers | type) == "object" and (.historical | type) == "array")' "$wrec" 2>/dev/null); then
    pi_doctor_say "FAIL cannot read ${wrec/#$home/~}" drift
  else
    names=(${(f)"$(/usr/bin/jq -r '.wrappers | keys[]' <<< "$out")"})
    (( $#names )) || pi_doctor_say "ok   no custom wrappers recorded"
    for rt in $names; do
      want=$(/usr/bin/jq -r --arg n "$rt" '.wrappers[$n].sha256' <<< "$out")
      p="$bin/$rt"
      if [[ ! -e $p && ! -L $p ]]; then pi_doctor_say "FAIL wrapper ${p/#$home/~} is missing" drift; continue
      elif [[ ! -f $p || -L $p ]] || ! sum=$(/usr/bin/shasum -a 256 -- "$p") || [[ ${sum[1,64]} != "$want" ]]; then
        pi_doctor_say "FAIL wrapper ${p/#$home/~} changed since it was recorded" drift
      elif [[ ! -x $p ]]; then pi_doctor_say "FAIL wrapper ${p/#$home/~} is not executable" drift
      else pi_doctor_say "ok   wrapper ${p/#$home/~} matches its recorded hash"
      fi
      pi_doctor_resolves $rt "~/.local/bin/$rt"
    done
    for rt in ${(f)"$(/usr/bin/jq -r '.historical[]' <<< "$out")"}; do
      p="$bin/$rt"
      [[ -f $p && -x $p ]] && pi_doctor_say "FAIL ${p/#$home/~} was removed as a wrapper but is still executable" drift
    done
  fi

  # Relocation variables: the launcher injects the extension, but a Pi started
  # without it would look for the extension elsewhere.
  if [[ -n ${PI_CODING_AGENT_DIR:-} && $PI_CODING_AGENT_DIR/extensions/pi-sandbox-guard != "$ext" ]]; then
    pi_doctor_say "FAIL PI_CODING_AGENT_DIR is set: a Pi started without the launcher looks for extensions in $PI_CODING_AGENT_DIR/extensions, not ~/.pi/agent/extensions" drift
  fi
  if [[ -n ${PI_PACKAGE_DIR:-} ]]; then
    pi_doctor_say "FAIL PI_PACKAGE_DIR is set: a Pi started without the launcher may take its agent folder from it and miss ~/.pi/agent/extensions" drift
  fi

  # The profile self-test, strict, against the installed profile.
  out=$(pi_doctor_bounded 120 /usr/bin/env PI_SANDBOX_PROFILE_STRICT=1 /bin/bash "$cur/profiles/pi/scripts/test-sandbox-profile.sh" "$bin/pi-sandbox.sb" 2>&1)
  rc=$?
  if (( rc == 0 )); then pi_doctor_say "ok   profile self-test of ~/.local/bin/pi-sandbox.sb"
  else pi_doctor_say "FAIL profile self-test of ~/.local/bin/pi-sandbox.sb: $(pi_doctor_reason "$out" $rc 120)"
  fi

  darwin_temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
  work=$(/usr/bin/mktemp -d "$darwin_temp/agent-guard-doctor.XXXXXX") || { pi_doctor_say "FAIL cannot create a folder in $darwin_temp"; work= }
  if [[ -n $work ]]; then
    /bin/mkdir -p -- "$work/project"
    # The analyzer: preflight, then one allowed and one blocked command through the
    # installed extension, run by the checker Node. HOME is the scratch folder, so
    # the blocked command is not logged in ~/.pi/agent/security-events.log.
    if [[ -z $checker ]]; then
      pi_doctor_say "FAIL analyzer not checked: no usable checker Node"
    else
      out=$(cd "$work/project" && pi_doctor_bounded 60 /usr/bin/env "HOME=$work" "$checker" --input-type=module -e "$pi_doctor_analyzer_js" "$ext" "$work/project" 2>&1)
      rc=$?
      lines=(${(f)out})
      out=${lines[-1]:-}
      if ! /usr/bin/jq -e 'has("preflight") and has("allow") and has("block")' <<< "$out" >/dev/null 2>&1; then
        pi_doctor_say "FAIL analyzer did not run: $(pi_doctor_reason "$out" $rc 60)"
      else
        if /usr/bin/jq -e '.preflight.ok == true' <<< "$out" >/dev/null; then pi_doctor_say "ok   analyzer preflight"
        else pi_doctor_say "FAIL analyzer preflight: $(/usr/bin/jq -r 'if .preflight.scriptPresent != true then "analyzer script missing" else "missing helpers: " + (.preflight.missing | join(", ")) end' <<< "$out")"
        fi
        [[ $(/usr/bin/jq -r .allow <<< "$out") == allow ]] && pi_doctor_say "ok   the installed extension allows ls -la" ||
          pi_doctor_say "FAIL the installed extension blocks ls -la"
        [[ $(/usr/bin/jq -r .block <<< "$out") == block ]] && pi_doctor_say "ok   the installed extension blocks rm -rf /" ||
          pi_doctor_say "FAIL the installed extension allows rm -rf /"
      fi
    fi
    # Each runtime through ~/.local/bin, from a scratch project: Pi refuses the home
    # folder as a project. No binding and no CLI is a runtime that is not there.
    for rt label rec in pi Pi "$pi_rec" omp OMP "$omp_rec"; do
      out=$(cd "$work/project" && pi_doctor_bounded 20 /usr/bin/env "PI_PROJECT=$work/project" "$bin/$rt" --version 2>"$work/$rt.err")
      rc=$?
      err=$(<"$work/$rt.err")
      if (( rc == 124 )); then
        pi_doctor_say "FAIL $rt --version through ~/.local/bin/$rt did not finish within 20 seconds"
      elif (( rc == 0 )); then
        lines=(${(f)out})
        pi_doctor_say "ok   $rt --version through ~/.local/bin/$rt: ${lines[1]:-no output}"
      elif [[ -z $rec && $err == *"cannot auto-resolve the real $label executable"* ]]; then
        pi_doctor_say "skip $rt --version: no $label binding and no $label CLI found"
      elif [[ $err == *'no longer usable'* ]]; then
        lines=(${(M)${(f)err}:#*no longer usable*})
        err=$lines[1]
        pi_doctor_say "FAIL $rt --version: ${err#\[pi-sandbox-guard\] }; re-record it with agent-guard bind"
      else
        pi_doctor_say "FAIL $rt --version through ~/.local/bin/$rt exited $rc: $(pi_doctor_reason "$err" $rc 20)"
      fi
    done
    /bin/rm -rf -- "$work"
  fi

  # status.sh --json's fields. Both components come from the current release.
  [[ -f $cur/RELEASE ]] && rid=$(<"$cur/RELEASE")
  (( guard_present )) && rg=$rid
  (( launchers_present )) && rl=$rid
  if [[ -n $rg && -n $rl ]]; then match=match
  elif [[ -n $rg || -n $rl ]]; then match=partial drift=1
  elif (( guard_present || launchers_present )); then drift=1
  fi
  REPLY=$(/usr/bin/jq -cn --argjson gp $guard_present --argjson lp $launchers_present --arg rm $match \
    --arg rg "$rg" --arg rl "$rl" --arg rb $state --arg pp "$pi_rec" --arg op "$omp_rec" --argjson d $drift \
    '{guard_present: $gp, launchers_present: $lp, release_match: $rm, guard_release_id: $rg, launchers_release_id: $rl,
      runtime_binding: $rb, pi_binding: $rb, pi_binding_path: $pp, omp_binding_path: $op, drift: $d}')
  return $failed
}

# pi_doctor_say LINE [drift]: records LINE, prints it unless --json, and counts a
# FAIL line, as drift too when the second argument says so.
pi_doctor_say() {
  pi_lines+=("$1")
  (( json )) || print -r -- "$1"
  if [[ $1 == FAIL* ]]; then
    failed=1
    [[ ${2:-} == drift ]] && drift=1
  fi
  return 0
}

# pi_doctor_resolves NAME WHAT: NAME resolved to ~/.local/bin/NAME in the login
# shell; WHAT names that in the line.
pi_doctor_resolves() {
  local r=${where[$1]:-} p="$bin/$1"
  if [[ -z $r ]]; then pi_doctor_say "FAIL $1 is not on PATH in a login shell"
  elif [[ $r == /* && ${r:A} == ${p:A} ]]; then pi_doctor_say "ok   $1 resolves to $2 in a login shell ($r)"
  else pi_doctor_say "FAIL $1 resolves to $r in a login shell, not to $2; put ~/.local/bin before the real binaries in PATH"
  fi
}

# pi_doctor_reason OUTPUT STATUS LIMIT: the last "Error:" line of OUTPUT, else its
# last line that is not the indented second line of a launcher message, else the
# status.
pi_doctor_reason() {
  local -a l=(${(f)1}) e
  e=(${(M)l:#Error: *})
  l=(${l:#\[pi-sandbox-guard\]  *})
  if (( $2 == 124 )); then print -r -- "did not finish within $3 seconds"
  elif (( $#e )); then print -r -- "${e[-1]#Error: }"
  elif (( $#l )); then print -r -- "${l[-1]#\[pi-sandbox-guard\] }"
  else print -r -- "exit $2"
  fi
}

# lib-ops.sh's rule, as status.sh applies it to the checker Node.
pi_doctor_write_root() {
  /bin/bash -c '. "$1" && ops_path_is_known_sandbox_write_root "$2" "$3"' _ "$scripts/lib-ops.sh" "$1" "$home"
}

pi_doctor_bind() {
  local p=$PATH
  [[ -n $checker ]] && p="${checker:h}:$PATH"
  /usr/bin/env -u PI_SANDBOX_CONFIG_DIR -u PI_SANDBOX_SHIM -u OMP_SANDBOX_SHIM "HOME=$home" "PATH=$p" \
    /bin/bash "$scripts/bind-executable.sh" "$@"
}

# pi_doctor_bounded SECONDS CMD...: CMD's status, or 124 when it runs longer.
pi_doctor_bounded() {
  integer limit=$(( $1 * 10 )) i=0 pid
  shift
  "$@" </dev/null &
  pid=$!
  while kill -0 $pid 2>/dev/null; do
    if (( ++i > limit )); then
      /usr/bin/pkill -KILL -P $pid 2>/dev/null
      kill -KILL $pid 2>/dev/null
      wait $pid 2>/dev/null
      return 124
    fi
    /bin/sleep 0.1
  done
  wait $pid
}

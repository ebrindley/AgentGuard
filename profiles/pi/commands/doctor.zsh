# The Pi checks of agent-guard doctor (docs/DESIGN.md section 11, Commands).
# Sourced by agent-guard, which sets home, engine and release, through the Pi
# harness's doctor entry after loading the installer (ag_bounded).
#
# What pi-sandbox-guard's status.sh and check-path.sh checked, against the current
# release's profiles/pi copies instead of a checkout, plus the profile self-test,
# the command checker and a --version start of each runtime through ~/.local/bin.

# Loads the installed extension as Pi does and asks it about one allowed command and
# two blocked ones. The extension blocks every call, with its reason, when the
# session copy, cc-safety-net's Pi entry or Agent Guard's Git rules are unavailable.
# argv: the extension folder, a working folder and a scratch folder for the audit log.
pi_doctor_checker_js='
import { pathToFileURL } from "node:url";
const [ext, cwd] = process.argv.slice(1);
const adapter = await import(pathToFileURL(`${ext}/src/index.mjs`).href);
let handler;
adapter.default({ on: (event, fn) => { if (event === "tool_call") handler = fn; } });
// The extension clears CC_SAFETY_NET_AUDIT_HOME while it starts, before its first
// await; point the audit log at the doctor'"'"'s scratch folder after that, so the probe
// leaves ~/.cc-safety-net/logs alone.
process.env.CC_SAFETY_NET_AUDIT_HOME = process.argv[3];
const verdict = async (command) => {
  const r = await handler({ type: "tool_call", toolName: "bash", input: { command, cwd } }, { cwd });
  return { block: r?.block === true, reason: String(r?.reason ?? "") };
};
console.log(JSON.stringify({
  allow: await verdict("ls -la"),
  root: await verdict("rm -rf /"),
  hooks: await verdict("git config core.hooksPath agent-guard-probe"),
}));
'

# pi_doctor [--json]: prints one ok, FAIL or skip line per check; with --json it
# prints nothing and sets REPLY to status.sh --json's fields. pi_lines holds the
# lines either way. Returns 1 when a check failed. drift counts what status.sh
# counted: installed files, links, wrappers and relocation variables; a stale
# binding fails the doctor but is not drift.
pi_doctor() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local cur="$engine/current" bin="$home/.local/bin" ext="$home/.pi/agent/extensions/pi-sandbox-guard"
  local conf="$home/.config/pi-sandbox-guard/executables.conf" wrec="$engine/state/wrappers.json"
  local scripts="$release/profiles/pi/scripts" jsnode= state=unbound pi_rec= omp_rec= node_rec=
  local p rel rt label rec out err want sum sev work darwin_temp l rid= rg= rl= match=absent copy= sdir=
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
      "$ext/index.ts" scripts/extension-entry.ts "$ext/src/index.mjs" src/index.mjs; do
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
  out=$(ag_bounded 20 /usr/bin/env "HOME=$home" /bin/zsh -lc \
    'for n; do print -r -- "agent-guard-resolve:$n:$(command -v -- $n)"; done' zsh pi omp $wnames 2>/dev/null) || out=
  for l in ${(M)${(f)out}:#agent-guard-resolve:*}; do
    l=${l#agent-guard-resolve:}
    where[${l%%:*}]=${l#*:}
  done
  pi_doctor_resolves pi 'the guard'
  pi_doctor_resolves omp 'the guard'

  # The recorded bindings, with status.sh's states: bind --check decides, and only
  # when a Pi or OMP binding is recorded. A Node for bind and for the checker below
  # comes first on PATH because bind resolves paths with node.
  # Read as the launcher reads them (ag_pi_conf_get).
  ag_pi_conf_get pi; pi_rec=$REPLY
  ag_pi_conf_get omp; omp_rec=$REPLY
  ag_pi_conf_get node; node_rec=$REPLY
  ag_pi_js_node "$release" && jsnode=$REPLY
  if [[ -z $pi_rec && -z $omp_rec ]]; then
    pi_doctor_say "skip bindings: no Pi binding recorded in ${conf/#$home/~}"
  elif out=$(pi_doctor_bind --check 2>&1); then
    state=ok
    lines=(${pi_rec:+pi=$pi_rec} ${omp_rec:+omp=$omp_rec} ${node_rec:+node=$node_rec})
    pi_doctor_say "ok   bindings valid: ${(j:, :)lines}"
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
      elif [[ ! -f $p || -L $p ]] || ! sum=$(/usr/bin/shasum -a 256 -- "$p"); then
        pi_doctor_say "FAIL wrapper ${p/#$home/~} changed since it was recorded" drift
      elif [[ ${${sum#\\}[1,64]} != "$want" ]]; then
        # The installer's checks set AGENT_GUARD_GATE=1. Sessions cannot write a
        # recorded wrapper, so new content is the owner's edit, and rolling back
        # would not remove it: there it is a warning.
        sev=FAIL
        [[ ${AGENT_GUARD_GATE:-} == 1 ]] && sev=warn
        pi_doctor_say "$sev wrapper ${p/#$home/~} changed since it was recorded; if intentional, record it again with agent-guard wrapper add ~/.local/bin/$rt" drift
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
  out=$(ag_bounded 120 /usr/bin/env PI_SANDBOX_PROFILE_STRICT=1 /bin/bash "$cur/profiles/pi/scripts/test-sandbox-profile.sh" "$bin/pi-sandbox.sb" 2>&1)
  rc=$?
  if (( rc == 0 )); then pi_doctor_say "ok   profile self-test of ~/.local/bin/pi-sandbox.sb"
  else pi_doctor_say "FAIL profile self-test of ~/.local/bin/pi-sandbox.sb: $(pi_doctor_reason "$out" $rc 120)"
  fi

  darwin_temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
  work=$(/usr/bin/mktemp -d "$darwin_temp/agent-guard-doctor.XXXXXX") || { pi_doctor_say "FAIL cannot create a folder in $darwin_temp"; work= }
  if [[ -n $work ]]; then
    /bin/mkdir -p -- "$work/project"
    # The checker: the release's session copy builder over the account's
    # cc-safety-net configuration, then one allowed and two blocked commands through
    # the installed extension, run by a Node, which loads cc-safety-net's Pi entry
    # from the release with the copy. The copy is built in the engine's write-protected
    # state, where the extension requires it, and removed after.
    rid= copy= sdir=
    [[ -f $cur/RELEASE ]] && rid=$(<"$cur/RELEASE")
    if [[ ! -f $cur/checker/snapshot.zsh ]]; then
      pi_doctor_say "FAIL the current release has no checker/snapshot.zsh"
    elif [[ -z $rid ]]; then
      pi_doctor_say "FAIL the current release has no RELEASE file"
    elif ! /bin/mkdir -p -- "$engine/state/pi" || ! sdir=$(/usr/bin/mktemp -d "$engine/state/pi/doctor.XXXXXXXX"); then
      sdir=
      pi_doctor_say "FAIL cannot create a checker session folder in ${engine/#$home/~}/state/pi"
    else
      out=$( exec 2>&1; source "$cur/checker/snapshot.zsh" && ag_checker_snapshot "$home" "$sdir/checker" "$cur" standard; rc=$?
             print -r -- "${ag_checker_warning:-}"; exit $rc )
      rc=$?
      lines=(${(f)out})
      if (( rc )); then
        pi_doctor_say "FAIL the checker's session copy cannot be built${lines[-1]:+: ${lines[-1]}}; fix ~/.cc-safety-net/rules/rule.json (npx cc-safety-net doctor lists the problem)"
      else
        copy=$sdir
        pi_doctor_say "ok   the checker's session copy is built from ~/.cc-safety-net"
        [[ -n ${lines[-1]:-} ]] && pi_doctor_say "skip ${lines[-1]}"
      fi
    fi
    if [[ -n $copy ]]; then
      if [[ -z $jsnode ]]; then
        pi_doctor_say "skip the installed extension not asked about commands: no usable node on PATH to load it"
      else
        out=$(cd "$work/project" && ag_bounded 60 /usr/bin/env -u CC_SAFETY_NET_WORKTREE -u SAFETY_NET_WORKTREE -u CC_SAFETY_NET_AUDIT_HOME \
          -u CC_SAFETY_NET_LEVEL "HOME=$home" "CC_SAFETY_NET_HOME=$copy/checker" "AGENT_GUARD_RELEASE=$rid" PI_SANDBOX_PROFILE_DIGEST=doctor \
          "$jsnode" --input-type=module -e "$pi_doctor_checker_js" "$ext" "$work/project" "$sdir/audit" 2>&1)
        rc=$?
        lines=(${(f)out})
        out=${lines[-1]:-}
        if ! /usr/bin/jq -e 'has("allow") and has("root") and has("hooks")' <<< "$out" >/dev/null 2>&1; then
          pi_doctor_say "FAIL the installed extension did not run: $(pi_doctor_reason "${(F)lines}" $rc 60)"
        elif [[ $(/usr/bin/jq -r .allow.block <<< "$out") == true ]]; then
          pi_doctor_say "FAIL the installed extension blocks ls -la: $(/usr/bin/jq -r '.allow.reason | split("\n")[0]' <<< "$out")"
        else
          pi_doctor_say "ok   the installed extension allows ls -la"
          [[ $(/usr/bin/jq -r .root.block <<< "$out") == true ]] && pi_doctor_say "ok   the installed extension blocks rm -rf /" ||
            pi_doctor_say "FAIL the installed extension allows rm -rf /"
          if /usr/bin/jq -e '.hooks.block == true and (.hooks.reason | contains("agent-guard-git"))' <<< "$out" >/dev/null; then
            pi_doctor_say "ok   the installed extension blocks git config core.hooksPath by Agent Guard's Git rules"
          else
            pi_doctor_say "FAIL Agent Guard's Git rules are not in force: git config core.hooksPath is not blocked by them"
          fi
        fi
      fi
    fi
    [[ -n $sdir ]] && /bin/rm -rf -- "$sdir"
    # Each runtime through ~/.local/bin, from a scratch project: Pi refuses the home
    # folder as a project. No binding and no CLI is a runtime that is not there.
    for rt label rec in pi Pi "$pi_rec" omp OMP "$omp_rec"; do
      out=$(cd "$work/project" && ag_bounded 20 /usr/bin/env "PI_PROJECT=$work/project" "$bin/$rt" --version 2>"$work/$rt.err")
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
  # The caller's PATH is not what a guarded launch uses, so it is no evidence.
  if (( ! ${+where[$1]} )); then pi_doctor_say "skip $1 not checked: the login shell gave no answer"
  elif [[ -z $r ]]; then pi_doctor_say "FAIL $1 is not on PATH in a login shell"
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

pi_doctor_bind() {
  local p=$PATH
  [[ -n $jsnode ]] && p="${jsnode:h}:$PATH"
  /usr/bin/env -u PI_SANDBOX_CONFIG_DIR -u PI_SANDBOX_SHIM -u OMP_SANDBOX_SHIM "HOME=$home" "PATH=$p" \
    /bin/bash "$scripts/bind-executable.sh" "$@"
}

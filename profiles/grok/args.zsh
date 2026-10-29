# Grok's launch arguments (docs/DESIGN.md section 3, Grok), shared by
# engine/launch and engine/peers.zsh.
#
# grok_args ARG...: sets reply to the arguments to run Grok with, and exports the
# environment that goes with them, or sets REPLY to the reason and fails.
# Agent Guard is Grok's only sandbox, so Grok runs with --sandbox off. A resumed
# session keeps the profile it was saved with and Grok refuses a different one;
# the saved profile is read here to say so first.
grok_args() {
  emulate -L zsh
  setopt no_unset extended_glob
  local h=${home:-$HOME} arg prev= pending= id= saved= f real=${home:-$HOME}/.grok/bin/grok
  integer literal=0 resume=0 cont=0
  # Options that take a value in Grok's --help (-w and -r take an optional one).
  local value_options='--add-dir|--agent|--agents|--allow|--allowedTools|--allowed-tools|--cwd|--debug-file|--deny|--disallowedTools|--disallowed-tools|--json-schema|--leader-socket|-m|--model|--max-turns|--output-format|-p|--prompt|--single|--permission-mode|--prompt-file|--prompt-json|--reasoning-effort|--rules|-s|--session-id|--system-prompt-override|--tools|--worktree-ref|-w|--worktree'
  local -a out found
  # The executable to run directly: the one the installer recorded, which is a
  # kept copy when Grok has no install folder.
  f=$h/Library/Application\ Support/AgentGuard/state/grok-executable
  [[ -r $f ]] && f=$(<"$f") && [[ $f == /* && -x $f ]] && real=$f
  reply=()
  if [[ ${GROK_SANDBOX:-off} != off ]]; then
    REPLY="Grok cannot apply the sandbox profile '$GROK_SANDBOX' inside Agent Guard; unset GROK_SANDBOX"
    return 1
  fi
  if [[ -n ${GROK_HOME:-} && ${GROK_HOME:A} != ${h:A}/.grok ]]; then
    REPLY="GROK_HOME is set to $GROK_HOME; Agent Guard protects ~/.grok only, so unset GROK_HOME"
    return 1
  fi
  for f in "$h/.grok/config.toml" "$h/.grok/managed_config.toml"; do
    if [[ -r $f ]] && /usr/bin/grep -Eqs '^[[:space:]]*use_leader[[:space:]]*=[[:space:]]*true' "$f"; then
      REPLY="use_leader is true in $f, which would send work to a shared Grok leader outside Agent Guard; set it to false outside Agent Guard"
      return 1
    fi
  done
  for arg in "$@"; do
    if (( literal )); then out+=("$arg"); continue; fi
    case $pending in
      (sandbox)
        pending=
        [[ $arg == off ]] || { REPLY="Grok cannot apply the sandbox profile '$arg' inside Agent Guard"; return 1 }
        continue ;;
      (resume)
        pending=
        if [[ $arg != -* ]]; then id=$arg; out+=("$arg"); continue; fi ;;
      (value)
        # The value of an option that takes one is data, whatever it says; an
        # argument that starts with a dash is still read as an option.
        pending=
        if [[ $arg != -* ]]; then out+=("$arg"); prev=$arg; continue; fi ;;
    esac
    # A subcommand can follow global options, so every argument before -- that is
    # not the value of an option from grok --help is checked, and one that equals a
    # subcommand name is refused (an option missing from the list can hide one).
    case $arg in
      (update|login|logout)
        REPLY="grok $arg changes Grok's installed files or account and cannot run in Agent Guard; run it outside, as $real $arg"
        return 1 ;;
      (start|restart|resume)
        if [[ $prev == workspace ]]; then
          REPLY="grok workspace $arg starts a daemon that outlives the session; run it outside Agent Guard, as $real workspace $arg"
          return 1
        fi
        out+=("$arg") ;;
      (--) literal=1; out+=("$arg") ;;
      (--sandbox) pending=sandbox ;;
      (${~value_options}) pending=value; out+=("$arg") ;;
      (--sandbox=*)
        [[ ${arg#*=} == off ]] || { REPLY="Grok cannot apply the sandbox profile '${arg#*=}' inside Agent Guard"; return 1 } ;;
      (--leader)
        REPLY='Grok cannot use a shared leader inside Agent Guard; its tools would run outside the guard'
        return 1 ;;
      (-r|--resume) resume=1; pending=resume; out+=("$arg") ;;
      (--resume=*) resume=1; id=${arg#*=}; out+=("$arg") ;;
      (-c|--continue) cont=1; out+=("$arg") ;;
      (*) out+=("$arg") ;;
    esac
    prev=$arg
  done
  if [[ $pending == sandbox ]]; then REPLY='--sandbox requires a value'; return 1; fi
  if (( resume && ${#id} )) && [[ $id == [0-9a-fA-F]##-[0-9a-fA-F-]## ]]; then
    found=("$h"/.grok/sessions/*/$id/summary.json(N[1]))
  elif (( cont )); then
    found=("$h/.grok/sessions/$(/usr/bin/jq -rn --arg p "${PWD:A}" '$p | @uri')"/*/summary.json(Nom[1]))
  fi
  (( $#found )) && saved=$(/usr/bin/jq -r '.sandbox_profile // empty' "${found[1]}" 2>/dev/null) || saved=
  if [[ -n $saved && $saved != off ]]; then
    REPLY="that Grok session was saved with the sandbox profile '$saved' and a resumed session keeps it, but Agent Guard runs Grok with --sandbox off; start a new session"
    return 1
  fi
  # Grok documents a flag for local execution only on `grok agent`.
  if [[ ${out[1]:-} == agent && ${out[(Ie)--no-leader]} == 0 ]]; then
    out=(agent --no-leader "${(@)out[2,-1]}")
  fi
  export GROK_SANDBOX=off GROK_DISABLE_AUTOUPDATER=1
  reply=(--sandbox off "${out[@]}")
}

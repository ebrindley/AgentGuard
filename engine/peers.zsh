# Peer commands keep their native approvals and use the enclosing OS sandbox.
agent_guard_peer() {
  emulate -L zsh
  setopt no_unset extended_glob
  local root=$1 name=$2 target= d arg value previous= active=0 daemon=0 sandbox=0
  shift 2
  local -a search args=("$@")
  search=("${(@s/:/)${AGENT_GUARD_PEER_PATH:-$PATH}}" "$HOME/.local/bin" "$HOME/.npm-global/bin" "$HOME/bin" "$HOME/.opencode/bin" /opt/homebrew/bin /usr/local/bin)
  for d in $search; do
    [[ -x $d/$name && ! -d $d/$name ]] || continue
    target=${d}/${name}
    [[ ${target:A} == ${root:A}/* || ${target:A} == "$HOME/Library/Application Support/AgentGuard"/* ||
       ${target:A} == "$HOME/Library/Application Support/OpenCodeGuard"/* ]] && { target=; continue; }
    break
  done
  [[ -n $target ]] || { print -ru2 -- "agent-guard: $name not found"; return 127; }
  if [[ ${AGENT_GUARD_SANDBOXED:-} == 1 || ${PI_SANDBOX_SHIM_ACTIVE:-} == 1 ]] &&
     ! /usr/bin/sandbox-exec -p '(version 1)(allow default)' /usr/bin/true 2>/dev/null; then
    active=1
  fi
  (( active )) || { exec "$target" "${args[@]}"; }
  for arg in "${args[@]}"; do
    [[ $arg == -- ]] && break
    case $name:$arg in
      codex:--remote|codex:--remote=*|opencode:--attach|opencode:--attach=*)
        print -ru2 -- "agent-guard: $name must execute locally inside the parent sandbox"
        return 2 ;;
      codex:--sandbox|codex:-s|cursor-agent:--sandbox|grok:--sandbox)
        previous=sandbox; continue ;;
      codex:--sandbox=*|cursor-agent:--sandbox=*|grok:--sandbox=*)
        value=${arg#*=} ;;
      codex:--config|codex:-c) previous=config; continue ;;
      codex:--no-daemon) daemon=1; continue ;;
      codex:--config=*|codex:-c?*)
        value=${arg#--config=}; [[ $arg == -c* ]] && value=${arg#-c}
        value=${value//[[:space:]]/}
        [[ $value == sandbox_mode=* ]] || continue
        value=${${value#*=}//[\"\']/} ;;
      *)
        if [[ $previous == sandbox ]]; then value=$arg
        elif [[ $previous == config ]]; then
          value=${arg//[[:space:]]/}
          [[ $value == sandbox_mode=* ]] || { previous=; continue; }
          value=${${value#*=}//[\"\']/}
        else previous=; continue; fi ;;
    esac
    previous=
    if [[ $value != (danger-full-access|disabled|off) ]]; then
      print -ru2 -- "agent-guard: $name cannot apply '$value' inside the parent sandbox"
      return 2
    fi
    [[ $arg != *sandbox_mode* ]] && sandbox=1
  done
  if [[ $name == opencode && ${args[1]:-} == attach ]]; then
    print -ru2 -- 'agent-guard: OpenCode must execute locally inside the parent sandbox'; return 2
  fi
  case $name in
    codex)
      local -a prefix
      (( daemon )) || prefix+=(--no-daemon)
      (( sandbox )) || prefix+=(--sandbox danger-full-access)
      exec "$target" "${prefix[@]}" "${args[@]}" ;;
    claude)
      # This overlay changes only Bash sandboxing; permissions and hooks still load.
      local settings='{"sandbox":{"enabled":false}}' setting= pending=0 literal=0
      local -a forwarded
      for arg in "${args[@]}"; do
        if (( literal )); then forwarded+=("$arg"); continue; fi
        if [[ $arg == -- ]] && (( ! pending )); then literal=1; forwarded+=("$arg"); continue; fi
        if [[ $arg == --settings ]]; then pending=1; continue; fi
        if (( pending )) || [[ $arg == --settings=* ]]; then
          setting=$arg; [[ $arg == --settings=* ]] && setting=${arg#*=}
          if [[ -f $setting ]]; then
            settings=$(/usr/bin/jq -ce 'if .sandbox.enabled == true then error("inner sandbox") else .sandbox.enabled=false end' "$setting" 2>/dev/null)
          else
            settings=$(print -rn -- "$setting" | /usr/bin/jq -ce 'if .sandbox.enabled == true then error("inner sandbox") else .sandbox.enabled=false end' 2>/dev/null)
          fi
          if [[ $? != 0 ]]; then
            print -ru2 -- 'agent-guard: Claude settings must be valid JSON without an explicit inner sandbox'; return 2
          fi
          pending=0; continue
        fi
        forwarded+=("$arg")
      done
      (( pending )) && { print -ru2 -- 'agent-guard: --settings requires a value'; return 2; }
      export DISABLE_AUTOUPDATER=1
      exec "$target" --settings "$settings" "${forwarded[@]}" ;;
    cursor-agent)
      (( sandbox )) && exec "$target" "${args[@]}"
      exec "$target" --sandbox disabled "${args[@]}" ;;
    grok)
      if [[ ${GROK_SANDBOX:-off} != off ]]; then
        print -ru2 -- 'agent-guard: Grok cannot apply an explicit inner sandbox'; return 2
      fi
      (( sandbox )) && exec "$target" "${args[@]}"
      exec "$target" --sandbox off "${args[@]}" ;;
    opencode) exec "$target" "${args[@]}" ;;
  esac
}

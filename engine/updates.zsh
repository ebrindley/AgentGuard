# Shared release lookup and startup offer. Callers supply the account-derived
# home and engine paths, and run this before starting the confined agent.
older() {
  local -a a b
  integer i
  a=("${(@s:.:)${1#v}}") b=("${(@s:.:)${2#v}}")
  for i in {1..$(( $#a > $#b ? $#a : $#b ))}; do
    [[ ${a[i]:-0} == <-> && ${b[i]:-0} == <-> ]] || return 1
    (( ${a[i]:-0} < ${b[i]:-0} )) && return 0
    (( ${a[i]:-0} > ${b[i]:-0} )) && return 1
  done
  return 1
}

# Read GitHub's latest-release redirect without downloading or executing code.
# Only the numeric stable tags understood by the version comparison are offered.
ag_update_latest() {
  local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')
  local redirect tag
  redirect=$(/usr/bin/curl -q -fsS $curl_proto --connect-timeout 2 --max-time 2 -o /dev/null -w '%{redirect_url}' -- "$repo/releases/latest" 2>/dev/null) || return 1
  [[ $redirect == "$repo/releases/tag/"* ]] || return 1
  tag=${redirect#"$repo/releases/tag/"}
  [[ $tag == v<->(.<->)# ]] || return 1
  REPLY=$tag
}

# 0: a newer stable tag in REPLY; 1: no comparable newer release; 2: lookup failed.
ag_update_available() {
  local installed
  installed=$(/usr/bin/jq -er '.tag | strings' "$engine/state/stamp.json" 2>/dev/null) || return 2
  [[ $installed == v<->(.<->)# ]] || return 1
  ag_update_latest || return 2
  older "$installed" "$REPLY"
}

# MODE TITLE RESTART ARG...; a successful upgrade execs RESTART exactly once.
# A failed check is optional; a failed accepted installation ends this launch.
ag_update_startup() {
  emulate -L zsh
  setopt no_unset extended_glob
  local mode=$1 title=$2 tag installed answer= rc=0
  shift 2
  if [[ ${AGENT_GUARD_UPDATE_RESTART:-} == 1 ]]; then
    unset AGENT_GUARD_UPDATE_RESTART
    return 0
  fi
  [[ ${AGENT_GUARD_GATE:-} != 1 ]] || return 0
  for answer in "$@"; do
    [[ $answer != (--help|--version|-h|-v) ]] || return 0
  done
  answer=
  [[ ! -r $engine/state/update-check || $(<"$engine/state/update-check") != off ]] || return 0
  ag_update_available || return 0
  tag=$REPLY
  installed=$(/usr/bin/jq -r .tag "$engine/state/stamp.json" 2>/dev/null) || return 0
  if [[ $mode == gui ]]; then
    answer=$(/usr/bin/osascript -e 'on run argv' -e 'button returned of (display dialog (item 1 of argv) buttons {"Later", "Upgrade"} default button "Later" cancel button "Later" with title "Agent Guard")' -e 'end run' \
      "Agent Guard ${tag#v} is available (installed: ${installed#v}). Upgrade before starting $title? This may take a minute; Agent Guard will restart automatically." 2>/dev/null) || return 0
    [[ $answer == Upgrade ]] || return 0
  else
    print -ru2 -- "agent-guard: ${tag#v} is available (installed: ${installed#v})."
    [[ -t 0 && -t 2 ]] || return 0
    print -nu2 -- "Upgrade before starting $title? [y/N] "
    IFS= read -r answer || return 0
    [[ $answer == (y|Y|yes|YES) ]] || return 0
  fi
  if [[ $mode == gui ]]; then
    "$engine/current/bin/agent-guard" update --to "$tag" --no-prompt > "$home/Agent Guard/last-update.log" 2>&1 || rc=$?
  else
    "$engine/current/bin/agent-guard" update --to "$tag" --no-prompt || rc=$?
  fi
  (( rc == 0 )) || return 1
  if [[ $mode == gui ]]; then
    /usr/bin/osascript -e 'display notification "AgentGuard updated. Restarting…" with title "Agent Guard"' >/dev/null 2>&1 || true
  else
    print -ru2 -- 'AgentGuard updated. Restarting…'
  fi
  export AGENT_GUARD_UPDATE_RESTART=1
  exec "$@"
}

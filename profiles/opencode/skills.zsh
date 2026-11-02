# Automatic roots and checker policy use the account-derived home and frozen
# Guard List. Editable descendants never become independent write grants.
opencode_skill_scope() {
  local p=$1 r best= kind=none
  for r in $deny; do within "$p" "$r" && { REPLY=deny; return; }; done
  for r in $allow; do
    if within "$p" "$r" && (( ${#r} >= ${#best} )); then best=$r; kind=allow; fi
  done
  for r in $user_readonly; do
    if within "$p" "$r" && (( ${#r} >= ${#best} )); then best=$r; kind=readonly; fi
  done
  REPLY=$kind
}

opencode_skill_safe() {
  local p=$1 r
  [[ -d ${p:h} || ! -e $p ]] || return 1
  for r in $essential $sensitive "$home"/{Desktop,Documents,Downloads,Pictures,Movies,Music}; do
    within "$r" "$p" && return 1
  done
  for r in "$engine" "$home/Agent Guard" "$home/Library/Application Support/OpenCodeGuard" \
           "$home/.cc-safety-net" "$home/Library/LaunchAgents" "$home/Applications/Agent Guard.app"; do
    within "$p" "${r:A}" && return 1
  done
  for r in $pi_guard $protected_targets; do
    (( ${skill_configs[(Ie)$r]} )) && continue
    within "$p" "${r:A}" && return 1
  done
  [[ ! -e $p || -d $p ]]
}

opencode_skill_parents() {
  local p=${1:h}
  while [[ ! -e $p && $p != / ]]; do
    opencode_skill_scope "$p"
    [[ $REPLY != (deny|readonly) ]] || return 1
    p=${p:h}
  done
}

opencode_skill_globals() {
  local p q a
  skill_roots=() skill_pins=() skill_configs=() config_roots=()
  for p in "$home/.config/opencode" "$home/.opencode" "$home/.claude/skills" "$home/.agents/skills"; do
    q=${p:A}
    for a in "$p" "$q"; do
      while [[ $a != / && $a != "$home" ]]; do skill_pins+=("$a"); a=${a:h}; done
    done
    if [[ -L $p && ! -e $p ]] || ! opencode_skill_safe "$q"; then
      note "refused automatic OpenCode root: $p"; continue
    fi
    if [[ $p == "$home/.config/opencode" || $p == "$home/.opencode" ]]; then
      config_roots+=("$q"); skill_configs+=("$q")
    else
      skill_roots+=("$q")
    fi
    # Only the automatic root itself is initialized outside Seatbelt. Its entry
    # and both ancestor chains remain pinned on every launch, including absence.
    opencode_skill_scope "$q"
    if [[ $REPLY != (deny|readonly) && $staged == 0 ]] && opencode_skill_parents "$q"; then
      /bin/mkdir -p -- "$q"
    fi
  done
  # The pinned bootstrap container may be absent in an existing installation.
  p="$home/.config/opencode/plugins"
  opencode_skill_scope "${p:A}"
  if [[ $staged == 0 && $REPLY != (deny|readonly) && -d ${p:h} && ! -e $p && ! -L $p ]]; then
    /bin/mkdir -- "$p"
  fi
}

# The shared legacy rule remains available to old releases and other CLIs.
# New sessions get real copies: the checker's scoped reader rejects symlinks. The
# builder is the release's, shared with every harness that has a checker; this
# adds OpenCode's automatic deletion allowances.
source "$release/checker/snapshot.zsh"
opencode_checker_snapshot() {
  local session=$1 name target root child
  local -a content_roots=($skill_roots) deletion_roots
  for root in $config_roots; do
    for child in agent agents command commands mode modes plugin plugins skill skills tool tools themes node_modules; do
      name="$root/$child" target=${name:A}
      # A mutable link may only name already-granted content, never a new root.
      within "$target" "$root" && content_roots+=("$name")
    done
  done
  for name in $content_roots; do
    opencode_skill_scope "$name"
    [[ $REPLY == (deny|readonly) ]] || deletion_roots+=("$name")
  done
  ag_checker_snapshot "$home" "$session/checker" "$release" "$CC_SAFETY_NET_LEVEL" $deletion_roots || {
    [[ -z $ag_checker_warning ]] || note "$ag_checker_warning"
    return 1
  }
  if [[ -n $ag_checker_warning ]]; then
    preparation_status=warning
    note "$ag_checker_warning"
  fi
}

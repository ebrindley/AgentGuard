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
# New sessions get real copies: the checker's scoped reader rejects symlinks.
opencode_checker_snapshot() {
  local session=$1 source="$home/.cc-safety-net" dest="$session/checker" name spec file
  /bin/mkdir -p -- "$dest/rules"
  if [[ -f $source/rules/rule.json ]]; then
    /bin/cp -L -- "$source/rules/rule.json" "$dest/rules/rule.json" || return 1
    /usr/bin/jq -e 'type == "object" and ((.rules // []) | type == "array")' "$dest/rules/rule.json" >/dev/null || return 1
    for spec in ${(f)"$(/usr/bin/jq -r '(.rules // [])[] | select(type == "string")' "$dest/rules/rule.json")"}; do
      name=$spec
      [[ $spec == */*\#*/* ]] && name=${spec:t}
      [[ $name == [A-Za-z][A-Za-z0-9_-]# ]] || { note "unsupported checker rule source: $name"; return 1; }
      file="$source/rules/$name/rulebook.json"
      [[ -e $file ]] || continue
      /bin/mkdir -p -- "$dest/rules/$name"
      /bin/cp -L -- "$file" "$dest/rules/$name/rulebook.json" || return 1
      if [[ $name == agent-guard ]]; then
        /usr/bin/jq --slurpfile factory "$profile_dir/templates/cc-safety-net/rules/agent-guard/rulebook.json" '
          if any(.rules[]; . == $factory[0].rules[0]) then
            .rules |= map(select(. != $factory[0].rules[0]))
            | if has("tests") then .tests |= map(select(.rule != "recursive-rm")) else . end
          else . end' "$dest/rules/$name/rulebook.json" > "$dest/rules/$name/.new" &&
          /bin/mv "$dest/rules/$name/.new" "$dest/rules/$name/rulebook.json" || return 1
        if /usr/bin/jq -e '.rules | length == 0' "$dest/rules/$name/rulebook.json" >/dev/null; then
          /usr/bin/jq --arg source "$spec" '.rules -= [$source]' "$dest/rules/rule.json" > "$dest/rules/.new" && /bin/mv "$dest/rules/.new" "$dest/rules/rule.json" || return 1
        fi
      fi
    done
  else
    print -r -- '{"version":1,"rules":[],"overrides":{},"transparent_wrappers":["env","exec","nice","nohup","setsid","stdbuf","time","timeout"]}' > "$dest/rules/rule.json"
  fi
  if [[ -f $source/policy.json ]]; then
    /bin/cp -L -- "$source/policy.json" "$dest/policy.json" || return 1
  else
    print -r -- '{"version":1}' > "$dest/policy.json"
  fi
  # Resolve paranoid_rm with the same preset/override/legacy-flag precedence as
  # cc-safety-net. Explicit allowances in the copied policy are never removed.
  local legacy=${CC_SAFETY_NET_PARANOID_RM-${SAFETY_NET_PARANOID_RM:-}}
  local paranoid=${CC_SAFETY_NET_PARANOID-${SAFETY_NET_PARANOID:-}}
  if ! /usr/bin/jq -e 'type == "object" and ((.destructive_command_protection // {}) | type == "object") and ((.destructive_command_protection.allow_paths // []) | type == "array") and ((.safety // {}) | type == "object") and ((.safety.overrides // {}) | type == "object")' "$dest/policy.json" >/dev/null 2>&1; then
    note "checker policy copied without automatic deletion allowances: $source/policy.json"
    return 0
  fi
  local -a deletion_roots
  local root child target
  local -a content_roots=($skill_roots)
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
  local roots=$(/usr/bin/jq -cn '$ARGS.positional' --args $deletion_roots)
  /usr/bin/jq --arg level "$CC_SAFETY_NET_LEVEL" --arg legacy "${legacy:l}" --arg paranoid "${paranoid:l}" --argjson roots "$roots" '
    if type != "object" then error("checker policy must be an object") else . end
    | ((if ((.safety.overrides // {}) | has("paranoid_rm")) then .safety.overrides.paranoid_rm else ((.safety.level == "paranoid") or ($level == "paranoid")) end)
       or ($legacy == "1" or $legacy == "true") or ($paranoid == "1" or $paranoid == "true")) as $restricted
    | if $restricted then . else
        .destructive_command_protection.allow_paths = (((.destructive_command_protection.allow_paths // []) + $roots) | unique)
      end' "$dest/policy.json" > "$dest/.policy" && /bin/mv "$dest/.policy" "$dest/policy.json" || return 1
}

# The per-session copy of the user's cc-safety-net configuration, shared by every
# harness with a command checker (docs/DESIGN.md section 5, Command checker). A
# launcher calls it outside the sandbox and points CC_SAFETY_NET_HOME at the copy
# in write-protected session state. ~/.cc-safety-net is only read.
#
# ag_checker_snapshot HOME DEST RELEASE LEVEL [ROOT...]
#   HOME     the account home
#   DEST     the folder that becomes CC_SAFETY_NET_HOME; created
#   RELEASE  the release folder: its checker/ holds Agent Guard's Git rulebook and
#            its profiles/opencode/templates hold the factory rulebook to drop
#   LEVEL    the checker level the session runs at (standard or paranoid)
#   ROOT     folders the harness grants deletion allowances for: recursive deletes
#            below them are allowed unless the user's policy is restrictive
# Fails when the copy cannot be built. Sets ag_checker_warning to a sentence when
# policy.json is malformed (the copy then keeps only the dynamic-delete rule and
# has no allowances), or to the reason when it fails on an unsupported rule source.
ag_checker_snapshot() {
  local home=$1 dest=$2 release=$3 level=$4 source="$1/.cc-safety-net" name spec file
  shift 4
  setopt local_options extended_glob
  local -a roots_list=("$@")
  ag_checker_warning=
  /bin/mkdir -p -- "$dest/rules"
  if [[ -f $source/rules/rule.json ]]; then
    /bin/cp -L -- "$source/rules/rule.json" "$dest/rules/rule.json" || return 1
    /usr/bin/jq -e 'type == "object" and ((.rules // []) | type == "array")' "$dest/rules/rule.json" >/dev/null || return 1
    for spec in ${(f)"$(/usr/bin/jq -r '(.rules // [])[] | select(type == "string")' "$dest/rules/rule.json")"}; do
      name=$spec
      [[ $spec == */*\#*/* ]] && name=${spec:t}
      [[ $name == [A-Za-z][A-Za-z0-9_-]# ]] || { ag_checker_warning="unsupported checker rule source: $name"; return 1; }
      file="$source/rules/$name/rulebook.json"
      [[ -e $file ]] || continue
      /bin/mkdir -p -- "$dest/rules/$name"
      /bin/cp -L -- "$file" "$dest/rules/$name/rulebook.json" || return 1
      if [[ $name == agent-guard ]]; then
        /usr/bin/jq --slurpfile factory "$release/profiles/opencode/templates/cc-safety-net/rules/agent-guard/rulebook.json" '
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
  # Agent Guard's Git rules (docs/DESIGN.md section 5, Command checker): the
  # release's copy replaces any rulebook of that name.
  /bin/mkdir -p -- "$dest/rules/agent-guard-git"
  /bin/cp -- "$release/checker/agent-guard-git/rulebook.json" "$dest/rules/agent-guard-git/rulebook.json" || return 1
  /usr/bin/jq '.rules = (((.rules // []) - ["agent-guard-git"]) + ["agent-guard-git"])' "$dest/rules/rule.json" > "$dest/rules/.new" &&
    /bin/mv "$dest/rules/.new" "$dest/rules/rule.json" || return 1
  if [[ -f $source/policy.json ]]; then
    /bin/cp -L -- "$source/policy.json" "$dest/policy.json" || return 1
  else
    print -r -- '{"version":1}' > "$dest/policy.json"
  fi
  # Resolve paranoid_rm with the same preset/override/legacy-flag precedence as
  # cc-safety-net. Explicit allowances in the copied policy are never removed.
  local legacy=${CC_SAFETY_NET_PARANOID_RM-${SAFETY_NET_PARANOID_RM:-}}
  local paranoid=${CC_SAFETY_NET_PARANOID-${SAFETY_NET_PARANOID:-}}
  if ! /usr/bin/jq -e 'type == "object" and ((.destructive_command_protection // {}) | type == "object") and ((.destructive_command_protection.allow_paths // []) | type == "array") and ((.destructive_command_protection.overrides // {}) | type == "object") and ((.safety // {}) | type == "object") and ((.safety.overrides // {}) | type == "object")' "$dest/policy.json" >/dev/null 2>&1; then
    ag_checker_warning="checker policy is malformed; the session keeps the dynamic-delete rule and adds no automatic deletion allowances: $source/policy.json"
    # Without the rule the standard level allows rm -rf "$DIR". The checker ignores a
    # non-object policy and a wrong-typed container, so only the rule is added.
    /usr/bin/jq -s '
      if length == 1 and (.[0] | type) == "object" then .[0]
        | if (.destructive_command_protection | type) == "object" then . else .destructive_command_protection = {} end
        | if (.destructive_command_protection.overrides | type) == "object" then . else .destructive_command_protection.overrides = {} end
        | .destructive_command_protection.overrides |= (. + {"rm.recursive-force-dynamic-target": "on"} + .)
      else error("checker policy must be one object") end' "$dest/policy.json" > "$dest/.policy" 2>/dev/null ||
      print -r -- '{"version":1,"destructive_command_protection":{"overrides":{"rm.recursive-force-dynamic-target":"on"}}}' > "$dest/.policy" || return 1
    /bin/mv "$dest/.policy" "$dest/policy.json" || return 1
    return 0
  fi
  local roots=$(/usr/bin/jq -cn '$ARGS.positional' --args "${roots_list[@]}")
  # Built-in rules decision D13 allows (docs/DESIGN.md section 15), unless the
  # user chose the paranoid level; a rule the user's policy names keeps the
  # user's setting. The standard level allows a recursive force delete of a
  # variable or glob target; the copy keeps that rule on.
  local allowed=$(/usr/bin/jq -cn '$ARGS.positional' --args git.push-delete git.stash-drop git.branch-force-delete git.tag-delete \
    git.merge-abort git.rebase-abort git.checkout-double-dash git.checkout-ref-path git.restore-unstaged git.restore-worktree)
  /usr/bin/jq --arg level "$level" --arg legacy "${legacy:l}" --arg paranoid "${paranoid:l}" --argjson roots "$roots" --argjson allowed "$allowed" '
    if type != "object" then error("checker policy must be an object") else . end
    | ((if ((.safety.overrides // {}) | has("paranoid_rm")) then .safety.overrides.paranoid_rm else ((.safety.level == "paranoid") or ($level == "paranoid")) end)
       or ($legacy == "1" or $legacy == "true") or ($paranoid == "1" or $paranoid == "true")) as $restricted
    | if $restricted then . else
        .destructive_command_protection.allow_paths = (((.destructive_command_protection.allow_paths // []) + $roots) | unique)
      end
    | if (.safety.level == "paranoid") or ($level == "paranoid") then . else
        .destructive_command_protection.overrides = ((($allowed | map({(.): "off"}) | add) + {"rm.recursive-force-dynamic-target": "on"}) + (.destructive_command_protection.overrides // {}))
      end' "$dest/policy.json" > "$dest/.policy" && /bin/mv "$dest/.policy" "$dest/policy.json" || return 1
}

# ag_checker_prune DIR SKIP: removes session folders (named *.XXXXXXXX, as mktemp
# makes them) from DIR that predate the last boot, except SKIP. A nested launch
# inherits its parent's copy and outlives the parent, so no running process can
# be shown not to hold a newer folder; a folder from before the boot has no
# holder. It runs outside the sandbox, in the background, at most once a day.
ag_checker_prune() {
  local dir=$1 skip=$2 d boot mtime
  setopt local_options no_err_exit
  local -a recent
  zmodload zsh/stat 2>/dev/null || return 0
  recent=("$dir"/.session-prune(Nmh-24))
  (( $#recent )) && return 0
  { : > "$dir/.session-prune" } 2>/dev/null || true
  boot=$(/usr/sbin/sysctl -n kern.boottime 2>/dev/null) || return 0
  boot=${${boot#*sec = }%%,*}
  [[ $boot == <-> ]] || return 0
  for d in "$dir"/*.????????(N); do
    [[ -d $d && ! -L $d && $d != "$skip" ]] || continue
    zstat -A mtime +mtime -- "$d" 2>/dev/null || continue
    (( mtime < boot )) || continue
    /bin/rm -rf -- "$d"
  done
}

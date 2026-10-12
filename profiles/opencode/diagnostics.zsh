# Read-only support collection. Never source installer state or run the host.
# All exported strings are enums or validated version identifiers. Stored events
# are advisory input, not trusted enforcement evidence.

ag_diag_size() { # FILE LIMIT: reject unbounded, nonregular or unreadable input
  local bytes
  [[ -f $1 && -r $1 ]] || return 1
  bytes=$(/usr/bin/stat -f %z -- "$1" 2>/dev/null) || return 1
  [[ $bytes == <-> ]] && (( bytes <= $2 ))
}

ag_diag_class() { # PATH: export a logical class, never the path
  case $1 in
    ("$engine"/releases/*) REPLY=release ;;
    ("$engine"/*) REPLY=engine ;;
    ("$home"/.cc-safety-net/*) REPLY=rules ;;
    ("$home"/.config/opencode/*) REPLY=opencode ;;
    ("$home"/.pi/*|"$home"/.local/bin/*) REPLY=pi ;;
    ("$home"/Applications/'Agent Guard.app'/*) REPLY=app ;;
    (*) REPLY=unknown ;;
  esac
}

ag_diag_config() { # FILE: classification only, no permissions or file contents
  local clean kind
  if [[ ! -e $1 && ! -L $1 ]]; then REPLY=absent; return; fi
  if ! ag_diag_size "$1" 1048576; then REPLY=error; return; fi
  kind=$(/usr/bin/jq -rs 'if length != 1 then "error" elif (.[0]|type) == "object" then "json" else "scalar" end' "$1" 2>/dev/null)
  if [[ $kind == (json|scalar) ]]; then REPLY=$kind; return; fi
  # Strip comments lexically, keeping quoted strings intact. This is only a
  # classifier: no write path consumes it, and trailing-comma JSONC is unparsed.
  clean=$(/usr/bin/awk '
    BEGIN { quoted=0; escaped=0; block=0; comments=0 }
    {
      out="";
      for (i=1;i<=length($0);i++) {
        c=substr($0,i,1); n=substr($0,i+1,1);
        if (block) { if (c=="*" && n=="/") { block=0; i++ } continue }
        if (quoted) {
          out=out c;
          if (escaped) escaped=0; else if (c=="\\") escaped=1; else if (c=="\"") quoted=0;
          continue
        }
        if (c=="\"") { quoted=1; out=out c; continue }
        if (c=="/" && n=="/") { comments=1; break }
        if (c=="/" && n=="*") { comments=1; block=1; i++; out=out " "; continue }
        out=out c
      }
      print out
    }
    END { if (!comments || block || quoted) exit 1 }
  ' "$1" 2>/dev/null)
  if (( $? == 0 )) && print -r -- "$clean" | /usr/bin/jq -e -s 'length == 1' >/dev/null 2>&1; then
    REPLY=jsonc_with_comments
  else
    REPLY=error
  fi
}

ag_diagnose() {
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  local stamp="$engine/state/stamp.json" record="$engine/state/permissions.json"
  local events_file="$home/.cc-safety-net/logs/agent-guard-events.json"
  local out p want got installed=unknown version=unknown active=unknown rid=unknown
  local stamp_state=absent consistent=true ownership='[]' ownership_state=absent preference=unspecified preference_state=absent
  local events='[]' event_state=absent latest=null rulebook=absent snapshot='{"state":"absent","observation":"cached"}' snapshot_at
  local configs='[]' label classification klass summary report rel
  local -a rows v config_files config_labels
  local -A files totals missing changed extra link_missing link_changed
  integer bad=0 excluded=0 now=${EPOCHSECONDS:-0}
  now=$(/bin/date +%s)
  for klass in release engine rules opencode pi app unknown; do
    totals[$klass]=0 missing[$klass]=0 changed[$klass]=0 extra[$klass]=0
    link_missing[$klass]=0 link_changed[$klass]=0
  done
  # Restrict identifiers to the installer's release naming scheme. A custom
  # release name is not an export-safe label just because it contains no slash.
  rid=$(/usr/bin/jq -nr --arg v "${release:t}" '$v | if test("^[0-9]+\\.[0-9]+\\.[0-9]+-[0-9]{8}T[0-9]{6}Z$") then . else "unknown" end')
  if [[ -L $engine/current ]]; then
    rel=${engine}/current
    [[ ${rel:A:h} == "$engine/releases" ]] && active=${rel:A:t}
  fi
  if [[ -e $engine/state/opencode-preferences.json || -L $engine/state/opencode-preferences.json ]]; then
    preference_state=error
    if ag_diag_size "$engine/state/opencode-preferences.json" 65536 && /usr/bin/jq -e 'type=="object" and .schemaVersion==1 and (.approvalPreference=="auto" or .approvalPreference=="host")' "$engine/state/opencode-preferences.json" >/dev/null 2>&1; then
      preference=$(/usr/bin/jq -r .approvalPreference "$engine/state/opencode-preferences.json")
      preference_state=valid
    fi
  fi
  active=$(/usr/bin/jq -nr --arg v "$active" '$v | if test("^[0-9]+\\.[0-9]+\\.[0-9]+-[0-9]{8}T[0-9]{6}Z$") then . else "unknown" end')
  if [[ -e $stamp || -L $stamp ]]; then
    stamp_state=error
    if ag_diag_size "$stamp" 2097152 && /usr/bin/jq -e --arg current "$engine/current" --arg bin "$engine/bin" '
        type == "object" and (.files|type)=="object" and (.links|type)=="object"
        and (.files|length)<=10000 and (.links|length)<=1000
        and all(.files|to_entries[]; (.key|test("^[^\\u0000-\\u001f\\u007f]+$")) and (.value|type)=="string" and (.value|test("^[a-f0-9]{64}$")))
        and all(.links|to_entries[]; (.key|test("^[^\\u0000-\\u001f\\u007f]+$")) and (.value|type)=="string" and (.value|test("^[^\\u0000-\\u001f\\u007f]+$")))
        and (.release|type)=="string" and (.release|test("^[0-9]+\\.[0-9]+\\.[0-9]+-[0-9]{8}T[0-9]{6}Z$"))
        and (.version|type)=="string" and (.version|test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))
        and (.version as $v | .release|startswith($v+"-"))
        and (.links|has($current) and has($bin))
      ' "$stamp" >/dev/null 2>&1; then
      stamp_state=valid
      installed=$(/usr/bin/jq -r .release "$stamp") version=$(/usr/bin/jq -r .version "$stamp")
      out=$(/usr/bin/jq -r '.files|to_entries[]|.key,.value' "$stamp")
      v=("${(@f)out}") files=("${(@)v}")
      for p want in "${(@)v}"; do
        ag_diag_class "$p"; klass=$REPLY
        (( totals[$klass]++ ))
        # Never inspect arbitrary paths supplied by a damaged stamp.
        if [[ $klass == unknown || $p != ${p:a} ]]; then (( excluded++ )); continue; fi
        if [[ ! -f $p ]]; then (( missing[$klass]++ )); continue; fi
        got=$(/usr/bin/shasum -a 256 -- "$p" 2>/dev/null)
        [[ ${got[1,64]} == "$want" ]] || (( changed[$klass]++ ))
      done
      for p in "$engine/releases/$installed"/**/*(.DN); do
        (( ${+files[$p]} )) || (( extra[release]++ ))
      done
      out=$(/usr/bin/jq -r '.links|to_entries[]|.key,.value' "$stamp")
      v=("${(@f)out}")
      for p want in "${(@)v}"; do
        ag_diag_class "$p"; klass=$REPLY
        if [[ $klass == unknown || $p != ${p:a} ]]; then (( excluded++ )); continue; fi
        if [[ ! -L $p ]]; then (( link_missing[$klass]++ ))
        else
          got=$(/usr/bin/readlink -- "$p" 2>/dev/null)
          [[ $got == "$want" ]] || (( link_changed[$klass]++ ))
        fi
      done
    fi
  fi
  [[ $stamp_state == valid && $active == "$installed" && $rid == "$installed" ]] || bad=1
  rows=()
  for klass in release engine rules opencode pi app unknown; do
    (( missing[$klass] + changed[$klass] + extra[$klass] + link_missing[$klass] + link_changed[$klass] )) && bad=1
    rows+=("$klass:$totals[$klass]:$missing[$klass]:$changed[$klass]:$extra[$klass]:$link_missing[$klass]:$link_changed[$klass]")
  done
  (( excluded )) && bad=1
  summary=$(/usr/bin/jq -cn '[ $ARGS.positional[] | split(":") | {class:.[0], files:(.[1]|tonumber), missing:(.[2]|tonumber), changed:(.[3]|tonumber), extra:(.[4]|tonumber), linksMissing:(.[5]|tonumber), linksChanged:(.[6]|tonumber)} ]' --args "${rows[@]}")

  config_files=("$home/.config/opencode/config.json" "$home/.config/opencode/opencode.json" "$home/.config/opencode/opencode.jsonc")
  config_labels=(global_legacy_json global_json global_jsonc)
  integer i
  for i in {1..3}; do
    ag_diag_config "$config_files[$i]"; classification=$REPLY label=$config_labels[$i]
    configs=$(/usr/bin/jq -cn --argjson a "$configs" --arg label "$label" --arg c "$classification" '$a + [{source:$label, classification:$c, observation:"static_file"}]')
  done
  if [[ -e $record || -L $record ]]; then
    ownership_state=error
    if ag_diag_size "$record" 1048576 && /usr/bin/jq -e 'type=="object"' "$record" >/dev/null 2>&1; then
      ownership_state=valid
      # Recognize only managed files/keys. No patterns or original values leave
      # the collector, including operator-supplied identifiers and agent names.
      for i in {1..3}; do
        out=$(/usr/bin/jq -c --arg f "$config_files[$i]" --arg s "$config_labels[$i]" '
          .[$f] | if type!="object" then [] else
          [to_entries[] | select(.key=="edit" or .key=="bash" or .key=="external_directory")
            | select((.value|type)=="object" and (.value|has("wrote")))
            | {source:$s, key:.key, action:(if .key=="edit" then
                (if (.value.orig=="ask" or (if (.value.orig|type)=="object" then any(.value.orig[]; .=="ask") else false end)) then "retirement_requires_choice" else "retirement_pending" end)
              else "managed" end)}] end' "$record" 2>/dev/null) || out='[]'
        if ag_diag_size "$config_files[$i]" 1048576 && /usr/bin/jq -e 'type=="object" and ((.permission // {})|type)=="object"' "$config_files[$i]" >/dev/null 2>&1; then
          out=$(/usr/bin/jq -cn --argjson entries "$out" --arg f "$config_files[$i]" --slurpfile ledger "$record" --slurpfile config "$config_files[$i]" '$entries|map(. as $e | if $config[0].permission[$e.key] == $ledger[0][$f][$e.key].wrote then . else .action="user_modified_preserved" end)')
        else
          out=$(/usr/bin/jq -cn --argjson entries "$out" '$entries|map(.action="ownership_not_verifiable")')
        fi
        ownership=$(/usr/bin/jq -cn --argjson a "$ownership" --argjson b "$out" '$a+$b')
      done
    fi
  fi
  # The launcher publishes a last-launch snapshot, not live process health.
  if [[ -e $engine/state/rules.json || -L $engine/state/rules.json ]]; then
    snapshot='{"state":"error","observation":"cached"}'
    if ag_diag_size "$engine/state/rules.json" 1048576 && /usr/bin/jq -e 'type=="object" and (.allow|type)=="array" and (.readonly|type)=="array" and (.deny|type)=="array"' "$engine/state/rules.json" >/dev/null 2>&1; then
      snapshot_at=$(/usr/bin/stat -f %m -- "$engine/state/rules.json" 2>/dev/null)
      [[ $snapshot_at == <-> ]] || snapshot_at=0
      snapshot=$(/usr/bin/jq -c --argjson at "$snapshot_at" --argjson now "$now" '{state:"available", observation:"cached", preparationStatus:(.preparationStatus|if .=="ready" or .=="warning" then . else "unknown" end), timestamp:($at*1000), ageSeconds:([$now-$at,0]|max), readiness:"not_probed"}' "$engine/state/rules.json")
    fi
  fi
  if [[ -e $home/.cc-safety-net/rules/agent-guard/rulebook.json ]]; then
    rulebook=error
    ag_diag_size "$home/.cc-safety-net/rules/agent-guard/rulebook.json" 1048576 &&
      /usr/bin/jq -e 'type=="object"' "$home/.cc-safety-net/rules/agent-guard/rulebook.json" >/dev/null 2>&1 && rulebook=json
  fi
  if [[ -e $events_file || -L $events_file ]]; then
    event_state=error
    if ag_diag_size "$events_file" 65536 && /usr/bin/jq -e 'type=="object" and .schemaVersion==1 and .advisory==true and (.events|type)=="array" and (.events|length)<=64' "$events_file" >/dev/null 2>&1; then
      event_state=cached
      events=$(/usr/bin/jq -c --argjson now "$now" '
        def enum($xs): . as $v | if ($xs|index($v))!=null then $v else "unknown" end;
        [.events[-32:][] | select(type=="object") | {
          timestamp:(.timestamp | if type=="number" and .>=0 and .<=($now*1000+60000) then . else null end),
          layer:(.layer|enum(["guard","filesystem","sandbox","opencode"])),
          stage:(.stage|enum(["initialization","sandbox-probe","rules-load","engine-load","api-load","tool-hook","path-read","path-write","path-resolve","workdir","safety-net"])),
          code:(.code|enum(["sandbox-unverified","rules-unavailable","engine-unavailable","api-unavailable","hooks-unavailable","release-unavailable","launcher-release-unavailable","unguarded","path-denied","path-protected","path-not-writable","path-invalid","patch-paths-missing","filesystem-error","safety-net-failed","command-denied"])),
          tool:(.tool|enum(["read","bash","write","other"])),
          ruleId:(.ruleId|enum(["guard.path.deny","guard.path.protected","guard.path.readonly","guard.path.unlisted","guard.path.invalid","unattributed","custom","secret.basename.env","git.reset-hard","rm.recursive-force-root-or-home","rm.recursive-force-outside-cwd"])),
          errno:(.errno|enum(["EPERM","EACCES","ENOENT","ENOTDIR","ELOOP"])),
          remediation:(.remediation|enum(["relaunch","reinstall","review-guard-list","review-policy","review-path","launch-guarded","none"])),
          release:(.release|if type=="string" and test("^[0-9]+\\.[0-9]+\\.[0-9]+-[0-9]{8}T[0-9]{6}Z$") then . else "unknown" end)
        } | . + {ageSeconds:(if .timestamp==null then null else (($now-.timestamp/1000)|floor|if .<0 then 0 else . end) end)}]
      ' "$events_file" 2>/dev/null) || { events='[]'; event_state=error; }
      latest=$(/usr/bin/jq -cn --argjson e "$events" '[$e[].timestamp|select(.!=null)]|if length==0 then null else max end')
    fi
  fi
  (( bad )) && consistent=false
  report=$(/usr/bin/jq -cn --argjson ok "$consistent" --arg rid "$rid" --arg installed "$installed" --arg active "$active" --arg version "$version" --arg stamp "$stamp_state" --argjson drift "$summary" --argjson excluded "$excluded" --argjson configs "$configs" --arg o "$ownership_state" --argjson ownership "$ownership" --arg preference "$preference" --arg ps "$preference_state" --arg r "$rulebook" --argjson snapshot "$snapshot" --arg ev "$event_state" --argjson events "$events" --argjson latest "$latest" --argjson now "$now" '
    {schemaVersion:1, collectedAt:($now*1000), readOnly:true,
     installation:{consistent:$ok, stamp:$stamp, loadedRelease:$rid, installedRelease:$installed, currentRelease:$active, installedVersion:$version, drift:$drift, excludedEntries:$excluded, observation:"static_file"},
     permissions:{ownershipState:$o, ownership:$ownership, globalConfigs:$configs, approvalPreference:{state:$ps, value:$preference, observation:"configured_intent"}, effectiveRules:{state:"not_observable", remediation:"run-doctor-or-session-status"}, desktopAutoMode:{state:"not_observable", remediation:"use-native-auto-accept"}},
     components:{rulebook:{classification:$r, observation:"static_file", readiness:"not_probed"}, lastLaunchSnapshot:$snapshot, runtimeHealth:{state:"not_observable"}, sandbox:{state:"not_probed"}, engineInitialization:{state:"not_probed"}, launcherFailures:{state:"unavailable"}},
     recentFailures:{state:$ev, advisory:true, observation:"cached", latestTimestamp:$latest, events:$events},
     exitMeaning:"installation-consistency"}') || return 1
  if [[ ${1:-} == --json ]]; then
    print -r -- "$report"
  else
    print -r -- "$report" | /usr/bin/jq -r '
      "Agent Guard diagnostic report (read-only)",
      "Installation: \(if .installation.consistent then "consistent" else "inconsistent or unreadable" end)",
      "Release: loaded \(.installation.loadedRelease); installed \(.installation.installedRelease); current \(.installation.currentRelease)",
      "Global configurations:", (.permissions.globalConfigs[]|"  \(.source): \(.classification)"),
      "Permission ownership: \(.permissions.ownershipState)", (.permissions.ownership[]|"  \(.source) \(.key): \(.action)"),
      "Approval preference: \(.permissions.approvalPreference.value) (configured intent)",
      "Rules snapshot: \(.components.rulebook.classification) (static; readiness not probed)",
      "Runtime health, effective permissions, desktop auto mode: not observable",
      "Recent failures: \(.recentFailures.state); advisory cached observations", (.recentFailures.events[]|"  \(.layer)/\(.stage): \(.code); rule \(.ruleId); errno \(.errno); remediation \(.remediation)")'
  fi
  return $bad
}

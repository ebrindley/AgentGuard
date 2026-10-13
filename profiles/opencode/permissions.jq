def wildcard:
  gsub("\\\\"; "/") | explode | map(
    . as $c | if $c == 42 then ".*" elif $c == 63 then "."
    elif ([46,43,94,36,123,125,40,41,124,91,93,92] | index($c)) != null
      then "\\" + ([$c] | implode) else ([$c] | implode) end
  ) | join("") | if endswith(" .*") then .[0:-3] + "( .*)?" else . end | "^" + . + "$";
def matches($input; $pattern): ($input | gsub("\\\\"; "/") | test($pattern | wildcard; "s"));
def valid_rules:
  type == "array" and length <= 4096 and all(.[];
    type == "object" and (.permission | type == "string" and length <= 256)
    and (.pattern | type == "string" and length <= 4096)
    and (.action | IN("allow", "ask", "deny")));
def agent_label($name; $index):
  if ($name | IN("build", "plan", "explore", "general", "compaction", "title", "summary"))
  then $name else "custom-\($index)" end;
def decision($rules; $permission; $target):
  [$rules | to_entries[] | select(matches($permission; .value.permission) and matches($target; .value.pattern))] | last as $r
  | {action: ($r.value.action // "ask"), rule: (if $r == null then {id: "host.default", source: "unknown"}
      else {id: "host.rule.\($r.key)", permission: (if ($r.value.permission | IN("*", "edit", "bash", "read", "external_directory", "task", "doom_loop")) then $r.value.permission else "custom" end),
        patternClass: (if $r.value.pattern == "*" then "all" else "specific" end), source: "host_resolved_unknown"} end)};
def summary($agent; $index; $sessionRules):
  $agent.permission as $base | ($base + $sessionRules) as $rules
  | {agent: agent_label($agent.name; $index), mode: (if ($agent.mode | IN("primary", "subagent", "all")) then $agent.mode else "unknown" end),
      rules: {allow: ([$rules[] | select(.action == "allow")] | length), ask: ([$rules[] | select(.action == "ask")] | length), deny: ([$rules[] | select(.action == "deny")] | length)},
      probes: {externalDirectory: decision($rules; "external_directory"; $outside), ordinaryEdit: decision($rules; "edit"; "sample.txt"),
        planningEdit: decision($rules; "edit"; ".opencode/plans/probe.md"), bashGitStatus: decision($rules; "bash"; "git status")},
      editToolVisible: ([$rules[] | select(matches("edit"; .permission))] | last | (.pattern != "*" or .action != "deny"))}
    + (if $ARGS.named.requested == "true" then {requested: {pathResolution:"lexical", guardAndSandbox:"apply_at_execution",
        externalDirectoryRequired:($ARGS.named.externalRequired == "true"), externalDirectory:decision($rules;"external_directory";$ARGS.named.requestedExternal),
        edit:decision($rules;"edit";$ARGS.named.requestedEdit), read:decision($rules;"read";$ARGS.named.requestedRead)}} else {} end);
if (.agents | type == "array" and length <= 64) and all(.agents[];
    type == "object" and (.name | type == "string" and length <= 256) and (.permission | valid_rules))
then . as $input | {
  schemaVersion: 1, scope: $scope, observedAt: $observed, origin: "host_resolved", availability: "observed",
  autoApproval: {state: "not_observable", source: "host_client"},
  instanceApprovals: "not_observable", provenance: "host_does_not_supply_file_or_line",
  agents: [$input.agents | to_entries[] | summary(.value; .key; [])],
  sessions: [($input.sessions // [])[:16][] | . as $s | ($input.agents | to_entries | map(select(.value.name == $s.agent)) | first) as $a
    | select($a != null and ($s.permission | valid_rules))
    | summary($a.value; $a.key; $s.permission) + {relationship: (if $s.child then "subagent" else "current" end), sessionRules: ($s.permission | length)}]
} else {schemaVersion: 1, scope: $scope, origin: "host_resolved", availability: "unsupported", autoApproval: {state: "not_observable", source: "host_client"}} end

#!/bin/zsh
emulate -L zsh
setopt no_unset pipe_fail

home=${HOME:A}
engine="$home/Library/Application Support/OpenCodeGuard"
record="$engine/state/permissions.json"
cc="$home/.cc-safety-net/rules"
marker_start='# >>> opencode-guard >>>'
marker_end='# <<< opencode-guard <<<'

warn() { print -ru2 -- "warning: $*" }

for rc in "$home/.zprofile" "$home/.zshrc" "$home/.bash_profile"; do
  [[ -e $rc ]] && /usr/bin/grep -Fxq -- "$marker_start" "$rc" || continue
  if /usr/bin/grep -Fxq -- "$marker_end" "$rc"; then
    /usr/bin/sed -i '' "/^$marker_start\$/,/^$marker_end\$/d" "${rc:A}"
  else
    warn "${rc:t} has an unfinished opencode-guard block; remove it by hand"
  fi
done

if [[ -e $record ]]; then
  for f in ${(f)"$(/usr/bin/jq -r 'keys[]' "$record")"}; do
    [[ -e $f ]] || continue
    if /usr/bin/jq --slurpfile r "$record" --arg f "$f" '
        reduce ($r[0][$f] | to_entries[]) as $e (.;
          if .permission[$e.key] == $e.value.wrote then
            (if $e.value.orig == null then del(.permission[$e.key]) else .permission[$e.key] = $e.value.orig end)
          else . end)' "$f" > "$f.tmp" 2>/dev/null; then
      /bin/mv -f "$f.tmp" "$f"
    else
      /bin/rm -f "$f.tmp"
      warn "${f:t} not restored; check its permission settings"
    fi
  done
fi

/bin/rm -f "$home/.config/opencode/plugins/opencode-guard.js"
/bin/rm -rf "$home/Applications/OpenCode Guard.app" "$cc/opencode-guard"
if [[ -e $cc/rule.json ]]; then
  if /usr/bin/jq '.rules -= ["opencode-guard"]' "$cc/rule.json" > "$cc/rule.json.tmp" 2>/dev/null; then
    /bin/mv -f "$cc/rule.json.tmp" "$cc/rule.json"
  else
    /bin/rm -f "$cc/rule.json.tmp"
    warn "$cc/rule.json not changed"
  fi
fi

/bin/rm -rf "$engine"
print -r -- "OpenCode Guard removed. Your list is still at $home/OpenCode Guard."

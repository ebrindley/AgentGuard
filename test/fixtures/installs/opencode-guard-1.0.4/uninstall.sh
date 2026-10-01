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

failed=0
if [[ -e $record ]]; then
  keys=$(/usr/bin/jq -r 'keys[]' "$record") || { failed=1; keys=; warn "permission record unreadable" }
  for f in ${(f)keys}; do
    [[ -e $f ]] || continue
    if ! /usr/bin/jq --slurpfile r "$record" --arg f "$f" '
        reduce ($r[0][$f] | to_entries[]) as $e (.;
          if .permission[$e.key] == $e.value.wrote then
            (if $e.value.orig == null then del(.permission[$e.key]) else .permission[$e.key] = $e.value.orig end)
          else . end)' "$f" > "$f.tmp" 2>/dev/null || ! /bin/mv -f "$f.tmp" "$f"; then
      /bin/rm -f "$f.tmp"
      warn "${f:t} not restored; check its permission settings"
      failed=1
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

if (( failed )); then
  backup="$home/OpenCode Guard/permissions-backup.json"
  /bin/mkdir -p "${backup:h}" && /bin/cp "$record" "$backup" || { warn "could not save $record; engine kept"; exit 1 }
  warn "original permission settings saved to $backup"
fi
/bin/rm -rf "$engine"
print -r -- "OpenCode Guard removed. Your list is still at $home/OpenCode Guard."

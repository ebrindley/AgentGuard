#!/bin/zsh
# usage: install.sh [--projects DIR] [--gui]
emulate -L zsh
setopt err_exit no_unset pipe_fail extended_glob

src=${0:A:h}
home=${HOME:A}
engine="$home/Library/Application Support/OpenCodeGuard"
state="$engine/state"
list_dir="$home/OpenCode Guard"
list="$list_dir/Guard List.txt"
conf="$home/.config/opencode"
launcher="$home/Applications/OpenCode Guard.app"
cc="$home/.cc-safety-net/rules"
marker_start='# >>> opencode-guard >>>'
marker_end='# <<< opencode-guard <<<'
gui=0 projects=
typeset -a warnings

while (( $# )); do
  case $1 in
    (--gui) gui=1 ;;
    (--projects) projects=${2:-}; shift ;;
    (*) print -u2 "unknown option: $1"; exit 2 ;;
  esac
  shift
done

die() { print -ru2 -- "OpenCode Guard: $*"; exit 1 }
say() { print -r -- "$*" }

[[ $(uname -s) == Darwin ]] || die "macOS only"
for t in /usr/bin/sandbox-exec /usr/bin/jq /usr/bin/osacompile /usr/bin/codesign /usr/bin/curl; do
  [[ -x $t ]] || die "missing $t (macOS 15 or later required)"
done

if [[ -z $projects && $gui == 0 && -t 0 ]]; then
  print -n "Drag your projects folder here and press Return (Return alone skips): "
  read -r projects
fi
projects=${${projects##[[:space:]]##}%%[[:space:]]##}
if [[ -n $projects ]]; then
  [[ -e $projects ]] || projects=${(Q)projects}
  [[ -d $projects ]] || die "not a folder: $projects"
  projects=${projects:A}
  for s in "$home/Library/Application Support" "$home/.config" "$home/.local"; do
    [[ $projects == / || $s == "$projects" || $s == "$projects"/* ]] && die "$projects is too broad to allow; choose the folder that holds your projects"
  done
fi

typeset -a configs
for f in "$conf/config.json" "$conf/opencode.json" "$conf/opencode.jsonc"; do
  [[ -e $f ]] || continue
  if ! /usr/bin/jq -e 'type == "object"' "$f" >/dev/null 2>&1; then
    warnings+=("${f:t} not changed (comments or invalid JSON): set permission edit, bash and external_directory to allow yourself")
  elif /usr/bin/jq -e '.permission | type == "string"' "$f" >/dev/null; then
    warnings+=("${f:t} not changed (permission is a single value)")
  else
    configs+=("$f")
  fi
done
[[ -e $conf/config.json || -e $conf/opencode.json || -e $conf/opencode.jsonc ]] || configs=("$conf/opencode.json")

/bin/mkdir -p "$engine/bin" "$state"
/bin/cp "$src/engine/launch" "$src/engine/profile.sb" "$src/uninstall.sh" "$engine/"
/bin/cp "$src/engine/opencode" "$src/engine/opencode-gui" "$engine/bin/"
/bin/rm -rf "$engine/vendor"
/bin/cp -R "$src/vendor" "$engine/vendor"
/bin/chmod 755 "$engine/launch" "$engine/uninstall.sh" "$engine/bin/opencode" "$engine/bin/opencode-gui"
/usr/bin/xattr -dr com.apple.quarantine "$engine" 2>/dev/null || true
say "engine: $engine"

/bin/mkdir -p "$list_dir"
[[ -e $list ]] || /bin/cp "$src/templates/Guard List.txt" "$list"
if [[ -n $projects ]]; then
  listed=$(P=$projects O=$list.tmp H=$home /usr/bin/awk '
    { print > ENVIRON["O"]; t = $0; sub(/\r$/, "", t); gsub(/^[[:space:]]+|[[:space:]]+$/, "", t); u = toupper(t)
      if (t ~ /^~(\/|$)/) t = ENVIRON["H"] substr(t, 2); if (t ~ /.\/+$/) sub(/\/+$/, "", t) }
    u ~ /^#/ { next }
    u ~ /^ALLOW([[:space:]]*[-:].*)?$/ { s = "ALLOW"; if (!done) print ENVIRON["P"] > ENVIRON["O"]; done = 1; next }
    u ~ /^READ([[:space:]]+|-)ONLY([[:space:]]*[-:].*)?$/ { s = "READ ONLY"; next }
    u ~ /^DENY([[:space:]]*[-:].*)?$/ { s = "DENY"; next }
    s != "" && t == ENVIRON["P"] { f[s] = 1 }
    END { print f["DENY"] ? "DENY" : f["READ ONLY"] ? "READ ONLY" : f["ALLOW"] ? "ALLOW" : done ? "added" : "" }' "$list")
  if [[ $listed == added ]]; then
    /bin/mv -f "$list.tmp" "$list"
  else
    /bin/rm -f "$list.tmp"
  fi
  case $listed in
    (ALLOW|added) say "allowed: $projects" ;;
    ('') die "no ALLOW heading in $list; add $projects under ALLOW yourself" ;;
    (*) warnings+=("$projects is listed under $listed in the list, so it is not writable; move it under ALLOW") ;;
  esac
fi
say "list: $list"

/bin/mkdir -p "$conf/plugins"
/bin/cp "$src/plugin/opencode-guard.js" "$conf/plugins/opencode-guard.js"

/bin/mkdir -p "$cc/opencode-guard"
/bin/cp "$src/templates/cc-safety-net/rules/opencode-guard/rulebook.json" "$cc/opencode-guard/rulebook.json"
if [[ ! -e $cc/rule.json ]]; then
  /bin/cp "$src/templates/cc-safety-net/rules/rule.json" "$cc/rule.json"
elif /usr/bin/jq '.rules = ((.rules // []) + ["opencode-guard"] | unique) | .transparent_wrappers = ((.transparent_wrappers // []) + ["env"] | unique)' "$cc/rule.json" > "$cc/rule.json.tmp" 2>/dev/null; then
  /bin/mv -f "$cc/rule.json.tmp" "$cc/rule.json"
else
  /bin/rm -f "$cc/rule.json.tmp"
  warnings+=("$cc/rule.json not changed (invalid JSON): add opencode-guard to its rules and env to its transparent_wrappers")
fi

record="$state/permissions.json"
[[ -e $record ]] || print '{}' > "$record"
for f in $configs; do
  [[ -e $f ]] || print '{}' > "$f"
  /usr/bin/jq --arg f "$f" --slurpfile c "$f" '
    if has($f) then . else
      .[$f] = (($c[0].permission // {}) as $p
        | reduce ("edit", "bash", "external_directory") as $k ({}; .[$k] = {orig: (if $p | has($k) then $p[$k] else null end)}))
    end' "$record" > "$record.tmp"
  /bin/mv -f "$record.tmp" "$record"
  /usr/bin/jq '.permission = ((.permission // {}) as $p | reduce ("edit", "bash", "external_directory") as $k ($p;
      .[$k] = (if (.[$k] | type) == "object" then {"*": "allow"} + (.[$k] | del(.["*"])) else "allow" end)))' "$f" > "$f.tmp"
  /bin/mv -f "$f.tmp" "$f"
  /usr/bin/jq --arg f "$f" --slurpfile c "$f" '.[$f] |= with_entries(.value.wrote = $c[0].permission[.key])' "$record" > "$record.tmp"
  /bin/mv -f "$record.tmp" "$record"
done

for rc in "$home/.zprofile" "$home/.zshrc" "$home/.bash_profile"; do
  [[ $rc == *bash_profile && ! -e $rc ]] && continue
  if [[ -e $rc ]] && /usr/bin/grep -Fxq -- "$marker_start" "$rc"; then
    /usr/bin/grep -Fxq -- "$marker_end" "$rc" || { warnings+=("${rc:t} has an unfinished opencode-guard block; fix it by hand"); continue }
    /usr/bin/sed -i '' "/^$marker_start\$/,/^$marker_end\$/d" "${rc:A}"
  fi
  [[ -s $rc && -n $(/usr/bin/tail -c1 "$rc") ]] && print >> "$rc"
  if [[ $rc == *bash_profile ]]; then
    line='PATH="$HOME/Library/Application Support/OpenCodeGuard/bin:$PATH"'
  else
    line='path=("$HOME/Library/Application Support/OpenCodeGuard/bin" ${path:#"$HOME/Library/Application Support/OpenCodeGuard/bin"})'
  fi
  print -r -- "$marker_start"$'\n'"$line"$'\n'"$marker_end" >> "$rc"
done
say "PATH: new terminal windows run opencode inside the guard"

/bin/rm -rf "$launcher"
/bin/mkdir -p "${launcher:h}"
/usr/bin/osacompile -o "$launcher" -e "do shell script quoted form of \"$engine/bin/opencode-gui\" & \" >/dev/null 2>&1 &\""
/usr/bin/plutil -replace CFBundleIdentifier -string ai.opencodeguard.launcher "$launcher/Contents/Info.plist"
/bin/cp "$src/assets/OpenCodeGuard.icns" "$launcher/Contents/Resources/applet.icns"
/bin/rm -f "$launcher/Contents/Resources/Assets.car"
/usr/bin/plutil -remove CFBundleIconName "$launcher/Contents/Info.plist"
/usr/bin/codesign --force --sign - "$launcher" 2>/dev/null
say "GUI: $launcher (drag it to the Dock)"
"$engine/launch" find-app >/dev/null || warnings+=("OpenCode.app not found: install it, then open OpenCode Guard")

say "self-test:"
if ! out=$("$engine/launch" check 2>&1); then
  failed=(${(M)${(f)out}:#FAIL*})
  (( $#failed )) || failed=("$out")
  warnings+=("self-test failed, the guard may not work: ${(j:; :)failed}")
fi
say "$out"

for w in $warnings; do say "warning: $w"; done
if [[ $gui == 1 || -t 1 ]]; then
  msg=$'OpenCode Guard is installed.\n\nOpen OpenCode with OpenCode Guard, or type opencode in a new terminal window.'
  (( $#warnings )) && msg+=$'\n\n'"${(pj:\n:)warnings}"
  answer=$(/usr/bin/osascript -e 'on run argv' -e 'button returned of (display dialog (item 1 of argv) & return & return & "Edit the allow and deny list now?" buttons {"Later", "Edit List"} default button "Edit List" with title "OpenCode Guard")' -e 'end run' "$msg" 2>/dev/null || true)
  [[ $answer == "Edit List" ]] && /usr/bin/open -e "$list"
fi
say "done"

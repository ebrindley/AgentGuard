# Agent Guard installer: the Pi and OMP harness (docs/DESIGN.md section 11, The
# adopted guard and The adoption): pi-sandbox-guard 7ad441f's launcher, profile,
# preamble and extension at the paths pi-sandbox-guard uses, their switch actions
# with backup and undo, the staged and gate checks, the doctor entry and the
# uninstall steps, and the hooks of the harness interface (actions.zsh).

ag_h_pi_init() {
  pi_bin="$home/.local/bin"
  pi_ext="$home/.pi/agent/extensions/pi-sandbox-guard"
  pi_conf="$home/.config/pi-sandbox-guard/executables.conf"
  pi_wrappers="$state/wrappers.json"
  pi_replaced="$state/legacy/replaced"
  # Where bind-executable.sh's detection looks for a Pi or OMP CLI besides the
  # home's own layouts, and the PATH it searches last.
  pi_roots=(/opt/homebrew /usr/local) pi_path=$PATH
  # The release's Pi files under profiles/pi, as scripts/release.sh ships them.
  pi_release_files=(LICENSE launchers/pi launchers/example-custom sandbox/pi-sandbox.sb sandbox/pi-sandbox-preamble.zsh
                    src/index.mjs src/guard-core.mjs src/validate-bash-command.sh
                    scripts/extension-entry.ts scripts/test-sandbox-profile.sh scripts/check-launchers.mjs
                    scripts/bind-executable.sh scripts/lib-ops.sh commands/bind.zsh commands/doctor.zsh commands/wrapper.zsh)
  # The installed copies: path, release file, mode. The extension folder's files
  # are relative to it.
  pi_copies=("$pi_bin/pi-sandbox-preamble.zsh" sandbox/pi-sandbox-preamble.zsh 644
             "$pi_bin/pi-sandbox.sb" sandbox/pi-sandbox.sb 644
             "$pi_bin/pi" launchers/pi 755
             "$pi_bin/omp" launchers/pi 755)
  pi_ext_files=(index.ts scripts/extension-entry.ts 644 src/index.mjs src/index.mjs 644
                src/guard-core.mjs src/guard-core.mjs 644 src/validate-bash-command.sh src/validate-bash-command.sh 755)
  ag_pi_node_path= ag_pi_node_note= ag_pi_cli_done=0
  typeset -ga ag_pi_entries ag_pi_notes ag_pi_cli_found
  ag_pi_entries=() ag_pi_notes=() ag_pi_cli_found=()
}

ag_h_pi_title() { REPLY='Pi and OMP' }

# Installed when the stamp lists it, pi-sandbox-guard is present or a Pi or OMP
# CLI is found as bind-executable.sh's detection finds one.
ag_h_pi_detect() {
  ag_stamp_harnesses
  (( ${reply[(Ie)pi]} )) && return 0
  ag_pi_guard_parts
  (( $#reply )) && return 0
  ag_pi_cli
  (( $#reply ))
}

ag_h_pi_volume() { reply=("$pi_bin" "${pi_ext:h}" "${pi_conf:h}") }

# --- What is on this Mac.

# True for a file holding pi-sandbox-guard's name: its launcher, preamble or
# profile, or Agent Guard's copy of them. bind and the launcher refuse such a
# target, which would loop.
ag_pi_is_guard() { /usr/bin/grep -qs -- pi-sandbox-guard "$1" }

# pi-sandbox-guard's parts in its layout (design section 11, The adoption, item 1),
# in reply.
ag_pi_guard_parts() {
  local f
  reply=()
  for f in pi omp; do
    [[ -f $pi_bin/$f ]] && ag_pi_is_guard "$pi_bin/$f" && reply+=("${pi_bin/#$home/~}/$f")
  done
  for f in "$pi_bin/pi-sandbox.sb" "$pi_bin/pi-sandbox-preamble.zsh" "$pi_ext" "$pi_conf"; do
    [[ -e $f || -L $f ]] && reply+=("${f/#$home/~}")
  done
  return 0
}

# The Pi and OMP CLIs bind-executable.sh's detection proposes, canonical, in reply.
ag_pi_cli() {
  local pkg=lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js c n
  local -a found prefixes
  if (( ag_pi_cli_done )); then reply=("${ag_pi_cli_found[@]}"); return 0; fi
  prefixes=($pi_roots "$home/.npm-global" "$home/.local" "$home"/.nvm/versions/node/*(N/) "$home"/.asdf/installs/nodejs/*(N/)
            "$home"/.local/share/mise/installs/node/*(N/) "$home/Library/Application Support/fnm/node-versions"/*/installation(N/))
  for c in $prefixes; do [[ -e $c/$pkg ]] && found+=("$c/$pkg"); done
  for c in $pi_roots; do found+=("$c"/Cellar/pi-coding-agent/*/bin/pi(N*)); done
  found+=("$home/.volta/tools/image/packages/@earendil-works/pi-coding-agent/dist/cli.js"(N)
          "$home/Library/pnpm/global"/*/node_modules/@earendil-works/pi-coding-agent/dist/cli.js(N)
          "$home/.bun/install/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"(N)
          "$home/.yarn/global/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"(N)
          "$home/.local/lib/omp/omp"(N*) ${^pi_roots}/bin/omp(N*) ${^pi_roots}/Cellar/omp/*/bin/omp(N*) "$home/.bun/bin/omp"(N*))
  if [[ -n $pi_path ]]; then
    n=$(PATH=$pi_path; whence -p npm 2>/dev/null) && c=$(PATH=$pi_path "$n" prefix -g 2>/dev/null) &&
      [[ -e $c/$pkg ]] && found+=("$c/$pkg")
    for n in pi omp; do
      c=$(PATH=$pi_path; whence -p $n 2>/dev/null) && found+=("$c")
    done
  fi
  ag_pi_cli_found=()
  for c in $found; do
    c=${c:A}
    ag_pi_is_guard "$c" || ag_pi_cli_found+=("$c")
  done
  ag_pi_cli_found=(${(u)ag_pi_cli_found}) ag_pi_cli_done=1
  reply=("${ag_pi_cli_found[@]}")
}

# ag_pi_conf_get KEY: REPLY = KEY's value in executables.conf, as the preamble
# reads it (config_value_for_key); fails when there is none.
ag_pi_conf_get() {
  REPLY=
  [[ -f $pi_conf ]] || return 1
  REPLY=$(/usr/bin/awk -F= -v key="$1" '
    /^[[:space:]]*($|#)/ { next }
    { name = $1; sub(/^[[:space:]]+/, "", name); sub(/[[:space:]]+$/, "", name)
      if (name == key) { sub(/^[^=]*=/, "", $0); sub(/^[[:space:]]+/, "", $0); sub(/[[:space:]]+$/, "", $0)
        if ($0 ~ /^".*"$/ || $0 ~ /^\047.*\047$/) { sub(/^["\047]/, "", $0); sub(/["\047]$/, "", $0) }
        print $0; found = 1; exit } }
    END { if (!found) exit 1 }' "$pi_conf" 2>/dev/null) && [[ -n $REPLY ]]
}

# The rule of lib-ops.sh: true when PATH lies in a folder Pi sessions can write.
ag_pi_write_root() {
  /bin/bash -c '. "$1" && ops_path_is_known_sandbox_write_root "$2" "$3"' _ "$ag_tree/profiles/pi/scripts/lib-ops.sh" "$1" "$home"
}

# ag_pi_target PATH: as agent-guard bind validates a target (bind-executable.sh,
# validate_target), PATH canonical; REPLY = why it is refused. The loop check
# compares with the launcher that takes the entry's place: the release's and the
# staged copy.
ag_pi_target() {
  local t=${1:A} l
  REPLY=
  if [[ ! -e $t ]]; then REPLY="$t does not exist"
  elif [[ -d $t ]]; then REPLY="$t is a folder"
  elif [[ ! -x $t ]]; then REPLY="$t is not executable"
  elif ag_pi_is_guard "$t"; then REPLY="$t looks like a pi-sandbox-guard script; that would loop"
  elif ag_pi_write_root "$t"; then REPLY="$t is inside a folder Pi sessions can write"
  fi
  for l in "$ag_tree/profiles/pi/launchers/pi" "${ag_tstage:-/nonexistent}/pi/pi" "${ag_tstage:-/nonexistent}/pi/omp"; do
    [[ -z $REPLY && -e $l && $t == ${l:A} ]] && REPLY="$t is the guard's launcher; that would loop"
  done
  [[ -z $REPLY ]]
}

# The analyzer's Node, for .guard-node (design section 11, Fresh install): the
# extension's own while it is usable, else chosen as deploy-local.sh chooses it:
# process.execPath of the node on PATH, refused in a folder Pi sessions can write,
# kept as its Homebrew opt link. Sets ag_pi_node_path; fails, saying why.
ag_pi_node() {
  local f="$pi_ext/.guard-node" n= lib="$ag_tree/profiles/pi/scripts/lib-ops.sh"
  ag_pi_node_path= ag_pi_node_note=
  if [[ -f $f ]]; then { IFS= read -r n < "$f" } 2>/dev/null; fi
  if [[ -n $n ]]; then
    if ag_pi_node_ok "$n"; then ag_pi_node_path=$n; return 0; fi
    ag_pi_node_note="the analyzer's Node in ${f/#$home/~} ($n) is not usable"
  fi
  n=$(node -p process.execPath 2>/dev/null) || n=
  if [[ $n != /* || ! -x $n || -d $n ]]; then
    ag_err "Pi's guard runs its analyzer on Node, and no node on PATH can be used${n:+ ($n)}. Install Node (for example: brew install node), then run this again. Nothing changed."
    return 1
  fi
  if ag_pi_write_root "$n"; then
    ag_err "the node on PATH ($n) is in a folder Pi sessions can write, so it cannot run Pi's analyzer. Install Node elsewhere (for example: brew install node), then run this again. Nothing changed."
    return 1
  fi
  n=$(PATH="${n:h}:/usr/bin:/bin" /bin/bash -c '. "$1" && ops_stable_node_path "$2"' _ "$lib" "$n") && [[ $n == /* ]] ||
    { ag_err 'cannot resolve the path of the node on PATH. Nothing changed.'; return 1 }
  ag_pi_node_path=$n
  [[ -n $ag_pi_node_note ]] && ag_pi_notes+=("$ag_pi_node_note; the analyzer now runs $n")
  return 0
}

# A recorded Node the launcher accepts: absolute, an executable file, outside the
# folders Pi sessions can write, as recorded and resolved.
ag_pi_node_ok() {
  [[ $1 == /* && -x ${1:A} && ! -d ${1:A} ]] && ! ag_pi_write_root "$1" && ! ag_pi_write_root "${1:A}"
}

# Each entry at ~/.local/bin/pi or omp that is not the guard's (design section 11,
# Fresh install): resolved and validated before the switch, so that the launcher
# replacing it still finds it. An entry that is the executable itself would be
# overwritten and is refused. ag_pi_entries = runtime, canonical target, whether
# to record it (no binding yet): 1 or 0.
ag_pi_entries_check() {
  local rt label e
  ag_pi_entries=()
  for rt label in pi Pi omp OMP; do
    e="$pi_bin/$rt"
    [[ -e $e || -L $e ]] || continue
    [[ -f $e ]] && ag_pi_is_guard "$e" && continue
    if [[ -d $e ]]; then
      ag_err "${e/#$home/~} is a folder, and the $label launcher goes at that path. Move it, then run this again. Nothing changed."
      return 1
    fi
    if [[ ! -L $e ]]; then
      ag_err "${e/#$home/~} is the $label executable itself, and the guard's launcher goes at that path. Move it out of ~/.local/bin, run this again, then record its new path with: agent-guard bind --$rt PATH. Nothing changed."
      return 1
    fi
    if ! ag_pi_target "$e"; then
      ag_err "${e/#$home/~} links to $(/usr/bin/readlink -- "$e"), which cannot be recorded for the launcher that replaces it: $REPLY. Fix or remove the link and run this again, then record $label with: agent-guard bind --$rt PATH. Nothing changed."
      return 1
    fi
    if ag_pi_conf_get $rt; then ag_pi_entries+=("$rt" "${e:A}" 0); else ag_pi_entries+=("$rt" "${e:A}" 1); fi
  done
  return 0
}

# Preflight: the analyzer's Node and the entries the launchers replace.
ag_h_pi_prepare() { ag_pi_node && ag_pi_entries_check }

# --- The release and the staged copies.

# P4: the release's Pi files and bin/pi and bin/omp, links to the launchers, which
# reach the PATH block through current/bin.
ag_h_pi_assemble() {  # RELEASE-FOLDER
  local r=$1 f
  for f in $pi_release_files; do
    /bin/mkdir -p -- "$r/profiles/pi/${f:h}" && /bin/cp -- "$ag_tree/profiles/pi/$f" "$r/profiles/pi/$f" || return 1
  done
  /bin/chmod 755 "$r/profiles/pi/launchers/pi" "$r/profiles/pi/launchers/example-custom" "$r/profiles/pi/src/validate-bash-command.sh" \
    "$r/profiles/pi/scripts/test-sandbox-profile.sh" "$r/profiles/pi/scripts/bind-executable.sh" || return 1
  for f in launchers/pi launchers/example-custom sandbox/pi-sandbox-preamble.zsh commands/{bind,doctor,wrapper}.zsh; do
    /bin/zsh -fn "$r/profiles/pi/$f" || { ag_err "profiles/pi/$f does not parse"; return 1 }
  done
  /bin/ln -s "$pi_bin/pi" "$r/bin/pi" && /bin/ln -s "$pi_bin/omp" "$r/bin/omp"
}

# The staged copies in stage/<txn>/pi, which the switch renames into place: the
# launchers, profile and preamble, the extension folder with .guard-node, and the
# bindings when an entry is recorded.
ag_pi_stage() {
  local rel="$engine/releases/$ag_rid_new/profiles/pi" s="$ag_tstage/pi" f src mode rt t rec
  local -a set
  /bin/rm -rf -- "$s"
  /bin/mkdir -p -- "$s/extension/src" || return 1
  for f src mode in $pi_copies; do
    /bin/cp -- "$rel/$src" "$s/${f:t}" && /bin/chmod $mode "$s/${f:t}" || return 1
  done
  for f src mode in $pi_ext_files; do
    /bin/cp -- "$rel/$src" "$s/extension/$f" && /bin/chmod $mode "$s/extension/$f" || return 1
  done
  # The extension's own .guard-node goes along unchanged when it is still usable.
  if [[ -f $pi_ext/.guard-node && $(<"$pi_ext/.guard-node") == "$ag_pi_node_path" ]]; then
    /bin/cp -p -- "$pi_ext/.guard-node" "$s/extension/.guard-node" || return 1
  else
    print -r -- "$ag_pi_node_path" > "$s/extension/.guard-node" && /bin/chmod 600 "$s/extension/.guard-node" || return 1
  fi
  for rt t rec in $ag_pi_entries; do
    (( rec )) || continue
    set+=("$rt" "$t")
    # A Node entry point needs its interpreter recorded: the launcher's pinned PATH
    # may hold no node (bind-executable.sh, needs_interpreter). OMP is native.
    if [[ $rt == pi ]] && /usr/bin/head -c 128 -- "$t" 2>/dev/null | /usr/bin/head -1 | /usr/bin/grep -Eq '^#!.*[ /]node( |$)' &&
       ! ag_pi_conf_get node; then
      set+=(node "$ag_pi_node_path")
    fi
  done
  (( $#set )) || return 0
  ag_pi_conf_write "$s/executables.conf" $set
}

# ag_pi_conf_write OUT KEY VALUE...: executables.conf with each KEY set to VALUE and
# every other line kept, as bind-executable.sh rewrites it, mode 0600.
ag_pi_conf_write() {
  local out=$1 k v
  local -a keys
  shift
  for k v in "$@"; do keys+=("$k"); done
  {
    if [[ -f $pi_conf ]]; then
      /usr/bin/awk -F= -v keys=" $keys " '
        /^[[:space:]]*($|#)/ { print; next }
        { n = $1; gsub(/^[[:space:]]+|[[:space:]]+$/, "", n); if (index(keys, " " n " ")) next; print }' "$pi_conf" || return 1
    else
      print -r -- '# pi-sandbox-guard executable binding — written by the Agent Guard installer.'
      print -r -- "# Recorded absolute paths are exempt from the shim's trusted-prefix list;"
      print -r -- '# the shim still refuses a non-executable, the shim itself, or anything'
      print -r -- '# inside a Seatbelt write root. Re-run agent-guard bind after an upgrade'
      print -r -- '# that moves these paths (nvm/volta/mise version bumps, brew upgrades).'
    fi
    for k v in "$@"; do print -r -- "$k=$v"; done
  } > "$out" && /bin/chmod 600 "$out"
}

# P7: the staged copies built and checked before anything outside the engine folder
# changes: the profile self-test against the staged profile, the analyzer's
# preflight and one blocked and one allowed command through the staged extension
# with its .guard-node, and the recorded bindings.
ag_h_pi_staged() {
  local rel="$engine/releases/$ag_rid_new/profiles/pi" s="$ag_tstage/pi" out k v work temp
  local -a lines
  integer rc bad=0
  ag_pi_node || { ag_failed+=('FAIL no usable Node for the analyzer'); return 1 }
  ag_pi_entries_check || { ag_failed+=('FAIL an entry in ~/.local/bin cannot be recorded'); return 1 }
  ag_pi_stage || { ag_failed+=('FAIL cannot stage the Pi files'); return 1 }
  out=$(ag_bounded 120 /usr/bin/env PI_SANDBOX_PROFILE_STRICT=1 /bin/bash "$rel/scripts/test-sandbox-profile.sh" "$s/pi-sandbox.sb" 2>&1)
  rc=$?
  lines=(${(f)out})
  if (( rc == 0 )); then ag_say 'ok   Pi profile self-test of the staged pi-sandbox.sb'
  else ag_failed+=("FAIL Pi profile self-test of the staged pi-sandbox.sb (exit $rc): ${lines[-1]:-no output}"); bad=1
  fi
  temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
  work=$(/usr/bin/mktemp -d "$temp/agent-guard-staged.XXXXXX") || { ag_failed+=("FAIL cannot create a folder in $temp"); return 1 }
  # HOME is the scratch folder, so the blocked command is not logged in the
  # account's security event log.
  out=$(cd "$work" && ag_bounded 60 /usr/bin/env "HOME=$work" "$ag_pi_node_path" --input-type=module -e '
    import { pathToFileURL } from "node:url";
    const [ext, cwd] = process.argv.slice(1);
    const m = await import(pathToFileURL(`${ext}/src/guard-core.mjs`).href);
    const pre = await m.preflight();
    const block = await m.analyzeCommand("rm -rf /", { cwd, timeoutMs: 6000 });
    const allow = await m.analyzeCommand("ls -la", { cwd, timeoutMs: 6000 });
    console.log(JSON.stringify({ ok: pre.ok === true, missing: pre.missing ?? [], block: block.decision, allow: allow.decision }));' "$s/extension" "$work" 2>&1)
  rc=$?
  /bin/rm -rf -- "$work"
  lines=(${(f)out})
  if (( rc )) || ! /usr/bin/jq -e '.ok == true and .block == "block" and .allow == "allow"' <<< "${lines[-1]:-}" >/dev/null 2>&1; then
    ag_failed+=("FAIL Pi analyzer preflight of the staged extension (exit $rc): ${lines[-1]:-no output}"); bad=1
  else
    ag_say "ok   Pi analyzer preflight of the staged extension with $ag_pi_node_path; rm -rf / blocked, ls -la allowed"
  fi
  for k in pi omp node; do
    ag_pi_conf_get $k || continue
    v=$REPLY
    if ag_pi_target "$v"; then ag_say "ok   recorded $k=$v"
    else ag_failed+=("FAIL recorded $k=$v in ${pi_conf/#$home/~} is no longer usable: $REPLY; record it again with agent-guard bind, then run this again"); bad=1
    fi
  done
  (( ! bad ))
}

# --- Switch actions (design section 11, The adoption, item 5), registered in
# actions.zsh in this order: the bindings, pi-sandbox-preamble.zsh, then
# pi-sandbox.sb, pi, omp and the extension folder. A file is replaced by one rename
# from the stage, so its path exists at every moment.

# ag_pi_backup NAME PATH: backup/NAME/file holds PATH as it is, a link as a link, or
# nothing when PATH is absent.
ag_pi_backup() {
  local b="$txn_dir/backup/$1"
  /bin/rm -rf -- "$b.new" "$b"
  /bin/mkdir -p -- "$b.new" || return 1
  if [[ -e $2 || -L $2 ]]; then /bin/cp -Rp -- "$2" "$b.new/file" || return 1; fi
  /bin/mv -- "$b.new" "$b"
}

# True when A and B are the same link or regular files with the same bytes and mode.
ag_pi_identical() {
  if [[ -L $1 || -L $2 ]]; then
    [[ -L $1 && -L $2 && $(/usr/bin/readlink -- "$1") == "$(/usr/bin/readlink -- "$2")" ]]
  else
    [[ -f $1 && -f $2 ]] && /usr/bin/cmp -s -- "$1" "$2" && [[ $(/usr/bin/stat -f %Lp -- "$1") == $(/usr/bin/stat -f %Lp -- "$2") ]]
  fi
}

# ag_pi_missing PATH: REPLY = how many of PATH's parent folders, the nearest first,
# are missing; the action that creates them journals the count as mk.
ag_pi_missing() {
  local d=${1:h}
  integer n=0
  while [[ ! -e $d && ! -L $d ]]; do n+=1; d=${d:h}; done
  REPLY=$n
}

# ag_pi_rmdirs PATH ACTION: on undo, removes the parent folders of PATH that ACTION
# created (its mk), the nearest first, while they are empty.
ag_pi_rmdirs() {
  local d=${1:h}
  integer n
  ag_jfind $2 begun
  ag_jval mk
  n=${REPLY:-0}
  while (( n-- > 0 )); do /bin/rmdir -- "$d" 2>/dev/null || return 0; d=${d:h}; done
}

# ag_pi_put ACTION TARGET STAGED RELEASE-FILE: TARGET as it is goes into the backup
# (old: none, guard or other, an entry that is not the guard's), then the staged
# copy is renamed over it. An identical TARGET is left as it is.
ag_pi_put() {
  local a=$1 t=$2 s=$3 want=$4 old
  ag_jlast $a
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if ag_pi_identical "$t" "$s"; then test_point $a; return; fi
    old=none
    if [[ -e $t || -L $t ]]; then old=other; [[ -f $t ]] && ag_pi_is_guard "$t" && old=guard; fi
    ag_pi_missing "$t"
    ag_pi_backup $a "$t" && ag_jnl $a begun "old=$old mk=$REPLY" || return 1
  fi
  test_point $a || return 1
  if [[ -e $s ]]; then /bin/mkdir -p -- "${t:h}" && /bin/mv -fh -- "$s" "$t" || return 1; fi
  [[ -f $t && ! -L $t ]] && /usr/bin/cmp -s -- "$want" "$t" || return 1
  ag_jnl $a done
}

# Puts back the backup by one rename, or removes TARGET, and the folders the action
# created for it, when there was none.
ag_pi_put_undo() {  # ACTION TARGET
  local a=$1 t=$2 b="$txn_dir/backup/$1/file" tmp="${2:h}/.${2:t}.partial"
  ag_jlast $a
  [[ $REPLY == (begun|done) ]] || return 0
  /bin/rm -f -- "$tmp"
  if [[ -e $b || -L $b ]]; then
    if ! ag_pi_identical "$b" "$t"; then
      /bin/cp -Rp -- "$b" "$tmp" && /bin/mv -fh -- "$tmp" "$t" || return 1
    fi
  else
    /bin/rm -f -- "$t" || return 1
    ag_pi_rmdirs "$t" $a
  fi
  ag_jnl $a undone
}

ag_pi_rel() { REPLY="$engine/releases/$ag_rid_new/profiles/pi/$1" }

do_pi_preamble() { ag_pi_rel sandbox/pi-sandbox-preamble.zsh; ag_pi_put pi-preamble "$pi_bin/pi-sandbox-preamble.zsh" "$ag_tstage/pi/pi-sandbox-preamble.zsh" "$REPLY" }
undo_pi_preamble() { ag_pi_put_undo pi-preamble "$pi_bin/pi-sandbox-preamble.zsh" }
do_pi_profile() { ag_pi_rel sandbox/pi-sandbox.sb; ag_pi_put pi-profile "$pi_bin/pi-sandbox.sb" "$ag_tstage/pi/pi-sandbox.sb" "$REPLY" }
undo_pi_profile() { ag_pi_put_undo pi-profile "$pi_bin/pi-sandbox.sb" }
do_pi_launcher_pi() { ag_pi_rel launchers/pi; ag_pi_put pi-launcher-pi "$pi_bin/pi" "$ag_tstage/pi/pi" "$REPLY" }
undo_pi_launcher_pi() { ag_pi_put_undo pi-launcher-pi "$pi_bin/pi" }
do_pi_launcher_omp() { ag_pi_rel launchers/pi; ag_pi_put pi-launcher-omp "$pi_bin/omp" "$ag_tstage/pi/omp" "$REPLY" }
undo_pi_launcher_omp() { ag_pi_put_undo pi-launcher-omp "$pi_bin/omp" }

# The bindings of the entries the launchers replace, before the first launcher
# moves in. Runs only when the stage holds new bindings.
do_pi_bindings() {
  local s="$ag_tstage/pi/executables.conf" tmp="${pi_conf:h}/.executables.conf.partial" created=0
  ag_jlast pi-bindings
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ ! -f $s ]] || /usr/bin/cmp -s -- "$s" "$pi_conf"; then test_point pi-bindings; return; fi
    [[ -e $pi_conf ]] || created=1
    ag_pi_missing "$pi_conf"
    ag_pi_backup pi-bindings "$pi_conf" && ag_jnl pi-bindings begun "created=$created mk=$REPLY" || return 1
  fi
  test_point pi-bindings || return 1
  if [[ -f $s ]]; then
    /bin/mkdir -p -- "${pi_conf:h}" && /bin/cp -p -- "$s" "$tmp" && /bin/mv -f -- "$tmp" "$pi_conf" || return 1
  fi
  ag_sha "$pi_conf" && ag_jnl pi-bindings done "$REPLY"
}

undo_pi_bindings() { ag_pi_put_undo pi-bindings "$pi_conf" }

# The extension folder: the old folder renamed into the backup, then the staged
# folder into place (test point pi-extension-gap between them). In the gap a
# guarded start refuses, as the launcher refuses a missing extension, and a direct
# start of the real binary loads no extension.
do_pi_extension() {
  local s="$ag_tstage/pi/extension" b="$txn_dir/backup/pi-extension/folder" old
  ag_jlast pi-extension
  [[ $REPLY == done ]] && return 0
  if [[ -z $REPLY ]]; then
    if [[ -d $pi_ext && ! -L $pi_ext ]] && /usr/bin/diff -rq -- "$s" "$pi_ext" >/dev/null 2>&1; then test_point pi-extension; return; fi
    old=0
    [[ -e $pi_ext || -L $pi_ext ]] && old=1
    ag_pi_missing "$pi_ext"
    /bin/mkdir -p -- "${b:h}" && ag_jnl pi-extension begun "old=$old mk=$REPLY" || return 1
  fi
  test_point pi-extension || return 1
  ag_jfind pi-extension begun
  ag_jval old
  old=$REPLY
  if [[ $old == 1 && ( -e $pi_ext || -L $pi_ext ) && ! -e $b && ! -L $b && -e $s ]]; then
    /bin/mv -- "$pi_ext" "$b" || return 1
  fi
  test_point pi-extension-gap || return 1
  if [[ ! -e $pi_ext && ! -L $pi_ext && -e $s ]]; then
    /bin/mkdir -p -- "${pi_ext:h}" && /bin/mv -- "$s" "$pi_ext" || return 1
  fi
  [[ -d $pi_ext && ! -L $pi_ext && -f $pi_ext/index.ts ]] || return 1
  ag_jnl pi-extension done
}

undo_pi_extension() {
  local s="$ag_tstage/pi/extension" b="$txn_dir/backup/pi-extension/folder" old
  ag_jlast pi-extension
  [[ $REPLY == (begun|done) ]] || return 0
  ag_jfind pi-extension begun
  ag_jval old
  old=$REPLY
  # The folder in place is the new one once the staged folder has moved in.
  if [[ -e $pi_ext && ! -e $s ]] && [[ $old != 1 || -e $b || -L $b ]]; then
    /bin/mkdir -p -- "${s:h}" && /bin/mv -- "$pi_ext" "$s" || return 1
  fi
  if [[ ( -e $b || -L $b ) && ! -e $pi_ext && ! -L $pi_ext ]]; then
    /bin/mv -- "$b" "$pi_ext" || return 1
  fi
  [[ $old == 1 ]] || ag_pi_rmdirs "$pi_ext" pi-extension
  ag_jnl pi-extension undone
}

# --- After the switch.

# The gate's launch of each runtime through $engine/bin, from a scratch project in
# the per-user temp folder, because Pi refuses the home folder as a project. A
# runtime with no binding and no CLI the launcher finds is skipped and named.
ag_h_pi_gate() {
  local rt label temp work out err
  local -a lines errs
  integer rc
  temp=${$(/usr/bin/getconf DARWIN_USER_TEMP_DIR):A}
  work=$(/usr/bin/mktemp -d "$temp/agent-guard-gate.XXXXXX") || { ag_failed+=("FAIL cannot create a folder in $temp"); return }
  /bin/mkdir -p -- "$work/project"
  for rt label in pi Pi omp OMP; do
    out=$(cd "$work/project" && ag_bounded 20 /usr/bin/env "PI_PROJECT=$work/project" "TMPDIR=$temp/" "$engine/bin/$rt" --version 2>"$work/$rt.err")
    rc=$?
    err=$(<"$work/$rt.err")
    lines=(${(f)out}) errs=(${(f)err})
    if (( rc == 0 )); then
      ag_say "ok   $rt --version through bin/$rt: ${lines[1]:-no output}"
    elif (( rc == 124 )); then
      ag_failed+=("FAIL $rt --version through bin/$rt did not finish within 20 seconds")
    elif ! ag_pi_conf_get $rt && [[ $err == *"cannot auto-resolve the real $label executable"* ]]; then
      ag_say "skip $rt --version through bin/$rt: no $label binding and no $label CLI the launcher finds"
      ag_pi_notes+=("$label: no binding and no $label CLI on the launcher's trusted paths; if $label is installed, record it with agent-guard bind")
    else
      ag_failed+=("FAIL $rt --version through bin/$rt exited $rc: ${errs[-1]:-no output}")
    fi
  done
  /bin/rm -rf -- "$work"
}

# The installed copies, for the stamp's hashes; .guard-node is host data and is not
# among them.
ag_h_pi_files() {
  local f src mode
  reply=()
  for f src mode in $pi_copies; do reply+=("$f"); done
  for f src mode in $pi_ext_files; do reply+=("$pi_ext/$f"); done
}

ag_h_pi_links() {
  local rt
  reply=()
  for rt in pi omp; do reply+=("$engine/bin/$rt" "$(/usr/bin/readlink -- "$engine/bin/$rt")"); done
}

# After the stamp: each entry the launchers replaced moves from the transaction
# backup to state/legacy/replaced, which outlives the cleanup and from which
# uninstall puts it back. An earlier one there is kept under a suffix.
ag_h_pi_keep() {
  local rt b
  test_point pi-keep || return 1
  for rt in pi omp; do
    b="$txn_dir/backup/pi-launcher-$rt/file"
    [[ -e $b || -L $b ]] || continue
    ag_jfind pi-launcher-$rt begun
    ag_jval old
    [[ $REPLY == other ]] || continue
    /bin/mkdir -p -- "$pi_replaced" || return 1
    if [[ -e $pi_replaced/$rt || -L $pi_replaced/$rt ]]; then
      /bin/mv -- "$pi_replaced/$rt" "$pi_replaced/$rt.$EPOCHSECONDS" || return 1
    fi
    /bin/mv -- "$b" "$pi_replaced/$rt" || return 1
  done
  return 0
}

ag_h_pi_report() {
  local rt t rec n
  ag_say "Pi: pi and omp in ${pi_bin/#$home/~} and in Agent Guard's bin start Pi and OMP inside pi-sandbox-guard's sandbox, with Agent Guard's protections"
  for rt t rec in $ag_pi_entries; do
    if (( rec )); then
      ag_warnings+=("${pi_bin/#$home/~}/$rt was not the guard's launcher; it is replaced and kept in ${pi_replaced/#$home/~}/$rt, and $rt=$t is recorded in ${pi_conf/#$home/~}")
    else
      ag_warnings+=("${pi_bin/#$home/~}/$rt was not the guard's launcher; it is replaced and kept in ${pi_replaced/#$home/~}/$rt; the recorded $rt binding is unchanged")
    fi
  done
  for n in ${(u)ag_pi_notes}; do ag_warnings+=("$n"); done
  return 0
}

# Pi's part of agent-guard doctor (profiles/pi/commands/doctor.zsh), which needs
# home, engine and release as agent-guard sets them, and runs after agent-guard's
# pi_clean_env.
ag_h_pi_doctor() {  # RELEASE [--json]
  local mod="$1/profiles/pi/commands/doctor.zsh" f
  integer rc
  (( $+functions[pi_clean_env] )) && pi_clean_env
  if [[ ! -f $mod ]] || ! source "$mod"; then
    f="FAIL release ${1:t} has no Pi checks ($mod)"
    if [[ ${2:-} == --json ]]; then reply=("$f") REPLY='{}'; else print -r -- "$f"; fi
    return 1
  fi
  if [[ ${2:-} != --json ]]; then pi_doctor; return; fi
  pi_doctor --json
  rc=$?
  f=$REPLY
  reply=("${pi_lines[@]}") REPLY=$f
  return $rc
}

# --- Uninstall (design section 11, The adoption, Uninstall).

# U3: the launchers, the extension folder, the profile and the preamble. An entry
# the launchers replaced is put back in the launcher's place by one rename, a link
# with its original target text. A pi or omp that is no longer the guard's is
# left. Names the custom wrappers it leaves.
ag_h_pi_uninstall_remove() {
  local rt f
  local -a left
  for rt in pi omp; do
    f="$pi_bin/$rt"
    /bin/rm -f -- "$pi_bin/.$rt.partial"
    if [[ -e $f || -L $f ]] && ! { [[ -f $f ]] && ag_pi_is_guard "$f" }; then
      ag_warn "${f/#$home/~} is not the guard's launcher; left as it is"
      continue
    fi
    if [[ -e $pi_replaced/$rt || -L $pi_replaced/$rt ]]; then
      /bin/mv -fh -- "$pi_replaced/$rt" "$f" ||
        { ag_err "cannot put back ${f/#$home/~} from $pi_replaced/$rt; $engine is kept, so agent-guard uninstall can run again"; return 1 }
      ag_say "put back ${f/#$home/~} as it was before Agent Guard"
    elif [[ -e $f ]]; then
      /bin/rm -f -- "$f" || { ag_err "cannot remove ${f/#$home/~}; $engine is kept, so agent-guard uninstall can run again"; return 1 }
    fi
  done
  /bin/rm -rf -- "$pi_ext" || { ag_err "cannot remove ${pi_ext/#$home/~}; $engine is kept, so agent-guard uninstall can run again"; return 1 }
  /bin/rm -f -- "$pi_bin/pi-sandbox.sb" "$pi_bin/pi-sandbox-preamble.zsh" "$pi_bin/.pi-sandbox.sb.partial" "$pi_bin/.pi-sandbox-preamble.zsh.partial" ||
    { ag_err "cannot remove the profile and preamble in ${pi_bin/#$home/~}; $engine is kept, so agent-guard uninstall can run again"; return 1 }
  if [[ -f $pi_wrappers ]]; then
    for f in ${(f)"$(/usr/bin/jq -r '.wrappers // {} | keys[]' "$pi_wrappers" 2>/dev/null)"}; do
      [[ -e $pi_bin/$f ]] && left+=("$f")
    done
  fi
  (( $#left )) && ag_warn "custom wrappers left in ${pi_bin/#$home/~}: ${(j:, :)left}; each runs the pi next to it"
  return 0
}

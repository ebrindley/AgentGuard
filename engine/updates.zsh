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

# Optional extra rule for a product: the offered version has the installed
# version's major component.
ag_update_same_major() {
  [[ ${${1#v}%%.*} == ${${2#v}%%.*} ]]
}

# The only network transport of a release lookup: HTTPS only, two seconds in
# all. URL, then any extra curl options (for example -o /dev/null -w ...); the
# reply is on stdout. Nothing is downloaded for execution.
ag_update_fetch() {
  local -a curl_proto=(--proto '=https' --proto-redir '=https')
  local url=$1
  shift
  /usr/bin/curl -q -fsS $curl_proto --connect-timeout 2 --max-time 2 "$@" -- "$url" 2>/dev/null
}

# LOOKUP [same-major]. A lookup function sets reply=(installed offered) and
# returns 0, 1 when there is nothing comparable to offer, or 2 when it failed.
# Returns 0 when offered is newer (also REPLY=offered, reply unchanged), else 1,
# or 2 for a failed lookup.
ag_update_check() {
  $1 || return
  older "$reply[1]" "$reply[2]" || return 1
  [[ ${2:-} != same-major ]] || ag_update_same_major "$reply[1]" "$reply[2]" || return 1
  REPLY=$reply[2]
}

# Agent Guard's lookup: the installed tag from the stamp and GitHub's
# latest-release redirect. Only the numeric stable tags understood by the
# version comparison are offered.
ag_update_lookup_agent_guard() {
  local repo='https://github.com/ebrindley/AgentGuard'
  local installed redirect tag
  installed=$(/usr/bin/jq -er '.tag | strings' "$engine/state/stamp.json" 2>/dev/null) || return 2
  [[ $installed == v<->(.<->)# ]] || return 1
  redirect=$(ag_update_fetch "$repo/releases/latest" -o /dev/null -w '%{redirect_url}') || return 2
  [[ $redirect == "$repo/releases/tag/"* ]] || return 2
  tag=${redirect#"$repo/releases/tag/"}
  [[ $tag == v<->(.<->)# ]] || return 2
  reply=($installed $tag)
}

# 0: a newer stable tag in REPLY; 1: no comparable newer release; 2: lookup failed.
ag_update_available() {
  ag_update_check ag_update_lookup_agent_guard
}

# Desktop update window: JXA source for `osascript -l JavaScript`, given the log
# path, the launcher's PID, the window title, the first label and then any stage
# lines. It only shows progress; any failure ends it without affecting the
# update. The label follows the last of the stage lines the update prints in the
# log; with no stage lines it stays as given.
ag_update_window_source() {
  read -rd '' REPLY <<'JXA' || true
ObjC.import('Cocoa');
ObjC.import('signal');
function run(argv) {
  const log = argv[0], pid = parseInt(argv[1], 10);
  const stages = argv.slice(4);
  $.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, 340, 90), $.NSWindowStyleMaskTitled, $.NSBackingStoreBuffered, false);
  win.setTitle(argv[2]);
  win.setLevel($.NSFloatingWindowLevel);
  win.center;
  const spinner = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(20, 29, 32, 32));
  spinner.setStyle($.NSProgressIndicatorStyleSpinning);
  spinner.setIndeterminate(true);
  const label = $.NSTextField.alloc.initWithFrame($.NSMakeRect(64, 33, 256, 24));
  label.setEditable(false);
  label.setBordered(false);
  label.setDrawsBackground(false);
  label.setStringValue(argv[3]);
  win.contentView.addSubview(spinner);
  win.contentView.addSubview(label);
  spinner.startAnimation($());
  win.orderFrontRegardless;
  function lastStage() {
    try {
      const data = $.NSData.dataWithContentsOfFile(log);
      const text = ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
      if (typeof text !== 'string') return null;
      const lines = text.split('\n');
      for (let i = lines.length - 1; i >= 0; i--) if (stages.indexOf(lines[i]) >= 0) return lines[i];
    } catch (e) {}
    return null;
  }
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline && $.kill(pid, 0) === 0) {
    const tick = Date.now();
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    // runUntilDate returns at once when the run loop has no sources.
    if (Date.now() - tick < 100) delay(0.2);
    const stage = lastStage();
    if (stage) label.setStringValue(stage);
  }
}
JXA
}

# ARG...: 0 to go on to the offer, 1 when this launch makes none: a restart
# handoff (the marker is consumed), a nested launch, a help or version request
# among ARG, or the stored preference being off.
ag_update_gate() {
  local arg
  if [[ ${AGENT_GUARD_UPDATE_RESTART:-} == 1 ]]; then
    unset AGENT_GUARD_UPDATE_RESTART
    return 1
  fi
  [[ ${AGENT_GUARD_GATE:-} != 1 ]] || return 1
  for arg in "$@"; do
    [[ $arg != (--help|--version|-h|-v) ]] || return 1
  done
  [[ ! -r $engine/state/update-check || $(<"$engine/state/update-check") != off ]] || return 1
}

# MODE NAME OFFERED INSTALLED [NOTE]: shows the offer and returns 0 when the
# operator accepts. The desktop dialog and the terminal prompt both show NOTE,
# when given, after the version lines. NAME is a product constant: it goes into
# the dialog script.
ag_update_ask() {
  local mode=$1 name=$2 offered=$3 installed=$4 note=${5:-} answer= icon nl=$'\n'
  if [[ $mode == gui ]]; then
    # display alert shows osascript's own icon; display dialog takes a file.
    icon="$engine/current/profiles/opencode/assets/AgentGuard.icns"
    [[ -r $icon ]] && icon='POSIX file (item 1 of argv)' || icon=note
    answer=$(/usr/bin/osascript -e 'on run argv' -e 'button returned of (display dialog (item 2 of argv) with title "'"$name"'" buttons {"Later", "Update"} default button "Update" cancel button "Later" with icon '"$icon"')' -e 'end run' \
      "$engine/current/profiles/opencode/assets/AgentGuard.icns" "An update is available: ${offered#v}."$nl"You have ${installed#v}.${note:+$nl$note}" 2>/dev/null) || return 1
    [[ $answer == Update ]]
  else
    print -ru2 -- "$name ${offered#v} is available. You have ${installed#v}."
    [[ -z $note ]] || print -ru2 -- "$note"
    [[ -t 0 && -t 2 ]] || return 1
    print -nu2 -- 'Update now? [Y/n] '
    IFS= read -r answer || return 1
    [[ -z $answer || ${(L)answer} == (y|yes) ]]
  fi
}

# MODE OFFERED RUN LOG TITLE LABEL [STAGE...]: runs the function RUN with
# OFFERED and returns its status. On the desktop its output goes to LOG while
# the progress window shows TITLE and LABEL, then the last STAGE line RUN
# prints; the window is stopped on every path.
ag_update_run() {
  local mode=$1 offered=$2 run=$3 log=$4 helper= rc=0
  shift 4
  if [[ $mode == gui ]]; then
    {
      ag_update_window_source
      /usr/bin/osascript -l JavaScript -e "$REPLY" "$log" $$ "$@" >/dev/null 2>&1 &
      helper=$!
      $run "$offered" > "$log" 2>&1 || rc=$?
    } always {
      if [[ -n $helper ]]; then
        kill $helper 2>/dev/null
        wait $helper 2>/dev/null
      fi
    }
  else
    $run "$offered" || rc=$?
  fi
  return $rc
}

# MODE NAME OFFERED: tells the operator the update was installed.
ag_update_notify() {
  if [[ $1 == gui ]]; then
    /usr/bin/osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "'"$2"'"' -e 'end run' "$2 updated to ${3#v}." >/dev/null 2>&1 || true
  else
    print -ru2 -- "$2 updated to ${3#v}."
  fi
}

# MODE PRODUCT ARG...: the update offer for one product. PRODUCT names an
# associative array with the keys
#   name           the product as the operator knows it
#   lookup         the function for ag_update_check
#   same_major     same-major to ask for that rule (optional)
#   note           a sentence shown with the offer (optional)
#   run            a function called with the offered version that installs it
#   defer_notify   1 when the caller verifies the installation before notifying (optional)
#   log            the file that receives the output of a desktop run
#   window_label   the first label of the desktop progress window
#   window_stages  lines the run prints that replace the label (optional)
# ARG... are the launch's arguments, which the gate reads.
# Returns 0 when nothing was installed (no offer, a failed lookup, a declined or
# unanswered offer), 1 when an accepted updater failed and 2 when it reported
# success, with the offered version in REPLY. A failed lookup is optional.
ag_update_offer() {
  emulate -L zsh
  setopt no_unset extended_glob
  local mode=$1 installed offered
  local -A p=("${(@kv)${(P)2}}")
  shift 2
  ag_update_gate "$@" || return 0
  ag_update_check "${p[lookup]}" "${p[same_major]:-}" || return 0
  # A product's run function may use reply for its own results.
  installed=$reply[1] offered=$reply[2]
  ag_update_ask "$mode" "${p[name]}" "$offered" "$installed" "${p[note]:-}" || return 0
  ag_update_run "$mode" "$offered" "${p[run]}" "${p[log]}" "${p[name]}" "${p[window_label]}" ${(f)p[window_stages]:-} || return 1
  [[ ${p[defer_notify]:-} == 1 ]] || ag_update_notify "$mode" "${p[name]}" "$offered"
  # The desktop run's window source was the last REPLY.
  REPLY=$offered
  return 2
}

ag_update_run_agent_guard() {
  "$engine/current/bin/agent-guard" update --to "$1" --no-prompt
}

# MODE TITLE RESTART ARG...; a successful upgrade execs RESTART exactly once.
# TITLE is accepted for existing callers and unused.
# A failed check is optional; a failed accepted installation ends this launch.
ag_update_startup() {
  emulate -L zsh
  setopt no_unset extended_glob
  local mode=$1 rc=0
  local -A agent_guard=(
    name 'Agent Guard'
    lookup ag_update_lookup_agent_guard
    run ag_update_run_agent_guard
    log "$home/Agent Guard/last-update.log"
    window_label 'Downloading update…'
    window_stages $'Preparing update…\nInstalling update…'
  )
  shift 2
  ag_update_offer "$mode" agent_guard "$@" || rc=$?
  (( rc == 2 )) || return rc
  export AGENT_GUARD_UPDATE_RESTART=1
  exec "$@"
}

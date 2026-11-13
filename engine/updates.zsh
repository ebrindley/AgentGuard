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

# Read GitHub's latest-release redirect without downloading or executing code.
# Only the numeric stable tags understood by the version comparison are offered.
ag_update_latest() {
  local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')
  local redirect tag
  redirect=$(/usr/bin/curl -q -fsS $curl_proto --connect-timeout 2 --max-time 2 -o /dev/null -w '%{redirect_url}' -- "$repo/releases/latest" 2>/dev/null) || return 1
  [[ $redirect == "$repo/releases/tag/"* ]] || return 1
  tag=${redirect#"$repo/releases/tag/"}
  [[ $tag == v<->(.<->)# ]] || return 1
  REPLY=$tag
}

# 0: a newer stable tag in REPLY; 1: no comparable newer release; 2: lookup failed.
ag_update_available() {
  local installed
  installed=$(/usr/bin/jq -er '.tag | strings' "$engine/state/stamp.json" 2>/dev/null) || return 2
  [[ $installed == v<->(.<->)# ]] || return 1
  ag_update_latest || return 2
  older "$installed" "$REPLY"
}

# Desktop update window: JXA source for `osascript -l JavaScript`, given the log
# path and the launcher's PID. It only shows progress; any failure ends it
# without affecting the update. The stage lines are printed by the installer.
ag_update_window_source() {
  read -rd '' REPLY <<'JXA' || true
ObjC.import('Cocoa');
ObjC.import('signal');
function run(argv) {
  const log = argv[0], pid = parseInt(argv[1], 10);
  const stages = ['Preparing update…', 'Installing update…'];
  $.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyAccessory);
  const win = $.NSWindow.alloc.initWithContentRectStyleMaskBackingDefer(
    $.NSMakeRect(0, 0, 340, 90), $.NSWindowStyleMaskTitled, $.NSBackingStoreBuffered, false);
  win.setTitle('Agent Guard');
  win.setLevel($.NSFloatingWindowLevel);
  win.center();
  const spinner = $.NSProgressIndicator.alloc.initWithFrame($.NSMakeRect(20, 29, 32, 32));
  spinner.setStyle($.NSProgressIndicatorStyleSpinning);
  spinner.setIndeterminate(true);
  const label = $.NSTextField.alloc.initWithFrame($.NSMakeRect(64, 33, 256, 24));
  label.setEditable(false);
  label.setBordered(false);
  label.setDrawsBackground(false);
  label.setStringValue('Downloading update…');
  win.contentView.addSubview(spinner);
  win.contentView.addSubview(label);
  spinner.startAnimation($());
  win.orderFrontRegardless();
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

# MODE TITLE RESTART ARG...; a successful upgrade execs RESTART exactly once.
# TITLE is accepted for existing callers and unused.
# A failed check is optional; a failed accepted installation ends this launch.
ag_update_startup() {
  emulate -L zsh
  setopt no_unset extended_glob
  local mode=$1 tag installed answer= rc=0 helper=
  shift 2
  if [[ ${AGENT_GUARD_UPDATE_RESTART:-} == 1 ]]; then
    unset AGENT_GUARD_UPDATE_RESTART
    return 0
  fi
  [[ ${AGENT_GUARD_GATE:-} != 1 ]] || return 0
  for answer in "$@"; do
    [[ $answer != (--help|--version|-h|-v) ]] || return 0
  done
  answer=
  [[ ! -r $engine/state/update-check || $(<"$engine/state/update-check") != off ]] || return 0
  ag_update_available || return 0
  tag=$REPLY
  installed=$(/usr/bin/jq -r .tag "$engine/state/stamp.json" 2>/dev/null) || return 0
  if [[ $mode == gui ]]; then
    answer=$(/usr/bin/osascript -e 'on run argv' -e 'button returned of (display alert "Agent Guard" message (item 1 of argv) buttons {"Later", "Update"} default button "Update" cancel button "Later")' -e 'end run' \
      "An update is available: ${tag#v}."$'\n'"You have ${installed#v}." 2>/dev/null) || return 0
    [[ $answer == Update ]] || return 0
  else
    print -ru2 -- "Agent Guard ${tag#v} is available. You have ${installed#v}."
    [[ -t 0 && -t 2 ]] || return 0
    print -nu2 -- 'Update now? [Y/n] '
    IFS= read -r answer || return 0
    [[ -z $answer || ${(L)answer} == (y|yes) ]] || return 0
  fi
  if [[ $mode == gui ]]; then
    # The window helper is stopped before any later step, on every path.
    {
      ag_update_window_source
      /usr/bin/osascript -l JavaScript -e "$REPLY" "$home/Agent Guard/last-update.log" $$ >/dev/null 2>&1 &
      helper=$!
      "$engine/current/bin/agent-guard" update --to "$tag" --no-prompt > "$home/Agent Guard/last-update.log" 2>&1 || rc=$?
    } always {
      if [[ -n $helper ]]; then
        kill $helper 2>/dev/null
        wait $helper 2>/dev/null
      fi
    }
  else
    "$engine/current/bin/agent-guard" update --to "$tag" --no-prompt || rc=$?
  fi
  (( rc == 0 )) || return 1
  if [[ $mode == gui ]]; then
    /usr/bin/osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Agent Guard"' -e 'end run' "Agent Guard updated to ${tag#v}." >/dev/null 2>&1 || true
  else
    print -ru2 -- "Agent Guard updated to ${tag#v}."
  fi
  export AGENT_GUARD_UPDATE_RESTART=1
  exec "$@"
}

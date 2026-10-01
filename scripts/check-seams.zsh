#!/bin/zsh
# usage: scripts/check-seams.zsh TREE BOOTSTRAP
# TREE is the unpacked release folder, BOOTSTRAP the filled install.sh.
# Test copies replace each production form below with a test form
# (test/engines/zsh.mjs, release). Fails when a form is missing or occurs more
# than once, or when AG_TEST_ appears anywhere in the shipped files.
emulate -L zsh
setopt no_unset pipe_fail extended_glob

(( $# == 2 )) && [[ -d $1 && -f $2 ]] || { print -u2 'usage: check-seams.zsh TREE BOOTSTRAP'; exit 2 }
tree=$1 bootstrap=$2
fails=0

# once FILE FORM: FORM must be exactly one line of FILE, apart from indentation.
once() {
  local l n=0
  [[ -f $1 ]] || { print -ru2 -- "seam: missing ${1#$tree/}"; fails=$((fails + 1)); return }
  for l in "${(@f)$(<$1)}"; do
    [[ ${l##[[:space:]]#} == "$2" ]] && n=$((n + 1))
  done
  (( n == 1 )) && return
  print -ru2 -- "seam: ${1:t}: found $n times, expected once: $2"
  fails=$((fails + 1))
}

download_base="local repo='https://github.com/ebrindley/AgentGuard'; local -a curl_proto=(--proto '=https' --proto-redir '=https')"
once "$bootstrap" "$download_base"
once "$bootstrap" 'test_point() { : }'
once "$bootstrap" "account_home || die 'cannot resolve account home'"
# The launcher's account lookup, which test/fixture-home.mjs replaces.
once "$tree/engine/launch" "account_home || { print -ru2 'agent-guard: cannot resolve account home'; exit 1 }"
# account.zsh keeps its function; a test copy appends an override after it.
once "$tree/engine/account.zsh" 'account_home() {'
# The installer's kill and fail points; uninstall.sh uses the same function.
once "$tree/profiles/opencode/install.sh" 'test_point() { : }'
# The boot time that decides forwarder removal, and the running-process check of a migration.
once "$tree/profiles/opencode/install.sh" 'boot_time() {'
once "$tree/profiles/opencode/install.sh" 'local pgrep=/usr/bin/pgrep'
once "$tree/engine/agent-guard" "$download_base"
# Where the launcher looks for the CLI and the app.
once "$tree/profiles/opencode/harness.zsh" 'cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$home/.opencode/bin/opencode")'
once "$tree/profiles/opencode/harness.zsh" 'app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")'
once "$tree/profiles/opencode/harness.zsh" 'app_bundle_id=ai.opencode.desktop'

found=(${(f)"$(/usr/bin/grep -rl -- AG_TEST_ "$tree" "$bootstrap")"})
if (( $#found )); then
  print -ru2 -- "seam: AG_TEST_ in shipped files: ${(j:, :)found}"
  fails=$((fails + 1))
fi
(( fails == 0 ))

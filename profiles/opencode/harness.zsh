# Trusted profile data, loaded only from the account-derived engine folder.
name=opencode
title=OpenCode
libs=(hooks.zsh skills.zsh runtime.zsh)
cli_names=(opencode)
cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$home/.opencode/bin/opencode")
app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")
app_bundle_id=ai.opencode.desktop
writable=("$home/.local/share/opencode" "$home/.local/state/opencode" "$home/.cache"
          "$home/Library/Caches" "$home/.npm" "$home/.bun/install/cache" "$home/.cc-safety-net/logs")
writable_gui=("$home/Library/Application Support/ai.opencode.desktop"
              "$home/Library/Saved Application State/ai.opencode.desktop.savedState")
protected_paths=("$home/.config/opencode/plugins/agent-guard.js"
                 "$home/.config/opencode/plugins/.agent-guard.js.partial" "$home/.opencode/bin")
protected=($protected_paths "$home/.cc-safety-net")
protected_names=()
protected_fragment=protected.sb
state_hook=opencode_state_roots
gui_args=(--no-sandbox)
credential_paths=("$home"/{.ssh,.gnupg,.aws,.git-credentials,.netrc,.npmrc,.secrets,.docker/config.json,.kube/config,.config/git/credentials})
credential_fragment=credentials.sb
env_unset=(ELECTRON_RUN_AS_NODE OPENCODE_SIDECAR_V2 CC_SAFETY_NET_HOME CC_SAFETY_NET_WORKTREE SAFETY_NET_WORKTREE CC_SAFETY_NET_AUDIT_HOME
           SSH_AUTH_SOCK GPG_AGENT_INFO)
env_set=(CC_SAFETY_NET_PROJECT_TIGHTEN_ONLY=1 NPM_CONFIG_USERCONFIG=/dev/null)
check_hook=opencode_check

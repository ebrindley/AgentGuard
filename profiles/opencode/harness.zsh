# Trusted profile data, loaded only from the account-derived engine folder.
name=opencode
title=OpenCode
cli_names=(opencode)
cli_search=(/opt/homebrew/bin/opencode /usr/local/bin/opencode "$home/.opencode/bin/opencode")
app_paths=(/Applications/OpenCode.app "$home/Applications/OpenCode.app")
app_bundle_id=ai.opencode.desktop
writable=("$home/.local/share/opencode" "$home/.local/state/opencode" "$home/.cache"
          "$home/Library/Caches" "$home/.npm" "$home/.bun/install/cache" "$home/.cc-safety-net/logs")
writable_gui=("$home/Library/Application Support/ai.opencode.desktop"
              "$home/Library/Saved Application State/ai.opencode.desktop.savedState")
protected_paths=("$home/.config/opencode" "$home/.opencode")
protected=($protected_paths "$home/.cc-safety-net")
protected_names=(.opencode opencode.json opencode.jsonc tui.json tui.jsonc)
protected_fragment=protected.sb
gui_args=(--no-sandbox)
env_unset=(ELECTRON_RUN_AS_NODE OPENCODE_SIDECAR_V2 CC_SAFETY_NET_HOME)
env_set=(OPENCODE_SANDBOXED=1 CC_SAFETY_NET_PARANOID_RM=1)
prepare_hook=opencode_prepare
check_hook=opencode_check

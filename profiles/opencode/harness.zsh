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
# Code and configuration OpenCode runs or trusts from its writable cache, relative
# to the cache root state_hook resolves: the package store, the legacy store with
# its install metadata, bin and the model catalog. Write-denied after the list rules,
# with link targets protected and the folders above pinned; cache_folders are
# created before exec, since OpenCode creates bin at every start.
cache_protected=(opencode/packages opencode/node_modules opencode/package.json opencode/package-lock.json
                 opencode/bun.lock opencode/bin opencode/models.json)
cache_catalogs=(opencode 'models-[^/]*\.json$')
cache_folders=(opencode/bin)
state_hook=opencode_state_roots
gui_args=(--no-sandbox)
env_unset=(ELECTRON_RUN_AS_NODE OPENCODE_SIDECAR_V2 CC_SAFETY_NET_HOME CC_SAFETY_NET_WORKTREE SAFETY_NET_WORKTREE)
env_set=(CC_SAFETY_NET_PARANOID_RM=1)
prepare_hook=opencode_prepare
check_hook=opencode_check

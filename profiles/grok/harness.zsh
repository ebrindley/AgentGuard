# Trusted profile data, loaded only from the account-derived engine folder.
name=grok
title=Grok
libs=(args.zsh hooks.zsh)
cli_names=(grok)
cli_search=("$home/.grok/bin/grok")
cli_binding="$engine/state/grok-executable"
cli_kept="$engine/state/grok-kept"
args_hook=grok_args
protect_hook=grok_protect
check_hook=grok_check
writable=("$home/.grok" "$home/.cache" "$home/Library/Caches" "$home/.npm" "$home/.local/state/gh")
protected_paths=("$home/.local/bin/grok"
                 "$home/.grok"/{bin,downloads,vendor,hooks,hooks-paths,bundled,bundles}
                 "$home/.grok"/{config,sandbox,requirements,managed_config,trusted_folders}.toml
                 "$home/.config/gh")
protected=($protected_paths)
credential_paths=("$home"/{.ssh,.gnupg,.aws,.git-credentials,.netrc,.npmrc,.secrets,.docker/config.json,.kube/config,.config/git/credentials})
credential_fragment=credentials.sb
git_hooks=1
env_unset=(SSH_AUTH_SOCK GPG_AGENT_INFO)
env_set=(NPM_CONFIG_USERCONFIG=/dev/null)

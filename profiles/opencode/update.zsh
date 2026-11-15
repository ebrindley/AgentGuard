# OpenCode as a product of the shared update offer in engine/updates.zsh, which
# owns the gate, the transport, the comparison, the questions and the run. The
# launcher sets cli (the resolved executable) and opencode_version (from
# opencode_major) before calling opencode_update_offer, and provides
# opencode_upgrade, which installs one version outside the sandbox.

# CLI VERSION: 0 when this installation gets an offer: a stable OpenCode 2
# release in the opencode.ai installer's location or in an npm global install
# that Volta and mise do not own. Anything else returns 1; the explicit
# upgrade command still works there.
opencode_update_eligible() {
  local exe=${1:A} installer=$home/.opencode/bin/opencode
  [[ $2 == 2.<->.<-> ]] || return 1
  installer=${installer:A}
  [[ $exe == $installer ]] && return 0
  [[ ${exe:h:t} == bin && ${exe:h:h} == */lib/node_modules/@opencode/cli ]] || return 1
  [[ $exe != */tools/image/packages/* && $exe != */installs/npm-* ]]
}

# The lookup for ag_update_check: reply=(installed offered) from the release
# service's JSON reply. 1 when not eligible, 2 when the lookup failed.
opencode_update_lookup() {
  local installed=${opencode_version:-} url body offered
  opencode_update_eligible "${cli:-}" "$installed" || return 1
  url='https://opencode.ai/update/api/latest/cli/npm'
  body=$(ag_update_fetch "$url?current=$installed") || return 2
  offered=$(/usr/bin/jq -er '.version | strings' <<<"$body" 2>/dev/null) || return 2
  [[ $offered == <->.<->.<-> ]] || return 2
  reply=($installed $offered)
}

opencode_update_run() {
  opencode_upgrade "$1"
}

# MODE ARG...: the shared offer for OpenCode. Returns 0 when nothing was
# installed, 1 when an accepted update failed and 2 when it was installed.
opencode_update_offer() {
  local mode=$1
  local -A opencode_product=(
    name OpenCode
    lookup opencode_update_lookup
    same_major same-major
    note "The update runs without Agent Guard's protection."
    run opencode_update_run
    log "$home/Agent Guard/last-opencode-update.log"
    window_label 'Updating OpenCode…'
  )
  shift
  ag_update_offer "$mode" opencode_product "$@"
}

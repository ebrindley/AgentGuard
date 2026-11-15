# OpenCode as a product of the shared update offer in engine/updates.zsh, which
# owns the gate, the transport, the comparison, the questions and the run. The
# launcher sets cli (the resolved executable) and opencode_version (from
# opencode_major) before calling opencode_launch_offer, and provides
# opencode_upgrade, which installs one version outside the sandbox.

# Why the last eligibility check refused an installation, as a clause that
# follows "because". Empty after a check that passed, and for a CLI that belongs
# to the app, whose route opencode_update_route gives.
opencode_reason=

# Where the last eligibility check that passed found the latest release: npm
# (the update service's npm feed, for the opencode.ai installer and npm global
# installs), tap (its Homebrew feed, for the opencode-v2 formula) or core
# (Homebrew's index, for the opencode formula). Empty after a refusal.
opencode_source=

# REASON: records why an installation gets no offer; returns 1.
opencode_refuse() {
  opencode_reason=$1
  return 1
}

# CLI VERSION: 0 when this installation gets an offer: a stable OpenCode 2
# release in the opencode.ai installer's location, in an npm global install that
# Volta and mise do not own, or in a Cellar folder of the opencode or opencode-v2
# formula, the installations OpenCode's own updater can update. Sets
# opencode_source. Anything else returns 1 with opencode_reason set; the explicit
# upgrade command still works there.
opencode_update_eligible() {
  local exe=${1:A} installer=$home/.opencode/bin/opencode
  opencode_reason= opencode_source=
  ! opencode_bundled "$exe" || return 1
  if [[ $2 != 2.<->.<-> ]]; then
    if [[ $2 == 1.* ]]; then opencode_refuse 'it is OpenCode 1'; else opencode_refuse 'it is a prerelease'; fi
    return
  fi
  installer=${installer:A}
  [[ $exe == $installer ]] && { opencode_source=npm; return 0 }
  case $exe in
    (*/tools/image/packages/*) opencode_refuse 'it was installed by Volta' ;;
    (*/installs/npm-*) opencode_refuse 'it was installed by mise' ;;
    (*/lib/node_modules/@opencode/cli/bin/[^/]#) opencode_source=npm ;;
    (*/Cellar/opencode/*) opencode_source=core ;;
    (*/Cellar/opencode-v2/*) opencode_source=tap ;;
    (*/Cellar/*|*/Caskroom/*) opencode_refuse 'it was installed by Homebrew' ;;
    (*) opencode_refuse 'it was installed another way' ;;
  esac
}

# URL [INSTALLED [FIELD]]: asks the service at URL for the latest release, the
# one request every OpenCode lookup makes. The update service is told the
# release INSTALLED; with none, as for Homebrew's index, the request carries no
# query. FIELD is the jq path of the version in the JSON reply (.version when
# omitted). On success reply=(offered body) holds the version, three numeric
# components, and the JSON reply; 1 otherwise.
opencode_update_feed() {
  local body offered
  body=$(ag_update_fetch "$1${2:+?current=$2}") || return 1
  offered=$(/usr/bin/jq -er "${3:-.version} | strings" <<<"$body" 2>/dev/null) || return 1
  [[ $offered == <->.<->.<-> ]] || return 1
  reply=($offered $body)
}

# The lookup for ag_update_check: reply=(installed offered) from the release
# service's JSON reply or, for the opencode formula, Homebrew's index. 1 when
# not eligible, 2 when the lookup failed.
opencode_update_lookup() {
  local installed=${opencode_version:-} url query field=.version
  query=$installed
  opencode_update_eligible "${cli:-}" "$installed" || return 1
  case $opencode_source in
    (npm)
      url='https://opencode.ai/update/api/latest/cli/npm'
      ;;
    (tap)
      url='https://opencode.ai/update/api/latest/cli/homebrew'
      ;;
    (core)
      url='https://formulae.brew.sh/api/formula/opencode.json'
      query= field=.versions.stable
      ;;
  esac
  opencode_update_feed "$url" "$query" "$field" || return 2
  reply=($installed $reply[1])
}

opencode_update_run() {
  opencode_upgrade "$1"
}

opencode_update_log() {
  print -r -- "$home/Agent Guard/last-opencode-update.log"
}

# MODE LOOKUP RUN ARG...: the shared offer for an OpenCode product, the terminal
# CLI or the desktop app. Returns 0 when nothing was installed, 1 when an
# accepted update failed and 2 when it was installed.
opencode_offer() {
  local mode=$1
  local -A opencode_product=(
    name OpenCode
    lookup $2
    same_major same-major
    note "The update runs without Agent Guard's protection."
    run $3
    log "$(opencode_update_log)"
    window_label 'Updating OpenCode…'
  )
  shift 3
  ag_update_offer "$mode" opencode_product "$@"
}

# MODE ARG...: the offer for the CLI.
opencode_update_offer() {
  local mode=$1
  shift
  opencode_offer "$mode" opencode_update_lookup opencode_update_run "$@"
}

# MAJOR ARG...: the launcher's offer at the start of an OpenCode session, whose
# executable is $cli and whose major version is MAJOR. The launcher calls it
# only in cli mode, with the nesting probe passed and ARG... an interactive
# session. A declined, failed or unanswered check leaves the launch as it was;
# an accepted update that failed, or that did not install the offered version,
# ends it. On return cli, opencode_version and REPLY (the major) describe the
# executable the session starts.
opencode_launch_offer() {
  local major=$1 offered rc=0
  shift
  opencode_update_offer "$mode" "$@" || rc=$?
  case $rc in
    (0) REPLY=$major ;;
    (1) fail 'the OpenCode update failed. Run opencode upgrade in Terminal to finish it, then reopen.' ;;
    (2)
      offered=$REPLY
      next_cli || fail "${cli_names[1]} not found after the OpenCode update"
      cli=$REPLY
      opencode_major "$cli"
      [[ $opencode_version == "$offered" && $REPLY == "$major" ]] ||
        fail "the OpenCode update did not install the version offered: expected $offered, found $opencode_version. Run opencode upgrade in Terminal, then reopen."
      ;;
  esac
}

# The desktop app is the third product. The launcher sets app, the bundle it
# found for this launch, before it calls opencode_desktop_launch_offer.

# EXECUTABLE: REPLY is arm64 or x64 for a Mach-O file of that one architecture,
# the names the update service gives its builds. 1 for a universal binary, a
# script or anything unreadable.
opencode_desktop_arch() {
  local header
  header=$(/usr/bin/od -An -tx1 -N8 "$1" 2>/dev/null) || return 1
  case ${header//[[:space:]]/} in
    (cffaedfe0c000001) REPLY=arm64 ;;
    (cffaedfe07000001) REPLY=x64 ;;
    (*) return 1 ;;
  esac
}

# APP: REPLY is the Team Identifier of APP's signature; 1 when it has none.
opencode_desktop_team() {
  local line
  for line in "${(@f)$(/usr/bin/codesign -d --verbose=2 "$1" 2>&1)}"; do
    [[ $line == (#b)TeamIdentifier=([A-Z0-9](#c10)) ]] && { REPLY=$match[1]; return 0 }
  done
  return 1
}

# APP: REPLY is the CFBundleShortVersionString of APP; 1 when it has none.
opencode_desktop_version() {
  REPLY=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$1/Contents/Info.plist" 2>/dev/null)
}

# APP: 0 when this installation gets an offer, then reply=(version arch). It is
# a stable N.N.N release in a real folder, not a link, whose parent the operator
# can write, with a valid signature that has a Team Identifier and an executable
# of one architecture the update service builds. Anything else returns 1 with
# opencode_reason set.
opencode_desktop_eligible() {
  local app=$1 plist=$1/Contents/Info.plist version main arch
  opencode_reason=
  [[ ! -L $app ]] || { opencode_refuse 'it is a link'; return }
  [[ -d $app ]] || { opencode_refuse 'it is not a folder'; return }
  [[ -w ${app:h} ]] || { opencode_refuse "its folder ${${app:h}/#$home/~} cannot be written by this account"; return }
  opencode_desktop_version "$app" || { opencode_refuse 'its version cannot be read'; return }
  version=$REPLY
  [[ $version == <->.<->.<-> ]] || { opencode_refuse 'it is a prerelease'; return }
  main=$(/usr/bin/plutil -extract CFBundleExecutable raw "$plist" 2>/dev/null) || { opencode_refuse 'its executable cannot be read'; return }
  opencode_desktop_arch "$app/Contents/MacOS/$main" || { opencode_refuse 'its executable is not a single-architecture build'; return }
  arch=$REPLY
  /usr/bin/codesign --verify --deep --strict "$app" 2>/dev/null || { opencode_refuse 'its signature cannot be checked'; return }
  opencode_desktop_team "$app" || { opencode_refuse 'its signature has no Team Identifier'; return }
  reply=($version $arch)
}

# Succeeds when Homebrew is installed on this Mac and its Caskroom holds the
# OpenCode cask. Only files are read; brew never runs.
opencode_brew_cask() {
  local prefix
  local -a prefixes=(/opt/homebrew /usr/local)
  for prefix in $prefixes; do
    [[ -x $prefix/bin/brew && -d $prefix/Caskroom/opencode-desktop ]] && return 0
  done
  return 1
}

# KIND: REPLY is how to update an installation by hand, a clause after "To
# update,": the CLI (run its own updater) or the app (install the download, or
# the cask when this Mac has it). Every message that names a way to update by
# hand takes it from here.
opencode_hand_route() {
  if [[ $1 == cli ]]; then
    REPLY='run opencode upgrade in Terminal, outside a session'
  else
    REPLY='quit OpenCode and install the download from opencode.ai'
    ! opencode_brew_cask || REPLY+=' or run brew upgrade --cask opencode-desktop'
  fi
}

# KIND TARGET [VERSION]: how the installation at TARGET is updated, as sentences
# in REPLY. KIND is cli (TARGET is the executable, VERSION what it reports) or
# app (TARGET is the bundle). Returns 0 when Agent Guard offers its updates and
# 1 when it does not, from the same checks that decide the launch offers, so the
# reason and the decision cannot differ. The CLI inside the app is updated with
# the app and takes the app's route. Reads files and runs the system's plutil and
# codesign on the app; runs no OpenCode and makes no request.
opencode_update_route() {
  local kind=$1 target=$2 route
  if [[ $kind == cli ]] && opencode_bundled "$target"; then
    opencode_update_route app "${${target:A}%/Contents/Resources/opencode-cli}" || true
    REPLY="This OpenCode belongs to the OpenCode app and is updated with the app. $REPLY"
    return 1
  fi
  if [[ $kind == cli ]]; then
    opencode_update_eligible "$target" "${3:-}" && route='Agent Guard offers its updates when you run opencode in Terminal.'
  else
    opencode_desktop_eligible "$target" && route='Agent Guard offers its updates when you open Agent Guard.'
  fi
  if [[ -n ${route:-} ]]; then
    REPLY=$route
    return 0
  fi
  opencode_hand_route $kind
  REPLY="Agent Guard does not offer updates because $opencode_reason. To update, $REPLY."
  return 1
}

# The lookup for ag_update_check: reply=(installed offered) from the update
# service's JSON reply, and opencode_desktop_asset=(url sha256 size) of the zip
# for this app's architecture. 1 when this installation gets no offer, 2 when the
# lookup failed or its reply names no usable archive.
opencode_desktop_lookup() {
  local installed arch url origin
  local -a asset
  opencode_desktop_asset=()
  opencode_desktop_eligible "${app:-}" || return 1
  installed=$reply[1] arch=$reply[2]
  url='https://opencode.ai/update/api/latest/desktop/opencode'
  origin='https://opencode.ai/'
  opencode_update_feed "$url" "$installed" || return 2
  asset=(${(f)"$(/usr/bin/jq -r --arg file "opencode-desktop-mac-$arch.zip" \
    '.metadata.files[$file] | (.url | strings), (.sha256 | strings), (.size | numbers | tostring)' <<<"$reply[2]" 2>/dev/null)"})
  [[ $#asset == 3 && ${asset[1]} == "$origin"[[:graph:]]## && ${(L)asset[2]} == [0-9a-f](#c64) && ${asset[3]} == <-> ]] || return 2
  opencode_desktop_asset=(${asset[1]} ${(L)asset[2]} ${asset[3]})
  reply=($installed $reply[1])
}

# The reason an update stopped, one line in the log or on the terminal; returns 1.
opencode_desktop_stop() {
  print -ru2 -- "OpenCode update stopped: $*"
  return 1
}

# STAGING: downloads the archive the lookup found into STAGING and checks its
# SHA-256. The size limit stops a download far larger than the service said.
opencode_desktop_download() {
  local zip=$1/update.zip sum
  local url=$opencode_desktop_asset[1] sha=$opencode_desktop_asset[2] size=$opencode_desktop_asset[3]
  ag_update_fetch "$url" -o "$zip" --max-time 600 --max-filesize $(( size + size / 10 + 1048576 )) ||
    { opencode_desktop_stop 'the download failed'; return }
  sum=$(/usr/bin/shasum -a 256 < "$zip" 2>/dev/null) || { opencode_desktop_stop 'cannot read the download'; return }
  sum=${sum%% *}
  [[ ${(L)sum} == "$sha" ]] || opencode_desktop_stop 'the download does not match the SHA-256 the update service gave'
}

# STAGING: extracts the archive into STAGING/new, which must hold exactly
# OpenCode.app, the name the update service gives the app whatever the installed
# one is called.
opencode_desktop_unpack() {
  local -a top
  /bin/mkdir -m 700 -- "$1/new" && /usr/bin/ditto -x -k "$1/update.zip" "$1/new" 2>/dev/null ||
    { opencode_desktop_stop 'the download is not a readable archive'; return }
  top=("$1/new"/*(DN))
  [[ $#top == 1 && ${top[1]:t} == OpenCode.app && -d ${top[1]} && ! -L ${top[1]} ]] ||
    opencode_desktop_stop 'the archive does not hold exactly OpenCode.app'
}

# OFFERED NEW: checks the extracted app before it replaces anything: the
# installed app's bundle ID, executable name and Team Identifier, the offered
# version, the installed app's designated requirement and Gatekeeper.
opencode_desktop_verify() {
  local offered=$1 new=$2 key want got req team
  for key in CFBundleIdentifier CFBundleExecutable; do
    want=$(/usr/bin/plutil -extract $key raw "$app/Contents/Info.plist" 2>/dev/null) && [[ -n $want ]] ||
      { opencode_desktop_stop "cannot read $key of the installed app"; return }
    got=$(/usr/bin/plutil -extract $key raw "$new/Contents/Info.plist" 2>/dev/null) || got=
    [[ $got == "$want" ]] || { opencode_desktop_stop "the new app's $key is ${got:-missing}, not $want"; return }
  done
  got=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$new/Contents/Info.plist" 2>/dev/null) || got=
  [[ $got == "$offered" ]] || { opencode_desktop_stop "the new app is version ${got:-unknown}, not $offered"; return }
  req=$(/usr/bin/codesign -d -r- "$app" 2>/dev/null) && [[ $req == 'designated => '?* ]] ||
    { opencode_desktop_stop "cannot read the installed app's designated requirement"; return }
  opencode_desktop_team "$app" && team=$REPLY ||
    { opencode_desktop_stop "the installed app has no Team Identifier"; return }
  opencode_desktop_team "$new" && [[ $REPLY == "$team" ]] ||
    { opencode_desktop_stop "the new app is not signed by team $team"; return }
  /usr/bin/codesign --verify --deep --strict "-R=${req#'designated => '}" "$new" 2>/dev/null ||
    { opencode_desktop_stop "the new app does not satisfy the installed app's designated requirement"; return }
  /usr/sbin/spctl --assess --type execute "$new" 2>/dev/null || opencode_desktop_stop 'Gatekeeper does not accept the new app'
}

# STAGING NEW: moves the installed app into STAGING and NEW into its place, both
# renames on one volume. When the second fails the first is undone.
opencode_desktop_swap() {
  /bin/mv -- "$app" "$1/old" 2>/dev/null || { opencode_desktop_stop "cannot move ${app:t} aside"; return }
  /bin/mv -- "$2" "$app" 2>/dev/null && return
  /bin/mv -- "$1/old" "$app" 2>/dev/null
  opencode_desktop_stop "cannot move the new ${app:t} into place"
}

# OFFERED: the product's run. The staging folder is inside the app's parent, so
# the swap stays on one volume and is out of reach of a guarded session. Any
# failure leaves the installed app as it was; the app's path is never left empty
# and a previous app that cannot be put back is kept, not deleted. An old app
# that cannot be removed afterwards does not fail the update.
opencode_desktop_run() {
  local staging rc=0
  staging=$(/usr/bin/mktemp -d "${app:h}/.opencode-update.XXXXXXXX" 2>/dev/null) ||
    { opencode_desktop_stop "cannot create a staging folder in ${app:h}"; return }
  {
    opencode_desktop_download "$staging" &&
      opencode_desktop_unpack "$staging" &&
      opencode_desktop_verify "$1" "$staging/new/OpenCode.app" &&
      opencode_desktop_swap "$staging" "$staging/new/OpenCode.app" || rc=$?
  } always {
    if [[ ! -d $app && -d $staging/old ]]; then
      /bin/mv -- "$staging/old" "$app" 2>/dev/null ||
        { print -ru2 -- "OpenCode update stopped: the previous ${app:t} is kept in $staging"; staging= }
    fi
    [[ -z $staging ]] || /bin/rm -rf -- "$staging" 2>/dev/null
  }
  return $rc
}

# MODE ARG...: the offer for the app.
opencode_desktop_offer() {
  local mode=$1
  shift
  opencode_offer "$mode" opencode_desktop_lookup opencode_desktop_run "$@"
}

# ARG...: the launcher's offer for the app, after Agent Guard's own, in gui mode
# with the nesting probe passed. A declined, failed or unanswered check leaves
# the launch as it was; an accepted update that failed, or that did not install
# the offered version, ends it. On return app and main describe the bundle that
# starts.
opencode_desktop_launch_offer() {
  local rc=0 offered found
  opencode_desktop_offer "$mode" "$@" || rc=$?
  case $rc in
    (1)
      opencode_hand_route app
      fail "the OpenCode update failed and the app was not changed. To update by hand, $REPLY. Details: $(opencode_update_log)"
      ;;
    (2)
      offered=$REPLY
      found=$(/usr/bin/plutil -extract CFBundleShortVersionString raw "$app/Contents/Info.plist" 2>/dev/null) || found=
      [[ $found == "$offered" ]] ||
        fail "the OpenCode update did not install the version offered: expected $offered, found ${found:-none}."
      main=$(/usr/bin/plutil -extract CFBundleExecutable raw "$app/Contents/Info.plist" 2>/dev/null) && [[ -x $app/Contents/MacOS/$main ]] ||
        fail "the updated OpenCode has no executable to start."
      ;;
  esac
}

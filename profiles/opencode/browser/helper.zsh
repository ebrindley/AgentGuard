#!/bin/zsh -f
# A launcher-owned sibling of the sandbox. The request contains only a URL.
emulate -L zsh
setopt no_unset extended_glob
export LC_ALL=C
zmodload zsh/net/socket || exit 1

allowed_url() {
  local url=$1 pathname=${1%%\?*}
  [[ ${#url} -le 8192 && $url != *[^[:graph:]]* && $url != *\\* && $url != *\#* ]] || return 1
  [[ $pathname != *..* && $pathname != *%* ]] || return 1
  case $url in
    https://auth.openai.com/api/accounts/authorize\?*|https://auth.openai.com/oauth/authorize\?*|https://auth.openai.com/codex/device) return 0 ;;
    https://opencode.ai/console/*) return 0 ;;
    https://claude.ai/oauth/authorize\?*|https://console.anthropic.com/oauth/authorize\?*|https://platform.claude.com/oauth/authorize\?*) return 0 ;;
  esac
  return 1
}

# Source-only policy use by focused tests; this does not open a listener.
[[ ${ZSH_EVAL_CONTEXT} == *:file ]] && return 0
(( $# == 2 )) || exit 2
socket=$1 browser=$2
[[ $socket == /* && $browser == /* && -d $browser ]] || exit 2
umask 077
zsocket -l "$socket" || exit 1
listener=$REPLY
trap 'exit 0' TERM INT HUP
# A client that disconnects before its reply must not end the helper.
trap '' PIPE
read_part() {
  local count=$1 byte remaining i
  REPLY=
  for (( i=0; i<count; i++ )); do
    remaining=$(( deadline - SECONDS ))
    (( remaining > 0 )) && IFS= read -r -u "$fd" -k 1 -t "$remaining" byte || return 1
    REPLY+=$byte
  done
}
while zsocket -a "$listener"; do
  fd=$REPLY
  header= url=
  integer deadline=$(( SECONDS + 2 ))
  if read_part 5 && header=$REPLY && [[ $header == [0-9](#c5) ]]; then
    integer size=$(( 10#$header ))
    if (( size > 0 && size <= 8192 )) && read_part "$size" && url=$REPLY && allowed_url "$url"; then
      # Explicit browser target prevents a URL's associated application from
      # becoming a caller-selected executable. No shell interprets the URL.
      if /usr/bin/open -a "$browser" -- "$url" >/dev/null 2>&1; then
        print -r -u "$fd" -- ok
      else
        print -r -u "$fd" -- 'error: browser could not be opened'
      fi
    else
      print -r -u "$fd" -- 'error: unsupported authentication URL'
    fi
  else
    print -r -u "$fd" -- 'error: invalid browser request'
  fi
  exec {fd}>&-
done

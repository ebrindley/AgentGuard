# Account home lookup for the installer, the uninstaller and agent-guard. A verbatim
# copy of the function in engine/launch; test/test.sh checks that the two match.
account_home() {
  local login record
  login=$(/usr/bin/id -un) || return 1
  [[ -n $login ]] || return 1
  record=$(/usr/bin/dscl /Search -read "/Users/$login" NFSHomeDirectory) || return 1
  case $record in
    ('NFSHomeDirectory: /'*) REPLY=${record#NFSHomeDirectory: } ;;
    ($'NFSHomeDirectory:\n /'*) REPLY=${record#$'NFSHomeDirectory:\n '} ;;
    (*) return 1 ;;
  esac
  [[ $REPLY == /* && $REPLY != / && $REPLY != *$'\n'* && -d $REPLY ]]
}

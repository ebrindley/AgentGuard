#!/bin/zsh
# Agent Guard installer (docs/DESIGN.md section 6), which also migrates older
# installs such as OpenCode Guard's (section 10). This file is the entry; the code
# is in the installer folder: lib.zsh, actions.zsh and the harness and migration
# modules it names, next to this file in a release folder or state/txn, or at the
# top of the tree.
#   zsh install.sh [--projects DIR] [--gui]
#       From a checkout or an unpacked archive: copies the tree into the engine
#       folder's stage/<txn>/tree, then runs that copy with --stage.
#   install.sh --stage TXN [--projects DIR] [--gui] [--update]
#       The bootstrap's form: installs the tree in stage/TXN/tree, under the
#       bootstrap's lock.
#   install.sh --recover install|update|uninstall
#       Run by recovery as state/txn/install.sh, under its caller's lock: discards,
#       resumes, rolls back or cleans up the open transaction, then exits.
#   source install.sh --lib
#       Defines the functions only; uninstall.sh and agent-guard use them.
# Nothing runs until the last line, and every module is read before any step runs.

main() {
  local dir m
  ag_self=${${(%):-%x}:A}
  dir="${ag_self:h}/installer"
  [[ -d $dir ]] || dir="${ag_self:h:h:h}/installer"
  { source "$dir/lib.zsh" && source "$dir/actions.zsh" } || { print -ru2 -- "Agent Guard: cannot load $dir"; return 1 }
  ag_modules
  for m in harness/${^ag_harness_modules} migrate/${^ag_migration_modules}; do
    source "$dir/$m.zsh" || { print -ru2 -- "Agent Guard: cannot load $dir/$m.zsh"; return 1 }
  done
  [[ ${1:-} == --lib ]] && return 0
  emulate -L zsh
  setopt no_unset pipe_fail extended_glob
  case ${1:-} in
    (--recover) shift; ag_recover_main "$@" ;;
    (--stage) (( $# >= 2 )) || { ag_err 'usage: install.sh --stage TXN [options]'; exit 2 }; shift; ag_install_main "$@" ;;
    (*) ag_checkout_main "$@" ;;
  esac
}
main "$@"

# Agent Guard installer: the module list, the action registry and the interfaces
# a harness or migration module implements (docs/DESIGN.md section 6).
#
# Modules. lib.zsh holds the transaction machinery and the engine's own steps.
# harness/<name>.zsh adds a harness, migrate/<name>.zsh moves an older install to
# Agent Guard. ag_modules names them; install.sh sources lib.zsh, this file and
# then each named module, and a module only defines functions. A module's hooks
# are functions named ag_h_<name>_<hook> (harness) or ag_m_<name>_<hook>
# (migration), with - in <name> written as _; lib.zsh calls them through ag_hook
# (required) and ag_hook_opt (optional). The transaction copies every module into
# state/txn, and recovery runs those copies (frozen recovery bundle), so a do or
# undo handler may call any module's functions.
#
# Action registry. ag_registry lists, in switch order, every action that changes
# files outside the engine folder and the list, one row each:
#   phase  staged: runs inside the transaction after the list step and before the
#          staged check (P6a); a discard undoes it, in reverse order.
#          switch: runs in the switch (ag_switch); a rollback undoes it, in reverse
#          order (ag_rollback); a journal line naming it means the switch began
#          (ag_switch_begun), whatever transaction registered it.
#   name   the journal name: [a-z-]+, one name per action. One action may have two
#          rows with disjoint kinds when its place differs (app).
#   owner  engine; harness:<name>, run when the transaction installs that harness
#          (plan.json harnesses); migrate:<name>, run when it migrates from that
#          source (plan.json migration).
#   kinds  all; plain, install and update only; migrate, migrations only.
#   run    the do handler. It journals "<name> begun [detail]" after taking its
#          backup (ag_backup) and before its first change, calls test_point <name>,
#          and journals "<name> done" last; run again after an interruption it
#          finishes from the journal and backup. It returns 0 without a journal
#          line when nothing needs changing.
#   back   the undo handler: puts back what run changed, from the journal and the
#          backup, journals "<name> undone", and does nothing when the action has
#          no begun line.
# do_rulebook and undo_rulebook in lib.zsh are the model.
#
# Harness interface, ag_h_<name>_<hook>. Required unless marked optional:
#   detect          status 0 when the harness is to be installed on this Mac.
#   staged          the staged check of releases/$ag_rid_new (P7); prints its
#                   results, adds FAIL lines to ag_failed and fails.
#   gate            after the live doctor (design section 6, Gate); adds FAIL lines
#                   to ag_failed.
#   doctor RELEASE [--json]  this harness's part of agent-guard doctor, from
#                   RELEASE. With --json it prints nothing and sets reply to its
#                   check lines and REPLY to the JSON object of fields it adds.
#   uninstall_remove  U3: removes what keeps an unguarded start refused (OpenCode:
#                   the plugin); fails, naming it, to keep the engine folder.
#   init            optional: sets the harness's paths (ag_init calls it).
#   title           optional: REPLY = its name for messages.
#   prepare         optional: preflight before the transaction (OpenCode: which
#                   configs get permission values, ag_configs).
#   volume          optional: reply = paths that must be on the engine's volume.
#   bundle          optional: reply = tree-relative files that recovery reads,
#                   copied into state/txn (OpenCode: harness.zsh).
#   assemble DIR    optional: adds the harness's files to the release folder DIR
#                   being assembled (P4; Pi: profiles/pi and bin/pi, bin/omp).
#   links           optional: reply = link and target pairs for the stamp.
#   files           optional: reply = installed files outside the release folder
#                   whose hashes the stamp records (Pi: its copies in ~/.local/bin
#                   and the extension folder).
#   keep            optional: after the stamp, before the cleanup deletes
#                   txn/backup, moves what must outlive the transaction into
#                   state/ (Pi: replaced entries into state/legacy/replaced); fails
#                   to keep the transaction open for the next run's recovery.
#   procs           optional: reply = process names, REPLY = how to quit them, for
#                   a migration's process check (ag_proc_check).
#   uninstall_restore DIR  optional: U2, puts back the values the harness changed,
#                   using DIR for scratch files; adds a file it could not restore
#                   to ag_unrestored, and sets ag_unreadable when its record
#                   cannot be read.
#   report          optional: lines after a successful install.
# Its switch actions are rows with owner harness:<name>.
#
# Migration interface, ag_m_<name>_<hook>. Required unless marked optional:
#   detect          REPLY = migrate (a transaction moves it), retiring (switched,
#                   retirement unfinished), done or none; fails when its state
#                   cannot be read.
#   harness         REPLY = the harness it hands over to.
#   retire          after the stamp of its transaction and before any install
#                   that finds it retiring; does only what is unfinished; fails to
#                   leave it retiring.
#   init            optional: sets its paths; may add its state folder to
#                   ag_probe_dirs and its PATH block markers, start and end, to
#                   ag_old_blocks.
#   title           optional: REPLY = its name for messages.
#   checks          optional: preflight checks and notes, before any change, in
#                   every install.
#   begin           optional: a line after its transaction opens.
#   list_import     optional: before the list step (P6b), in every install.
#   before_switch   optional: the last check before its switch.
#   gate            optional: extra checks after its switch; adds FAIL lines to
#                   ag_failed.
#   links           optional: reply = link and target pairs for the stamp.
#   keep            optional: as the harness hook, for its own files in the
#                   backup, after the harnesses' and before retire.
#   recover_check   optional: before recovery finishes or undoes its switch.
#   after_install   optional: after each committed transaction's cleanup.
#   maintenance     optional: after every install and update and in agent-guard
#                   update.
#   report          optional: lines after an install that migrated it.
#   uninstall       optional: U6; reply = what it could not remove. Fails, naming
#                   it, when what it must save could not be copied: the engine
#                   folder is then kept and uninstall exits 1.
#   save PARTIAL    optional: U7, when values were not restored, copies its
#                   records into ~/Agent Guard through PARTIAL; reply = lines to
#                   print.
# Its records in state/migration.json go through ag_mig_get and ag_mig_put. Its
# actions are rows with owner migrate:<name>. One transaction migrates one source;
# with several pending, ag_install_main runs one transaction per source in
# ag_migration_modules order.
# The modules, in order. ag_harness_modules: every harness this release installs.
# ag_migration_modules: every older install it migrates from, in migration order;
# OpenCode Guard is first.
ag_modules() {
  typeset -ga ag_harness_modules ag_migration_modules
  ag_harness_modules=(opencode pi)
  ag_migration_modules=(opencode-guard pi-sandbox-guard)
}
# The Pi files come first, in the order of design section 11 (The adoption, item
# 5), so the current step that adds bin/pi and bin/omp never links to a missing
# launcher.
ag_registry() {
  typeset -ga ag_actions
  ag_actions=(
    # phase  name             owner                     kinds    run                   back
    staged   import           migrate:opencode-guard    migrate  do_import             undo_import
    staged   psg-wrappers     migrate:pi-sandbox-guard  migrate  do_psg_wrappers       undo_psg_wrappers
    switch   pi-bindings      harness:pi                all      do_pi_bindings        undo_pi_bindings
    switch   pi-preamble      harness:pi                all      do_pi_preamble        undo_pi_preamble
    switch   pi-profile       harness:pi                all      do_pi_profile         undo_pi_profile
    switch   pi-launcher-pi   harness:pi                all      do_pi_launcher_pi     undo_pi_launcher_pi
    switch   pi-launcher-omp  harness:pi                all      do_pi_launcher_omp    undo_pi_launcher_omp
    switch   pi-extension     harness:pi                all      do_pi_extension       undo_pi_extension
    switch   rulebook         engine                    all      do_rulebook           undo_rulebook
    switch   rulejson         engine                    all      do_rulejson           undo_rulejson
    switch   app              engine                    plain    do_app                undo_app
    switch   current          engine                    all      do_current            undo_current
    switch   fwd-cli          migrate:opencode-guard    migrate  do_fwd_cli            undo_fwd_cli
    switch   fwd-gui          migrate:opencode-guard    migrate  do_fwd_gui            undo_fwd_gui
    switch   plugin-take      migrate:opencode-guard    migrate  do_ocg_plugin_take    undo_plugin_take
    switch   plugin-name      migrate:opencode-guard    migrate  do_ocg_plugin_name    undo_plugin_name
    switch   plugin           harness:opencode          all      do_plugin             undo_plugin
    switch   permissions      harness:opencode          plain    do_permissions        undo_permissions
    switch   rc               engine                    all      do_rc                 undo_rc
    switch   app              engine                    migrate  do_app                undo_app
    switch   app-old          migrate:opencode-guard    migrate  do_app_old            undo_app_old
    switch   switch-time      migrate:opencode-guard    migrate  do_switch_time        undo_switch_time
    switch   psg-switch-time  migrate:pi-sandbox-guard  migrate  do_psg_switch_time    undo_psg_switch_time
  )
}
# ag_actions_for PHASE: reply = the run and back handlers, in pairs and in registry
# order, of the PHASE actions this transaction selects: the engine's, those of the
# harnesses it installs (ag_harnesses) and of the source it migrates (ag_source),
# limited to its kind (ag_kind).
ag_actions_for() {
  local phase name owner kinds run back
  reply=()
  for phase name owner kinds run back in $ag_actions; do
    [[ $phase == "$1" ]] || continue
    case $owner in
      (engine) ;;
      (harness:*) (( ${ag_harnesses[(Ie)${owner#harness:}]} )) || continue ;;
      (migrate:*) [[ ${owner#migrate:} == "$ag_source" ]] || continue ;;
      (*) continue ;;
    esac
    case $kinds in
      (all) ;;
      (plain) [[ $ag_kind == (install|update) ]] || continue ;;
      (migrate) [[ $ag_kind == migrate ]] || continue ;;
      (*) continue ;;
    esac
    reply+=("$run" "$back")
  done
  return 0
}
# ag_action_names PHASE: reply = every registered name of PHASE, whatever its owner
# and kinds.
ag_action_names() {
  local phase name owner kinds run back
  reply=()
  for phase name owner kinds run back in $ag_actions; do
    [[ $phase == "$1" ]] && reply+=("$name")
  done
  reply=(${(u)reply})
}
# ag_do_actions PHASE: runs each selected action of PHASE in order and stops at
# the first that fails.
ag_do_actions() {
  local run back
  ag_actions_for $1
  for run back in $reply; do $run || return 1; done
  return 0
}
# ag_undo_actions PHASE: undoes each selected action of PHASE in reverse order,
# all of them even after a failure; fails when any failed.
ag_undo_actions() {
  local run back
  integer bad=0
  ag_actions_for $1
  for back run in ${(Oa)reply}; do $back || bad=1; done
  (( ! bad ))
}

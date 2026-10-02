# agent-guard bind (docs/DESIGN.md section 11, Commands). Sourced by agent-guard,
# which sets home and release.
#
# Runs pi-sandbox-guard's bind-executable.sh with HOME set to the account home and
# without its path variables, so it reads and writes the files the launcher reads:
# ~/.config/pi-sandbox-guard/executables.conf and, with --checker-node, the guard
# extension's .guard-node.
pi_bind() {
  exec /usr/bin/env -u PI_SANDBOX_CONFIG_DIR -u PI_SANDBOX_SHIM -u OMP_SANDBOX_SHIM "HOME=$home" \
    /bin/bash "$release/profiles/pi/scripts/bind-executable.sh" "$@"
}

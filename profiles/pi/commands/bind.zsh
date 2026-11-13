# agent-guard bind (docs/DESIGN.md section 11, Commands). Sourced by agent-guard,
# which sets home and release and loads the Pi harness.
#
# Runs pi-sandbox-guard's bind-executable.sh with HOME set to the account home and
# without its path variables (ag_pi_bind_env), so it reads and writes the files the
# launcher reads: ~/.config/pi-sandbox-guard/executables.conf. --checker-node is
# accepted and ignored.
pi_bind() {
  ag_pi_bind_env
  exec /usr/bin/env "${reply[@]}" /bin/bash "$release/profiles/pi/scripts/bind-executable.sh" "$@"
}

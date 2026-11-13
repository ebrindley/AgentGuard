#!/usr/bin/env bash
# lib-ops.sh — shared helpers for bind-executable.sh and installer/harness/pi.zsh.
# Sourced only (not executed). Bash 3.2 compatible. Space-safe quoting.
#
# Does not read auth/credentials. Does not mutate ~/.pi or ~/.local/bin by itself.

# shellcheck disable=SC2034
# Callers may use these after sourcing.

# Keep Homebrew's formula identity across version upgrades, but only if its
# stable opt link currently selects the exact executable already validated.
# Other installs retain their resolved pin. No runtime PATH lookup is added.
ops_stable_node_path() {
  node -e '
    const fs = require("fs");
    const resolved = fs.realpathSync(process.argv[1]);
    const match = resolved.match(/^(\/opt\/homebrew|\/usr\/local)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/);
    if (match) {
      const stable = `${match[1]}/opt/${match[2]}/bin/node`;
      try {
        if (fs.realpathSync(stable) === resolved) {
          process.stdout.write(stable);
          process.exit(0);
        }
      } catch {}
    }
    process.stdout.write(resolved);
  ' "$1"
}

# Fixed and host-derived roots that the Seatbelt profile can make writable.
# PROJECT is caller-supplied because it changes per launch; active Pi/OMP state
# roots are checked by the launcher after runtime state resolution.
ops_path_is_known_sandbox_write_root() {
  local path="$1" home="${2:-$HOME}" project="${3:-}"
  case "$path" in
    /private/tmp/*|/tmp/*|/var/tmp/*|/private/var/tmp/* \
    |/var/folders/*/T/*|/private/var/folders/*/T/* \
    |"$home"/.pi/*|"$home"/.omp/*|"$home"/.omp-*/*|"$home"/.omp.*/*|"$home"/.omp_*/* \
    |"$home"/.npm/*|"$home"/.cache/*|"$home"/Library/Caches/*)
      return 0
      ;;
  esac
  if [ -n "$project" ]; then
    case "$path" in
      "$project"|"$project"/*) return 0 ;;
    esac
  fi
  return 1
}

#!/bin/zsh
# Run only in a disposable GitHub-hosted macOS account.
emulate -L zsh
setopt err_exit no_unset pipe_fail
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_OS:-} == macOS ]] || exit 2
scenario=${1:?fresh or upgrade required}
[[ $scenario == (fresh|upgrade) ]] || exit 2
node -e 'if (process.versions.node.split(".")[0] !== "24") process.exit(1)'
engine="$HOME/Library/Application Support/AgentGuard"
[[ ! -e $engine ]] || { print -u2 'Disposable account already has Agent Guard'; exit 1; }
output="$RUNNER_TEMP/agentguard-acceptance"
mkdir -p "$output" "$HOME/Projects" "$HOME/.config/opencode"
[[ $(gh api repos/ebrindley/AgentGuard/releases/latest --jq .tag_name) == v2026.10.21 ]]
npm install --prefix "$RUNNER_TEMP/opencode-v2" @opencode/cli@2.1.1 > "$output/npm-v2.log" 2>&1
v2="$RUNNER_TEMP/opencode-v2/node_modules/.bin"
print -r -- '{"theme":"system","permission":{"bash":"ask","edit":"deny"}}' > "$HOME/.config/opencode/opencode.json"
cp "$HOME/.config/opencode/opencode.json" "$output/config-before.json"
print -r -- '{"theme":"system","permission":{"bash":"allow","external_directory":"allow","edit":"deny"}}' > "$output/config-expected.json"
if [[ $scenario == upgrade ]]; then
  node -e 'const fs=require("fs");for(const file of process.argv.slice(1)){const config=JSON.parse(fs.readFileSync(file));config.$schema="https://opencode.ai/config.json";fs.writeFileSync(file,JSON.stringify(config))}' "$HOME/.config/opencode/opencode.json" "$output/config-before.json" "$output/config-expected.json"
  npm install --prefix "$RUNNER_TEMP/opencode-v1" opencode-ai@1.18.33 > "$output/npm-v1.log" 2>&1
  path=("$RUNNER_TEMP/opencode-v1/node_modules/.bin" $path)
  /bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/download/v2026.10.20/install.sh)" install.sh --projects "$HOME/Projects" 2>&1 | tee "$output/old-install.log"
  [[ $(/usr/bin/jq -r .version "$engine/state/stamp.json") == 2026.10.20 ]]
  cp "$HOME/.config/opencode/opencode.json" "$output/config-after-old.json"
  node -e 'const fs=require("fs"),assert=require("assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1])),JSON.parse(fs.readFileSync(process.argv[2])))' "$output/config-expected.json" "$output/config-after-old.json"
  print -r -- '# acceptance settings marker' >> "$HOME/Agent Guard/Guard List.txt"
  cp "$HOME/Agent Guard/Guard List.txt" "$output/list-before.txt"
fi
path=("$v2" $path)
if [[ $scenario == fresh ]]; then
  /bin/zsh -c "$(/usr/bin/curl -fsSL https://github.com/ebrindley/AgentGuard/releases/latest/download/install.sh)" install.sh --projects "$HOME/Projects" 2>&1 | tee "$output/install.log"
  cp "$HOME/Agent Guard/Guard List.txt" "$output/list-before.txt"
else
  "$engine/bin/agent-guard" update 2>&1 | tee "$output/upgrade.log"
fi
/usr/bin/jq -e '.version == "2026.10.21" and .commit == "dcf0a5cd194e2ebbc05c88fa5d1d67693226c1c5"' "$engine/state/stamp.json"
"$engine/bin/agent-guard" version | tee "$output/version.txt"
"$engine/bin/opencode" --version | tee "$output/opencode-version.txt"
/usr/bin/grep -Fx 'opencode v2.1.1' "$output/opencode-version.txt"
node -e 'const fs=require("fs"),assert=require("assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1])),JSON.parse(fs.readFileSync(process.argv[2])))' "$output/config-expected.json" "$HOME/.config/opencode/opencode.json"
cmp "$output/list-before.txt" "$HOME/Agent Guard/Guard List.txt"
/usr/bin/jq '{version,tag,commit,release,installed_at,harnesses}' "$engine/state/stamp.json" > "$output/installed-before.json"
readlink "$engine/current" > "$output/current-before.txt"
"$engine/bin/agent-guard" update 2>&1 | tee "$output/current-update.log"
/usr/bin/grep -F 'Agent Guard 2026.10.21 is current; checking the installation.' "$output/current-update.log"
/usr/bin/jq '{version,tag,commit,release,installed_at,harnesses}' "$engine/state/stamp.json" > "$output/installed-after.json"
readlink "$engine/current" > "$output/current-after.txt"
cmp "$output/installed-before.json" "$output/installed-after.json"
cmp "$output/current-before.txt" "$output/current-after.txt"
cmp "$output/list-before.txt" "$HOME/Agent Guard/Guard List.txt"
node -e 'const fs=require("fs"),assert=require("assert/strict");assert.deepEqual(JSON.parse(fs.readFileSync(process.argv[1])),JSON.parse(fs.readFileSync(process.argv[2])))' "$output/config-expected.json" "$HOME/.config/opencode/opencode.json"
print -r -- "ok published 2026.10.21 $scenario and already-current update; settings preserved" | tee "$output/result.txt"

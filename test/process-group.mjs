import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"

export function groupMembers(pid) {
  const result = spawnSync("/bin/ps", ["-g", String(pid), "-o", "pid=,stat="], { encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status === 1 && !result.stdout.trim() && !result.stderr.trim()) return []
  assert.equal(result.status, 0, result.stderr || `cannot inspect process group ${pid}`)
  return result.stdout.trim().split("\n").filter(Boolean).map(line => {
    assert.match(line, /^\s*\d+\s+\S+\s*$/, `unexpected process group row: ${line}`)
    const [member, state] = line.trim().split(/\s+/)
    return { pid: Number(member), state }
  })
}

export const groupExists = pid => groupMembers(pid).length > 0

export function signalGroup(pid, signal) {
  try { process.kill(-pid, signal) } catch (error) {
    if (error.code === "ESRCH") return
    // Darwin can deny signals to an exited, unreaped group. It still exists;
    // the caller must wait for reaping and check that the group disappears.
    if (error.code === "EPERM" && groupMembers(pid).every(member => member.state.startsWith("Z"))) return
    throw error
  }
}

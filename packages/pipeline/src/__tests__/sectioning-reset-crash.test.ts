import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

it("RAC-7 RAC-15: reset rolls back on failure and recovers killed transactions without deleting ambiguous locks", () => {
  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), "sectioning-reset-crash-"))
  try {
    const result = spawnSync(process.execPath, ["scripts/probes/spec-0003-reset-recovery.mjs", evidence], {
      cwd: process.cwd(), encoding: "utf8", timeout: 45_000,
    })
    expect(result.error).toBeUndefined()
    expect(result.status, result.stdout + result.stderr).toBe(0)
    expect(result.stdout).toContain("Crash inside coordinated reset")
    expect(result.stdout).toContain("Crash after reset commit")
    expect(result.stdout).toContain("Unowned mutex remains fail-closed")
  } finally { fs.rmSync(evidence, { recursive: true, force: true }) }
}, 50_000)

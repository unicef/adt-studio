import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, expect, it } from "vitest"
import { BookBusyError, withBookWriter } from "../book-writer.js"

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-writer-recovery-")) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

// Adapted from SPEC-0010 / PR #886 at 876cc2ae: a reaper can die after
// removing the old owner but before establishing the next owner's lease.
it("keeps an orphan recovery reservation exclusive even without an owner file", () => {
  const marker = path.join(dir, ".book-writer.json.recovery")
  fs.writeFileSync(marker, "unfinished recovery evidence")
  const operation = () => { fs.writeFileSync(path.join(dir, "unsafe-write"), "must not run") }
  expect(() => withBookWriter(dir, operation)).toThrow(BookBusyError)
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { withBookWriter } from ${JSON.stringify(path.resolve("packages/storage/dist/book-writer.js"))};
    try { withBookWriter(${JSON.stringify(dir)}, () => process.exit(24)); }
    catch (error) { if (error.code !== 'BOOK_BUSY') throw error; }
  `], { encoding: "utf8", timeout: 5000 })
  expect(child.status, child.stderr).toBe(0)
  expect(fs.readFileSync(marker, "utf8")).toBe("unfinished recovery evidence")
  expect(fs.readdirSync(dir)).toEqual([".book-writer.json.recovery"])
})

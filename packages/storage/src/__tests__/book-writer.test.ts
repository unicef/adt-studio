import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { BookBusyError, ownsBookWriter, withBookWriter } from "../book-writer.js"

let dir: string
const lock = () => path.join(dir, ".book-writer.json")
const recovery = () => `${lock()}.recovery`
const childWriter = (operation = "console.log('admitted')") => spawnSync(process.execPath, [
  "--input-type=module", "-e",
  `import { withBookWriter } from ${JSON.stringify(path.resolve("packages/storage/dist/book-writer.js"))};
   try { withBookWriter(${JSON.stringify(dir)}, () => { ${operation} }) }
   catch (error) { console.log(error.code); process.exit(23) }`,
], { encoding: "utf8", timeout: 5000 })

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-writer-")) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe("book writer admission", () => {
  it("retains detached nested work after the submitting scope returns", async () => {
    let finish!: () => void
    let pending!: Promise<void>
    withBookWriter(dir, () => {
      pending = withBookWriter(dir, () => new Promise<void>((resolve) => { finish = resolve }))
    })
    try {
      expect(ownsBookWriter(dir)).toBe(false)
      expect(() => withBookWriter(dir, () => undefined)).toThrow(BookBusyError)
      const other = childWriter()
      expect(other.status, other.stderr).toBe(23)
      expect(other.stdout.trim()).toBe("BOOK_BUSY")
    } finally { finish(); await pending }
    expect(fs.existsSync(lock())).toBe(false)
    expect(childWriter().stdout.trim()).toBe("admitted")
  })

  it("releases failed operations while retaining the outer writer", async () => {
    await withBookWriter(dir, async () => {
      expect(() => withBookWriter(dir, () => { throw new Error("sync failure") })).toThrow("sync failure")
      await expect(withBookWriter(dir, async () => { throw new Error("async failure") })).rejects.toThrow("async failure")
      expect(ownsBookWriter(dir)).toBe(true)
      expect(childWriter().status).toBe(23)
    })
    expect(fs.existsSync(lock())).toBe(false)
    await expect(withBookWriter(dir, async () => { throw new Error("outer failure") })).rejects.toThrow("outer failure")
    expect(childWriter().status).toBe(0)
  })

  it("shares ownership through directory aliases but permits unrelated books", () => {
    const alias = path.join(dir, "alias")
    const otherBook = path.join(dir, "other")
    fs.symlinkSync(dir, alias, "junction")
    fs.mkdirSync(otherBook)
    withBookWriter(dir, () => {
      const original = fs.readFileSync(lock(), "utf8")
      withBookWriter(alias, () => {
        expect(ownsBookWriter(alias)).toBe(true)
        expect(fs.readFileSync(lock(), "utf8")).toBe(original)
      })
      withBookWriter(otherBook, () => expect(ownsBookWriter(otherBook)).toBe(true))
      expect(fs.readFileSync(lock(), "utf8")).toBe(original)
    })
    expect(fs.existsSync(lock())).toBe(false)
  })

  it("does not grant a completed lease to a later callback from its old async context", async () => {
    let resume!: () => void
    let late!: Promise<void>
    withBookWriter(dir, () => {
      late = new Promise<void>((resolve) => { resume = resolve }).then(() => {
        expect(ownsBookWriter(dir)).toBe(false)
        expect(() => withBookWriter(dir, () => undefined)).toThrow(BookBusyError)
      })
    })
    await withBookWriter(dir, async () => { resume(); await late })
    expect(fs.existsSync(lock())).toBe(false)
  })

  it("recovers a killed process without deleting unrelated SQLite recovery files", () => {
    const crashed = childWriter("process.kill(process.pid, 'SIGKILL')")
    expect(crashed.signal, crashed.stderr).toBe("SIGKILL")
    const journal = path.join(dir, `${path.basename(dir)}.db-journal`)
    fs.writeFileSync(journal, "retained SQLite recovery data")
    expect(fs.existsSync(lock())).toBe(true)
    withBookWriter(dir, () => expect(ownsBookWriter(dir)).toBe(true))
    expect(fs.readFileSync(journal, "utf8")).toBe("retained SQLite recovery data")
    expect(fs.existsSync(lock())).toBe(false)
    expect(fs.existsSync(recovery())).toBe(false)
  })

  it.each(["incomplete", "foreign", "reaper"])("fails closed for %s ownership without altering the owner", (kind) => {
    const text = kind === "incomplete" ? "{" : JSON.stringify({ token: "c130f9f9-cb76-4536-a058-e20422f1f327", pid: process.pid, host: `${os.hostname()}-other` })
    fs.writeFileSync(lock(), text)
    if (kind === "reaper") fs.writeFileSync(recovery(), "inspection required")
    expect(() => withBookWriter(dir, () => { throw new Error("must not execute") })).toThrow(BookBusyError)
    expect(fs.readFileSync(lock(), "utf8")).toBe(text)
    expect(fs.existsSync(recovery())).toBe(kind === "reaper")
  })
})

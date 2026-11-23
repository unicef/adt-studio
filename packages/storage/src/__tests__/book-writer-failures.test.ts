import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { retainBookDatabase, withBookWriter } from "../book-writer.js"

let dir: string
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "adt-admission-fault-")))
  fs.writeFileSync(path.join(dir, "book.db"), "preserved database")
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }) })

const boundaries = ["reservation", "owner", "retirement", "retired removal", "owner release"] as const
type Boundary = typeof boundaries[number]
function fault(boundary: Boundary, persistent = false, code = "EPERM") {
  let failures = 0, enabled = true
  const refused = () => {
    if (!enabled || (!persistent && failures)) return
    failures++
    throw Object.assign(new Error("injected sharing violation"), { code })
  }
  const lock = path.join(dir, ".book-writer.json"), recovery = lock + ".recovery"
  const rename = fs.renameSync, rm = fs.rmSync, unlink = fs.unlinkSync
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if ((boundary === "reservation" && String(to) === recovery) ||
        (boundary === "owner" && String(to) === lock) ||
        (boundary === "retirement" && String(from) === recovery)) refused()
    return rename(from, to)
  })
  vi.spyOn(fs, "rmSync").mockImplementation((file, options) => {
    if (boundary === "retired removal" && String(file).startsWith(recovery + ".completed-")) refused()
    return rm(file, options)
  })
  vi.spyOn(fs, "unlinkSync").mockImplementation(file => {
    if (boundary === "owner release" && String(file) === lock) refused()
    return unlink(file)
  })
  return { clear: () => { enabled = false }, failures: () => failures }
}

it.each(boundaries.flatMap(boundary => ["EPERM", "EBUSY", "EACCES"].map(code => ({ boundary, code }))))("retries one transient $code at $boundary without refusing the operation", ({ boundary, code }) => {
  const injected = fault(boundary, false, code)
  expect(withBookWriter(dir, () => "saved")).toBe("saved")
  expect(injected.failures()).toBe(1)
  expect(fs.readdirSync(dir)).toEqual(["book.db"])
  expect(fs.readFileSync(path.join(dir, "book.db"), "utf8")).toBe("preserved database")
})

it.each(boundaries)("bounds a persistent failure at %s and recovers in the same process once it clears", boundary => {
  const injected = fault(boundary, true)
  expect(() => withBookWriter(dir, () => "saved")).toThrow("BOOK_BUSY")
  // Bound the attempted syscalls, not wall time on a loaded CI worker.
  expect(injected.failures()).toBe(5)
  injected.clear()
  expect(withBookWriter(dir, () => "reopened")).toBe("reopened")
  expect(fs.readdirSync(dir)).toEqual(["book.db"])
  expect(fs.readFileSync(path.join(dir, "book.db"), "utf8")).toBe("preserved database")
})

it("never treats another book's abandoned token as this book's recovery authority", () => {
  const injected = fault("owner", true)
  expect(() => withBookWriter(dir, () => "unsafe")).toThrow("BOOK_BUSY")
  injected.clear()
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "adt-other-admission-"))
  try {
    fs.cpSync(path.join(dir, ".book-writer.json.recovery"), path.join(other, ".book-writer.json.recovery"), { recursive: true })
    const evidence = fs.readFileSync(path.join(other, ".book-writer.json.recovery/owner.json"))
    expect(() => withBookWriter(other, () => "unsafe")).toThrow("BOOK_BUSY")
    expect(fs.readFileSync(path.join(other, ".book-writer.json.recovery/owner.json"))).toEqual(evidence)
    expect(withBookWriter(dir, () => "reopened")).toBe("reopened")
  } finally { fs.rmSync(other, { recursive: true, force: true }) }
})

it("does not turn a failed capability update into authority to replace an active lease", () => {
  const release = retainBookDatabase(path.join(dir, "book.db"))
  const ownerBefore = fs.readFileSync(path.join(dir, ".book-writer.json"))
  const injected = fault("owner", true)
  try {
    expect(() => retainBookDatabase(path.join(dir, "other.db"))).toThrow("BOOK_BUSY")
    expect(fs.readFileSync(path.join(dir, ".book-writer.json"))).toEqual(ownerBefore)
    injected.clear()
    const borrowed = retainBookDatabase(path.join(dir, "book.db"))
    borrowed()
    expect(fs.readFileSync(path.join(dir, ".book-writer.json"))).toEqual(ownerBefore)
  } finally { injected.clear(); release() }
})

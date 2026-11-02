import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { openBookDb, cleanupInterruptedSteps, readBookSchemaVersion } from "../db.js"
import { ownsBookWriter, withBookWriter } from "../book-writer.js"

let root: string, dir: string, file: string
const children: ChildProcess[] = []
const dist = path.resolve(import.meta.dirname, "../../dist")
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-reader-admission-"))
  dir = path.join(root, "book"); fs.mkdirSync(dir); file = path.join(dir, "book.db")
  const db = openBookDb(file)
  db.run("INSERT INTO step_runs(step, status) VALUES('extract', 'running')")
  db.close()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const child of children.splice(0)) if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit"); child.kill("SIGKILL"); await exited
  }
  fs.rmSync(root, { recursive: true, force: true })
})
async function heldReader(sql = "SELECT * FROM step_runs") {
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import {openBookDb} from ${JSON.stringify(path.join(dist, "db.js"))};
    const db = openBookDb(${JSON.stringify(file)});
    db.exec('BEGIN'); db.all(${JSON.stringify(sql)});
    process.send('reading');
    await new Promise(resolve => process.once('message', resolve));
    db.exec('ROLLBACK'); db.close(); process.disconnect();
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
  children.push(child)
  let stderr = ""; child.stderr!.on("data", data => { stderr += data })
  await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw new Error(`Reader exited: ${stderr}`) })])
  return child
}
const competingWriter = () => spawnSync(process.execPath, ["--input-type=module", "-e", `
  import {withBookWriter} from ${JSON.stringify(path.join(dist, "book-writer.js"))};
  try { withBookWriter(${JSON.stringify(dir)}, () => process.stdout.write('admitted')); }
  catch (error) { process.stdout.write(error.code); process.exitCode=23; }
`], { encoding: "utf8", timeout: 5000 })

it("retains a real independent reader's mutex and running rows during startup cleanup", async () => {
  const child = await heldReader()
  expect(fs.existsSync(`${file}.lock`)).toBe(true)
  const lease = fs.readFileSync(path.join(dir, ".book-writer.json"), "utf8")
  expect(JSON.parse(lease)).toMatchObject({ pid: child.pid, coordinatedDatabases: ["book.db"] })
  const bytes = fs.readFileSync(file)
  cleanupInterruptedSteps(root)
  expect(fs.readFileSync(file)).toEqual(bytes)
  expect(fs.readFileSync(path.join(dir, ".book-writer.json"), "utf8")).toBe(lease)
  expect(fs.existsSync(`${file}.lock`)).toBe(true)
  expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
  const exited = once(child, "exit"); child.send("finish"); await exited
  cleanupInterruptedSteps(root)
  const db = openBookDb(file)
  try { expect(db.get("SELECT status, error FROM step_runs")).toEqual({ status: "error", error: "Interrupted" }) }
  finally { db.close() }
})

it("recovers a killed coordinated reader and lets SQLite roll back its transaction", async () => {
  const child = await heldReader("UPDATE step_runs SET error='uncommitted'")
  const exited = once(child, "exit"); child.kill("SIGKILL"); await exited
  expect(fs.existsSync(`${file}.lock`)).toBe(true)
  cleanupInterruptedSteps(root)
  const db = openBookDb(file)
  try { expect(db.get("SELECT status, error FROM step_runs")).toEqual({ status: "error", error: "Interrupted" }) }
  finally { db.close() }
  expect(competingWriter().stdout).toBe("admitted")
})

it("allows local reads during an awaited writer without granting unrelated writer authority", async () => {
  let finish!: () => void
  const writing = withBookWriter(dir, () => new Promise<void>(resolve => { finish = resolve }))
  const reader = openBookDb(file)
  expect(ownsBookWriter(dir)).toBe(false)
  expect(reader.get("SELECT status FROM step_runs")).toEqual({ status: "running" })
  expect(() => withBookWriter(dir, () => "unrelated writer")).toThrow("BOOK_BUSY")
  expect(competingWriter().stdout).toBe("BOOK_BUSY")
  finish(); await writing
  // The connection pins the process lease after the writer operation settles.
  expect(fs.existsSync(path.join(dir, ".book-writer.json"))).toBe(true)
  expect(withBookWriter(dir, () => "next operation")).toBe("next operation")
  reader.close()
  expect(competingWriter().stdout).toBe("admitted")
})

it("does not revive an old async writer context through a surviving reader pin", async () => {
  let resume!: () => void, callback!: Promise<void>
  const reader = openBookDb(file)
  withBookWriter(dir, () => {
    callback = new Promise<void>(resolve => { resume = resolve }).then(() => {
      expect(ownsBookWriter(dir)).toBe(false)
      expect(() => withBookWriter(dir, () => "stale authority")).toThrow("BOOK_BUSY")
    })
  })
  await withBookWriter(dir, async () => { resume(); await callback })
  reader.close()
})

it("finalizes open statements before releasing close_v2 admission and rejects resumed iterators", () => {
  const db = openBookDb(file)
  const statement = db.prepare("SELECT * FROM step_runs")
  const rows = statement.iterate()
  expect(rows.next().done).toBe(false)
  expect(competingWriter().stdout).toBe("BOOK_BUSY")
  db.close()
  expect(statement.isFinalized).toBe(true)
  expect(() => rows.next()).toThrow("Database statement is closed")
  expect(competingWriter().stdout).toBe("admitted")
})

it.each(["dangling database", "hardlinked database", "dangling mutex", "anonymous mutex"])("preserves unprovable %s evidence", kind => {
  const outside = path.join(root, "outside.db")
  if (kind === "dangling database") { fs.unlinkSync(file); fs.symlinkSync(outside, file) }
  if (kind === "hardlinked database") fs.linkSync(file, outside)
  if (kind === "dangling mutex") fs.symlinkSync(path.join(root, "missing-mutex"), `${file}.lock`)
  if (kind === "anonymous mutex") fs.mkdirSync(`${file}.lock`)
  expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
  if (kind === "dangling database") expect(fs.existsSync(outside)).toBe(false)
  if (kind.endsWith("mutex")) expect(fs.lstatSync(`${file}.lock`)).toBeTruthy()
})

it("registers nonstandard schema-read filenames without migrating the copied database", () => {
  const renamed = path.join(dir, "preview.sqlite")
  fs.renameSync(file, renamed)
  const bytes = fs.readFileSync(renamed)
  expect(readBookSchemaVersion(renamed)).toBe(14)
  expect(fs.readFileSync(renamed)).toEqual(bytes)
  expect(fs.existsSync(path.join(dir, ".book-writer.json"))).toBe(false)
})


it.each(["token", "capability"])("refuses a locally borrowed database after its %s evidence changes", kind => {
  const db = openBookDb(file)
  const ownerFile = path.join(dir, ".book-writer.json")
  const saved = fs.readFileSync(ownerFile, "utf8")
  const changed = JSON.parse(saved)
  if (kind === "token") changed.token = "d8daf033-8bcc-4cce-99cb-a165d12ccbb4"
  else changed.coordinatedDatabases = []
  fs.writeFileSync(ownerFile, JSON.stringify(changed))
  try {
    expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
    expect(() => withBookWriter(dir, () => "unverified operation")).toThrow("BOOK_BUSY")
    expect(fs.readFileSync(ownerFile, "utf8")).toBe(JSON.stringify(changed))
  } finally { fs.writeFileSync(ownerFile, saved); db.close() }
})

it("preserves a dangling recovery reservation", () => {
  const reservation = path.join(dir, ".book-writer.json.recovery")
  fs.symlinkSync(path.join(root, "missing-reservation"), reservation)
  expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
  expect(() => withBookWriter(dir, () => "unsafe")).toThrow("BOOK_BUSY")
  expect(fs.lstatSync(reservation).isSymbolicLink()).toBe(true)
})

it("checks every mutex before deleting any registered recovery evidence", async () => {
  const child = await heldReader()
  const died = once(child, "exit"); child.kill("SIGKILL"); await died
  const original = fs.readFileSync(path.join(dir, ".book-writer.json"), "utf8")
  const extra = path.join(dir, "unregistered.db.lock")
  fs.mkdirSync(extra)
  expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
  expect(fs.existsSync(`${file}.lock`)).toBe(true)
  expect(fs.existsSync(extra)).toBe(true)
  expect(fs.readFileSync(path.join(dir, ".book-writer.json"), "utf8")).toBe(original)
})

it("does not accept aliased owner evidence for recovery", async () => {
  const child = await heldReader()
  const died = once(child, "exit"); child.kill("SIGKILL"); await died
  const ownerFile = path.join(dir, ".book-writer.json"), elsewhere = path.join(root, "owner.json")
  fs.renameSync(ownerFile, elsewhere); fs.symlinkSync(elsewhere, ownerFile)
  const evidence = fs.readFileSync(elsewhere, "utf8")
  expect(() => openBookDb(file)).toThrow("BOOK_BUSY")
  expect(fs.readFileSync(elsewhere, "utf8")).toBe(evidence)
  expect(fs.existsSync(`${file}.lock`)).toBe(true)
})

it("retains admission when a statement cannot be finalized on close", () => {
  const db = openBookDb(file)
  const statement = db.prepare("SELECT * FROM step_runs")
  const finalize = vi.spyOn(statement, "finalize").mockImplementation(() => { throw new Error("fixture finalization failure") })
  expect(() => db.close()).toThrow("fixture finalization failure")
  expect(db.isOpen).toBe(true)
  expect(competingWriter().stdout).toBe("BOOK_BUSY")
  finalize.mockRestore(); db.close()
  expect(competingWriter().stdout).toBe("admitted")
})

it("writes a complete filename capability even when the filesystem accepts short writes", () => {
  withBookWriter(dir, () => {
    const ownerFile = path.join(dir, ".book-writer.json")
    const inode = fs.statSync(ownerFile).ino
    const write = fs.writeSync.bind(fs)
    let partialCalls = 0
    const spy = vi.spyOn(fs, "writeSync").mockImplementation(((fd: number, buffer: Buffer, offset: number, length: number, position: number) => {
      if (fs.fstatSync(fd).ino === inode && Buffer.isBuffer(buffer)) { partialCalls++; return write(fd, buffer, offset, Math.min(length, 7), position) }
      return write(fd, buffer, offset, length, position)
    }) as typeof fs.writeSync)
    let db: ReturnType<typeof openBookDb> | undefined
    try {
      db = openBookDb(file)
      expect(partialCalls).toBeGreaterThan(1)
      expect(JSON.parse(fs.readFileSync(ownerFile, "utf8")).coordinatedDatabases).toEqual(["book.db"])
    } finally { spy.mockRestore(); db?.close() }
  })
})

import { afterEach, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
import { ownsBookWriter, withBookWriter, withNewBookWriter } from "../book-writer.js"
import { cleanupInterruptedSteps, openBookDb } from "../db.js"

const dirs: string[] = []
const children: ChildProcess[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await once(child, "exit") }
  }
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-writer-"))
  dirs.push(root)
  const bookDir = path.join(root, "book")
  fs.mkdirSync(bookDir)
  return { root, bookDir }
}

async function owner(bookDir: string) {
  const moduleUrl = pathToFileURL(path.resolve(import.meta.dirname, "../../dist/book-writer.js")).href
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import {withBookWriter} from ${JSON.stringify(moduleUrl)};
    await withBookWriter(${JSON.stringify(bookDir)}, async () => {
      process.send('acquired');
      await new Promise(resolve => process.once('message', resolve));
    });
    process.disconnect();
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
  children.push(child)
  await once(child, "message")
  return child
}

it("excludes an independent process and never evicts a live writer even with an ancient record", async () => {
  const f = fixture()
  const child = await owner(f.bookDir)
  const file = path.join(f.bookDir, ".book-writer.json")
  fs.utimesSync(file, 0, 0)
  expect(() => withBookWriter(f.bookDir, () => "must not run")).toThrow("BOOK_BUSY")
  expect(JSON.parse(fs.readFileSync(file, "utf8")).pid).toBe(child.pid)
  child.send("release")
  await once(child, "exit")
  expect(withBookWriter(f.bookDir, () => "next writer")).toBe("next writer")
})

it("recovers only a proven dead local process and preserves ambiguous control recovery", async () => {
  const f = fixture()
  const child = await owner(f.bookDir)
  child.kill("SIGKILL")
  await once(child, "exit")
  expect(withBookWriter(f.bookDir, () => "recovered")).toBe("recovered")
  fs.writeFileSync(path.join(f.bookDir, ".book-writer.json.recovery"), "")
  expect(() => withBookWriter(f.bookDir, () => "unsafe")).toThrow("BOOK_BUSY")
  expect(fs.existsSync(path.join(f.bookDir, ".book-writer.json.recovery"))).toBe(true)
})

it("counts nested background leases until all work settles and rejects unrelated callers", async () => {
  const f = fixture()
  let finish!: () => void
  let pending!: Promise<void>
  withBookWriter(f.bookDir, () => {
    pending = withBookWriter(f.bookDir, () => new Promise<void>((resolve) => { finish = resolve }))
  })
  expect(() => withBookWriter(f.bookDir, () => "racing")).toThrow("BOOK_BUSY")
  finish()
  await pending
  expect(withBookWriter(f.bookDir, () => "released")).toBe("released")
})

it("startup recovery leaves a live process's database, journal and running rows untouched", async () => {
  const f = fixture()
  const dbFile = path.join(f.bookDir, "book.db")
  const db = openBookDb(dbFile)
  db.run("INSERT INTO step_runs(step, status) VALUES('extract', 'running')")
  db.close()
  const child = await owner(f.bookDir)
  const before = fs.readFileSync(dbFile)
  fs.writeFileSync(dbFile + "-journal", "live-journal")
  cleanupInterruptedSteps(f.root)
  expect(fs.readFileSync(dbFile)).toEqual(before)
  expect(fs.readFileSync(dbFile + "-journal", "utf8")).toBe("live-journal")
  child.send("release")
  await once(child, "exit")
})


it("reserves new imports atomically and retains the shared writer until background work settles", async () => {
  const f = fixture()
  const fresh = path.join(f.root, "fresh")
  let finish!: () => void
  const pending = withNewBookWriter(fresh, () => new Promise<void>((resolve) => { finish = resolve }))
  expect(() => withBookWriter(fresh, () => fs.writeFileSync(path.join(fresh, "fresh.pdf"), "racing"))).toThrow("BOOK_BUSY")
  expect(() => withNewBookWriter(fresh, () => "overwrite")).toThrow()
  finish()
  await pending
  expect(fs.readdirSync(fresh)).toEqual([])
})


it.each(["fresh", "dead", ...(process.platform === "linux" ? ["recycled"] : [])])("admits exactly one of six independent contenders (%s owner)", async (mode) => {
  const f = fixture()
  if (mode !== "fresh") {
    const previous = await owner(f.bookDir)
    const file = path.join(f.bookDir, ".book-writer.json")
    const record = JSON.parse(fs.readFileSync(file, "utf8"))
    previous.kill("SIGKILL")
    await once(previous, "exit")
    if (mode === "recycled") {
      record.pid = process.pid // This PID is live, but its kernel starttime differs.
      fs.writeFileSync(file, JSON.stringify(record))
    }
  }
  const moduleUrl = pathToFileURL(path.resolve(import.meta.dirname, "../../dist/book-writer.js")).href
  const contenders = await Promise.all(Array.from({ length: 6 }, async () => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", `
      import {withBookWriter} from ${JSON.stringify(moduleUrl)};
      import {once} from 'node:events';
      const start = once(process, 'message');
      process.send('ready');
      await start;
      try {
        await withBookWriter(${JSON.stringify(f.bookDir)}, async () => {
          const release = once(process, 'message');
          process.send('acquired');
          await release;
        });
      } catch (error) { process.send(error.code ?? error.message); }
      process.disconnect();
    `], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
    children.push(child)
    await once(child, "message")
    return child
  }))
  // All processes are ready before any attempts the exclusive reservation.
  const results = contenders.map((child) => once(child, "message"))
  for (const child of contenders) child.send("start")
  const outcomes = (await Promise.all(results)).map(([message]) => message)
  expect(outcomes.filter((value) => value === "acquired")).toHaveLength(1)
  expect(outcomes.filter((value) => value === "BOOK_BUSY")).toHaveLength(5)
  const winner = contenders[outcomes.indexOf("acquired")]
  expect(JSON.parse(fs.readFileSync(path.join(f.bookDir, ".book-writer.json"), "utf8")).pid).toBe(winner.pid)
  const finished = once(winner, "exit")
  winner.send("release")
  await finished
  expect(withBookWriter(f.bookDir, () => "next")).toBe("next")
})

it("removes the WASM lock directory together with a proven dead local owner's lease", async () => {
  const f = fixture()
  const child = await owner(f.bookDir)
  // A force-quit mid-statement leaves node-sqlite3-wasm's mkdir mutex behind.
  const databaseLock = path.join(f.bookDir, "book.db.lock")
  fs.mkdirSync(databaseLock)
  child.kill("SIGKILL")
  await once(child, "exit")
  expect(withBookWriter(f.bookDir, () => "recovered")).toBe("recovered")
  expect(fs.existsSync(databaseLock)).toBe(false)
  expect(fs.existsSync(path.join(f.bookDir, ".book-writer.json"))).toBe(false)
})

it("never creates a book directory just to check or take ownership", () => {
  const f = fixture()
  const missing = path.join(f.root, "missing")
  expect(ownsBookWriter(missing)).toBe(false)
  expect(() => withBookWriter(missing, () => "must not run")).toThrow()
  expect(fs.existsSync(missing)).toBe(false)
})

// Model a recycled PID using a real kernel-stamped lease. Actual namespace/PID
// reuse is additionally exercised by the combined Docker SIGKILL/restart probe.
function localLease(bookDir: string) {
  let record!: import("@adt/types").BookWriterOwner
  withBookWriter(bookDir, () => {
    record = JSON.parse(fs.readFileSync(path.join(bookDir, ".book-writer.json"), "utf8"))
  })
  return record
}

it.skipIf(process.platform !== "linux")("stamps the kernel incarnation and recovers a recycled live PID without discarding SQLite recovery data", () => {
  const f = fixture()
  const record = localLease(f.bookDir)
  expect(record.linuxProcess).toBeDefined()
  expect(record.linuxProcess!.pidNamespace).toBe(fs.readlinkSync("/proc/self/ns/pid"))
  expect(record.linuxProcess!.bootId).toBe(fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim())
  record.linuxProcess!.startTicks = (BigInt(record.linuxProcess!.startTicks) + 1n).toString()
  const lock = path.join(f.bookDir, ".book-writer.json")
  fs.writeFileSync(lock, JSON.stringify(record))
  fs.mkdirSync(path.join(f.bookDir, "book.db.lock"))
  const retained = ["book.db", "book.db-journal", "book.db-wal", "manual.mp3"]
  for (const name of retained) fs.writeFileSync(path.join(f.bookDir, name), `retained:${name}`)
  expect(withBookWriter(f.bookDir, () => "recovered")).toBe("recovered")
  expect(fs.existsSync(lock)).toBe(false)
  expect(fs.existsSync(path.join(f.bookDir, "book.db.lock"))).toBe(false)
  for (const name of retained) expect(fs.readFileSync(path.join(f.bookDir, name), "utf8")).toBe(`retained:${name}`)
})

it.each(["legacy", "remote", "malformed"])("retains a %s lease and its SQLite mutex without guessing ownership", (kind) => {
  const f = fixture()
  const record = localLease(f.bookDir)
  if (kind === "legacy") delete record.linuxProcess
  if (kind === "remote") record.host = "another-host"
  if (kind === "malformed") Object.assign(record, { linuxProcess: { startTicks: "1" } })
  const lock = path.join(f.bookDir, ".book-writer.json")
  const bytes = JSON.stringify(record)
  fs.writeFileSync(lock, bytes)
  fs.mkdirSync(path.join(f.bookDir, "book.db.lock"))
  expect(() => withBookWriter(f.bookDir, () => "unsafe")).toThrow("BOOK_BUSY")
  expect(fs.readFileSync(lock, "utf8")).toBe(bytes)
  expect(fs.existsSync(path.join(f.bookDir, "book.db.lock"))).toBe(true)
})

it.skipIf(process.platform !== "linux").each(["namespace", "boot", "container", "unreadable", "proc-mismatch", "permission"])("retains ambiguous %s ownership even when a PID appears recycled", (kind) => {
  const f = fixture()
  const record = localLease(f.bookDir)
  const identity = record.linuxProcess!
  identity.startTicks = (BigInt(identity.startTicks) + 1n).toString()
  if (kind === "namespace") { identity.pidNamespace = "pid:[1]"; delete identity.dockerContainerId }
  if (kind === "boot") { identity.bootId = "00000000-0000-4000-8000-000000000000"; delete identity.dockerContainerId }
  if (kind === "container") identity.dockerContainerId = "a".repeat(64)
  const lock = path.join(f.bookDir, ".book-writer.json")
  const bytes = JSON.stringify(record)
  fs.writeFileSync(lock, bytes)
  fs.mkdirSync(path.join(f.bookDir, "book.db.lock"))
  if (kind === "unreadable") {
    const original = fs.readFileSync
    vi.spyOn(fs, "readFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(file).startsWith("/proc/")) throw Object.assign(new Error("denied"), { code: "EACCES" })
      return Reflect.apply(original, fs, [file, ...args])
    }) as typeof fs.readFileSync)
  }
  if (kind === "proc-mismatch") {
    const original = fs.readlinkSync
    vi.spyOn(fs, "readlinkSync").mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
      if (file === "/proc/self") return "999999"
      return Reflect.apply(original, fs, [file, ...args])
    }) as typeof fs.readlinkSync)
  }
  if (kind === "permission") vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EPERM" }) })
  expect(() => withBookWriter(f.bookDir, () => "unsafe")).toThrow("BOOK_BUSY")
  expect(fs.readFileSync(lock, "utf8")).toBe(bytes)
  expect(fs.existsSync(path.join(f.bookDir, "book.db.lock"))).toBe(true)
})


it.skipIf(process.platform !== "linux").each(["CapBnd", "CapPrm", "CapEff", "Seccomp", "uid_map", "mountinfo", "stat"])("refuses cross-namespace recovery with uncertain Docker evidence (%s)", (field) => {
  const f = fixture()
  const record = localLease(f.bookDir)
  record.linuxProcess!.pidNamespace = "pid:[1]"
  // On Linux hosts without Docker, this is deliberately unprovable as well.
  record.linuxProcess!.dockerContainerId ??= "b".repeat(64)
  const lock = path.join(f.bookDir, ".book-writer.json")
  const bytes = JSON.stringify(record)
  fs.writeFileSync(lock, bytes)
  fs.mkdirSync(path.join(f.bookDir, "book.db.lock"))
  const original = fs.readFileSync
  vi.spyOn(fs, "readFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
    const value = Reflect.apply(original, fs, [file, ...args])
    if (!String(file).startsWith("/proc/")) return value
    if (String(file).endsWith("/status") && field.startsWith("Cap")) return String(value).replace(new RegExp(`^${field}:.*$`, "m"), `${field}:\t00200000`)
    if (String(file).endsWith("/status") && field === "Seccomp") return String(value).replace(/^Seccomp:.*$/m, "Seccomp:\t0")
    if (String(file).endsWith("/uid_map") && field === "uid_map") return "0 1000 1"
    if (String(file).endsWith("/mountinfo") && field === "mountinfo") return String(value).split("\n").filter((line) => !line.includes("/etc/hosts ")).join("\n")
    if (String(file).endsWith("/stat") && field === "stat") return "malformed kernel record"
    return value
  }) as typeof fs.readFileSync)
  expect(() => withBookWriter(f.bookDir, () => "unsafe")).toThrow("BOOK_BUSY")
  expect(fs.readFileSync(lock, "utf8")).toBe(bytes)
  expect(fs.existsSync(path.join(f.bookDir, "book.db.lock"))).toBe(true)
})


it("recovers a legacy lease only after its real owner exits", async () => {
  const f = fixture()
  const child = await owner(f.bookDir)
  const file = path.join(f.bookDir, ".book-writer.json")
  const record = JSON.parse(fs.readFileSync(file, "utf8"))
  delete record.linuxProcess
  fs.writeFileSync(file, JSON.stringify(record))
  expect(() => withBookWriter(f.bookDir, () => "unsafe")).toThrow("BOOK_BUSY")
  child.kill("SIGKILL")
  await once(child, "exit")
  expect(withBookWriter(f.bookDir, () => "legacy recovered")).toBe("legacy recovered")
})

import { afterEach, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { pathToFileURL } from "node:url"
import { withBookWriter, withNewBookWriter } from "../book-writer.js"
import { cleanupInterruptedSteps, openBookDb } from "../db.js"

const dirs: string[] = []
const children: ChildProcess[] = []
afterEach(async () => {
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

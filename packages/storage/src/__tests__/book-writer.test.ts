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


it.each([false, true])("admits exactly one of six independent contenders (dead owner=%s)", async (recover) => {
  const f = fixture()
  if (recover) {
    const previous = await owner(f.bookDir)
    previous.kill("SIGKILL")
    await once(previous, "exit")
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

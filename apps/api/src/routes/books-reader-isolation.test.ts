// Adapted from the independent reviewer’s reproduction design:
// apps/api/src/routes/books-reader-isolation.test.ts
// Run only after pnpm build: child processes load actual compiled @adt/storage.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { spawn, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { Hono } from "hono"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createBookStorage, publishSectioningTransition, SECTIONING_JOURNAL, SECTIONING_LIFECYCLE } from "@adt/storage"
import { createBookRoutes } from "./books.js"
import { errorHandler } from "../middleware/error-handler.js"

const repository = path.resolve(import.meta.dirname, "../../../..")
const storageModule = pathToFileURL(path.join(repository, "packages/storage/dist/index.js")).href
let root: string, configPath: string, app: Hono
const children: ChildProcess[] = []
const affected = "a-admitted-book", unaffected = "b-unaffected-book"
const bookDir = (label: string) => path.join(root, label)
const dbPath = (label: string) => path.join(bookDir(label), `${label}.db`)
function seed(label: string) {
  const storage = createBookStorage(label, root)
  try {
    storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: `Source for ${label}`, images: [],
      pageImage: { imageId: "pg001_page", buffer: Buffer.from(`pixels ${label}`), format: "png", hash: `hash-${label}`, width: 4, height: 6 } })
    storage.putNodeData("metadata", "book", { title: label, authors: [], publisher: null, language_code: "en", cover_page_number: 1, reasoning: "fixture" })
    storage.markStepCompleted("web-rendering")
  } finally { storage.close() }
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "library-reader-isolation-"))
  configPath = path.join(root, "global.yaml")
  fs.writeFileSync(configPath, "structure_types: {}\nrole_types: {}\n")
  seed(affected); seed(unaffected)
  app = new Hono().onError(errorHandler).route("/", createBookRoutes(root, undefined, configPath))
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, "exit")
      child.kill("SIGKILL")
      await stopped
    }
  }
  fs.rmSync(root, { recursive: true, force: true })
})
async function holdReader() {
  const child = spawn(process.execPath, ["--input-type=module", "--eval", `
    import { openBookDb } from ${JSON.stringify(storageModule)};
    const db = openBookDb(${JSON.stringify(dbPath(affected))});
    db.exec('BEGIN');
    const count = db.get('SELECT COUNT(*) AS count FROM pages');
    process.send({ ready: true, count: count.count });
    await new Promise(resolve => process.once('message', resolve));
    db.exec('ROLLBACK'); db.close(); process.disconnect();
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] })
  children.push(child)
  let stderr = "", ready: unknown
  child.stderr!.on("data", (bytes) => { stderr += bytes.toString() })
  child.on("message", (message) => { ready = message })
  await vi.waitFor(() => {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Reader exited before handshake: ${stderr}`)
    expect(ready).toEqual({ ready: true, count: 1 })
  }, { timeout: 5000 })
  return child
}
async function releaseReader(child: ChildProcess) {
  const stopped = once(child, "exit")
  child.send("release")
  const [code, signal] = await stopped
  expect(code).toBe(0); expect(signal).toBeNull()
}
async function assertUnrelatedBookVisible() {
  const response = await app.request("/books")
  expect(response.status, await response.clone().text()).toBe(200)
  const cards = await response.json() as Array<{ label: string; title: string | null; needsRebuild: boolean }>
  expect(cards.find(book => book.label === unaffected)).toMatchObject({ title: unaffected, needsRebuild: false })
  // The writer may add a temporary-unavailable card field. Do not prescribe
  // that schema here, but never suggest destructive rebuild for mere admission.
  const affectedCard = cards.find(book => book.label === affected)
  if (affectedCard) expect(affectedCard.needsRebuild).toBe(false)
  return cards
}
it("a real independently held reader refuses its own book without hiding another Library book", async () => {
  const child = await holdReader()
  const leaseFile = path.join(bookDir(affected), ".book-writer.json")
  const lease = fs.readFileSync(leaseFile)
  expect(JSON.parse(lease.toString())).toMatchObject({ pid: child.pid, coordinatedDatabases: [`${affected}.db`] })
  expect(fs.existsSync(`${dbPath(affected)}.lock`)).toBe(true)
  const affectedBytes = fs.readFileSync(dbPath(affected))
  const unaffectedBytes = fs.readFileSync(dbPath(unaffected))
  try {
    // The shared protocol still excludes a foreign reader. Library isolation
    // must not turn into permission to bypass that book's admission.
    const refused = await app.request(`/books/${affected}`)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: "BOOK_BUSY" })
    await assertUnrelatedBookVisible()
    expect(fs.readFileSync(dbPath(affected)).equals(affectedBytes)).toBe(true)
    expect(fs.readFileSync(dbPath(unaffected)).equals(unaffectedBytes)).toBe(true)
    expect(fs.readFileSync(leaseFile).equals(lease)).toBe(true)
    expect(fs.existsSync(`${dbPath(affected)}.lock`)).toBe(true)
  } finally { await releaseReader(child) }
  const cards = await assertUnrelatedBookVisible()
  expect(cards.map(book => book.label).sort()).toEqual([affected, unaffected])
  expect((await app.request(`/books/${affected}`)).status).toBe(200)
})

// Use a real production transition, faulting only the final atomic lifecycle
// rename. This leaves a valid old-format config journal, not a fabricated owner.
function leavePendingTransition() {
  const proposed = "page_sectioning:\n  mode: page\n"
  const rename = fs.renameSync
  const fault = vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to) === path.join(bookDir(affected), SECTIONING_LIFECYCLE)) throw new Error("injected final lifecycle publication fault")
    return rename(from, to)
  })
  try {
    expect(() => publishSectioningTransition(bookDir(affected), proposed, "page", ["web-rendering"]))
      .toThrow("injected final lifecycle publication fault")
  } finally { fault.mockRestore() }
  expect(fs.existsSync(path.join(bookDir(affected), SECTIONING_JOURNAL))).toBe(true)
  expect(fs.readFileSync(path.join(bookDir(affected), "config.yaml"), "utf8")).toBe(proposed)
  return proposed
}
it.each([false, true])("a pending config journal does not hide another Library book (conflicting: %s)", async (conflicting) => {
  const proposed = leavePendingTransition()
  if (conflicting) fs.writeFileSync(path.join(bookDir(affected), "config.yaml"), "page_sectioning:\n  mode: dynamic\n# external conflicting edit\n")
  const journalFile = path.join(bookDir(affected), SECTIONING_JOURNAL)
  const journal = fs.readFileSync(journalFile)
  const affectedBytes = fs.readFileSync(dbPath(affected))
  const unaffectedBytes = fs.readFileSync(dbPath(unaffected))
  await assertUnrelatedBookVisible()
  expect(fs.readFileSync(dbPath(unaffected)).equals(unaffectedBytes)).toBe(true)
  if (conflicting) {
    expect(fs.readFileSync(journalFile).equals(journal)).toBe(true)
    expect(fs.readFileSync(dbPath(affected)).equals(affectedBytes)).toBe(true)
    const refused = await app.request(`/books/${affected}/config`)
    expect(refused.status).toBe(409)
    expect(await refused.json()).toMatchObject({ code: "BOOK_BUSY" })
    expect(fs.readFileSync(journalFile).equals(journal)).toBe(true)
    // Restore the exact proposed bytes in this disposable fixture; this is an
    // explicit repair, not a timer/automatic overwrite of conflicting evidence.
    fs.writeFileSync(path.join(bookDir(affected), "config.yaml"), proposed)
  }
  // Either list recovered the recognized journal through the existing shared
  // boundary, or it isolated the affected card. Opening config must recover it.
  expect((await app.request(`/books/${affected}/config`)).status).toBe(200)
  expect(fs.existsSync(journalFile)).toBe(false)
  const cards = await assertUnrelatedBookVisible()
  expect(cards.map(book => book.label).sort()).toEqual([affected, unaffected])
})

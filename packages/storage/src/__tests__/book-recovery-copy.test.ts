import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { BOOK_RECOVERY_PENDING_FILE } from "@adt/types"
import { createBookStorage } from "../book-storage.js"
import { openBookDb } from "../db.js"
import { withBookWriter } from "../book-writer.js"
import { inspectExtractionDestination, extractionHash } from "../extraction-manifest.js"
import { recoverBookCopy } from "../book-recovery-copy.js"

const inputs = { contractVersion: 1, startPage: 1, endPage: 1, spreadMode: false, spreadPairs: [], vectorTextGrouping: false, keepCoveredRasters: false, removeWatermarks: false, fixedLayout: false }
let root: string, source: string
const label = "stranded"
function bytes(folder: string): Record<string, string> {
  return Object.fromEntries(fs.readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile()).map(entry => {
      const file = path.join(entry.parentPath, entry.name)
      return [path.relative(folder, file), fs.readFileSync(file).toString("hex")]
    }))
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "book-recovery-copy-")))
  const storage = createBookStorage(label, root)
  storage.putNodeData("web-rendering", "pg001", { html: "Original manual content" })
  storage.putNodeData("web-rendering", "pg001", { html: "Second manual version" })
  storage.close()
  source = path.join(root, label)
  fs.writeFileSync(path.join(source, `${label}.pdf`), "original PDF")
  fs.mkdirSync(path.join(source, "audio"))
  fs.writeFileSync(path.join(source, "audio", "original.mp3"), "original audio")
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })

it.each(["foreign-host", "different-boot", "legacy-mutex", "unknown-mutex", "anonymous-reservation"])(
  "RAC-15 RAC-18: recovers a separate validated copy from %s without unlocking the original", async kind => {
    if (["foreign-host", "different-boot"].includes(kind)) fs.writeFileSync(path.join(source, ".book-writer.json"), JSON.stringify({
      token: randomUUID(), host: kind === "foreign-host" ? "another-host" : os.hostname(), pid: process.pid,
      ...(kind === "different-boot" ? { linuxProcess: { bootId: randomUUID(), pidNamespace: "pid:[1]", startTicks: "1" } } : {}),
    }))
    const mutex = path.join(source, `${label}.db.lock`)
    fs.mkdirSync(mutex)
    if (kind === "unknown-mutex") fs.writeFileSync(path.join(mutex, "owner-evidence"), "keep this evidence")
    if (kind === "anonymous-reservation") fs.mkdirSync(path.join(source, ".book-writer.json.recovery.preparing-" + randomUUID()))
    // This is the old public-open failure that prompted explicit copy recovery.
    expect(() => createBookStorage(label, root)).toThrow("BOOK_BUSY")
    const original = bytes(source)
    await recoverBookCopy(root, label, "recovered")
    expect(bytes(source)).toEqual(original)
    expect(fs.existsSync(mutex)).toBe(true)
    expect(() => createBookStorage(label, root)).toThrow("BOOK_BUSY")
    const copy = path.join(root, "recovered")
    expect(fs.existsSync(path.join(copy, BOOK_RECOVERY_PENDING_FILE))).toBe(false)
    expect(fs.readFileSync(path.join(copy, "recovered.pdf"), "utf8")).toBe("original PDF")
    expect(fs.readFileSync(path.join(copy, "audio/original.mp3"), "utf8")).toBe("original audio")
    const evidence = fs.readdirSync(copy).find(name => name.startsWith(".book-recovery-"))!
    const audit = JSON.parse(fs.readFileSync(path.join(copy, evidence, "audit.json"), "utf8"))
    expect(audit.files.map((file: { path: string }) => file.path)).toContain("stranded.db")
    expect(fs.existsSync(path.join(copy, evidence, "locks", `${label}.db.lock`))).toBe(true)
    const db = openBookDb(path.join(copy, "recovered.db"))
    try {
      expect(db.all("SELECT version, data FROM node_data WHERE node=? ORDER BY version", ["web-rendering"]))
        .toEqual([{ version: 1, data: JSON.stringify({ html: "Original manual content" }) }, { version: 2, data: JSON.stringify({ html: "Second manual version" }) }])
    } finally { db.close() }
  },
)

it("keeps same-process Library opens from mutating a mutex-stranded source during copying", async () => {
  fs.mkdirSync(path.join(source, `${label}.db.lock`))
  const before = bytes(source), lstat = fs.promises.lstat
  let attempted = false
  vi.spyOn(fs.promises, "lstat").mockImplementation((async (...args: Parameters<typeof fs.promises.lstat>) => {
    if (!attempted && String(args[0]).endsWith("original.mp3")) {
      attempted = true
      expect(() => createBookStorage(label, root)).toThrow("BOOK_BUSY")
    }
    return lstat(...args)
  }) as typeof fs.promises.lstat)
  await recoverBookCopy(root, label, "recovered")
  expect(attempted).toBe(true)
  expect(bytes(source)).toEqual(before)
})

it("copies a migratable v7 database without requiring step_runs before migration", async () => {
  const db = openBookDb(path.join(source, `${label}.db`))
  db.exec("DROP TABLE step_runs; CREATE TABLE step_completions (step TEXT PRIMARY KEY, completed_at TEXT); INSERT INTO step_completions VALUES ('extract', '2026-01-01'); UPDATE schema_version SET version=7 WHERE id=1")
  db.exec("DROP TABLE images; CREATE TABLE images (image_id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(page_id), path TEXT NOT NULL, hash TEXT NOT NULL DEFAULT '', width INTEGER NOT NULL, height INTEGER NOT NULL, source TEXT NOT NULL CHECK(source IN ('page','extract','crop','segment')))")
  db.close()
  fs.mkdirSync(path.join(source, `${label}.db.lock`))
  const before = bytes(source)
  await recoverBookCopy(root, label, "recovered")
  expect(bytes(source)).toEqual(before)
  const copy = openBookDb(path.join(root, "recovered/recovered.db"))
  try { expect(copy.all("SELECT status FROM step_runs WHERE step='extract'")).toEqual([{ status: "done" }]) }
  finally { copy.close() }
})

it.each(["current", "legacy"])("refuses a known live %s owner before creating a destination", async kind => {
  const storage = kind === "current" ? createBookStorage(label, root) : undefined
  if (!storage) fs.writeFileSync(path.join(source, ".book-writer.json"), JSON.stringify({ token: randomUUID(), host: os.hostname(), pid: process.pid }))
  const original = bytes(source)
  try {
    await expect(recoverBookCopy(root, label, "recovered")).rejects.toMatchObject({ code: "BOOK_BUSY" })
    expect(bytes(source)).toEqual(original)
    expect(fs.existsSync(path.join(root, "recovered"))).toBe(false)
  } finally { storage?.close() }
})

it.each(["pre-boot", "recent", "one-old-timestamp"])("copy recovery treats %s legacy PID evidence conservatively", async kind => {
  const lock = path.join(source, ".book-writer.json")
  fs.writeFileSync(lock, JSON.stringify({ token: randomUUID(), host: os.hostname(), pid: process.pid }))
  const original = bytes(source), stat = fs.lstatSync
  vi.spyOn(os, "uptime").mockReturnValue(3600)
  const beforeBoot = Date.now() - (os.uptime() + 300) * 1000
  vi.spyOn(fs, "lstatSync").mockImplementation(((file: fs.PathLike, options?: fs.StatOptions) => {
    const result = stat(file, options as never)
    if (String(file) === lock && !options?.bigint && kind !== "recent") {
      Object.assign(result, { mtimeMs: beforeBoot, ...(kind === "pre-boot" ? { ctimeMs: beforeBoot } : {}) })
    }
    return result
  }) as typeof fs.lstatSync)
  // Timestamps alone do not waive the agreed live-PID refusal. Changing this
  // recovery policy requires an explicit owner decision, not an age heuristic.
  await expect(recoverBookCopy(root, label, "recovered")).rejects.toMatchObject({ code: "BOOK_BUSY" })
  expect(() => createBookStorage(label, root)).toThrow("BOOK_BUSY")
  expect(bytes(source)).toEqual(original)
})

it.each(["same-label", "existing", "symlink", "hardlink", "corrupt-db"])("preserves the source and refuses %s recovery", async kind => {
  let destination = "recovered"
  if (kind === "same-label") destination = label
  if (kind === "existing") { fs.mkdirSync(path.join(root, destination)); fs.writeFileSync(path.join(root, destination, "owner-data"), "keep") }
  if (kind === "symlink") fs.symlinkSync(path.join(source, `${label}.pdf`), path.join(source, "alias"))
  if (kind === "hardlink") fs.linkSync(path.join(source, `${label}.pdf`), path.join(source, "alias"))
  if (kind === "corrupt-db") fs.writeFileSync(path.join(source, `${label}.db`), "not SQLite")
  const original = bytes(source)
  await expect(recoverBookCopy(root, label, destination)).rejects.toThrow()
  expect(bytes(source)).toEqual(original)
  if (kind === "existing") expect(fs.readFileSync(path.join(root, destination, "owner-data"), "utf8")).toBe("keep")
  else if (kind !== "same-label") expect(fs.existsSync(path.join(root, destination))).toBe(false)
})

it("rejects a source mutation during copying and removes only its own partial copy", async () => {
  const original = fs.promises.lstat
  let reads = 0
  vi.spyOn(fs.promises, "lstat").mockImplementation(((file: fs.PathLike, options: unknown) => {
    if (String(file) === path.join(source, "audio/original.mp3") && ++reads === 3) fs.writeFileSync(file, "another writer changed this")
    return original(file, options as never)
  }) as typeof fs.promises.lstat)
  await expect(recoverBookCopy(root, label, "recovered")).rejects.toMatchObject({ code: "BOOK_RECOVERY_COPY_UNSAFE" })
  expect(fs.readFileSync(path.join(source, "audio/original.mp3"), "utf8")).toBe("another writer changed this")
  expect(fs.existsSync(path.join(root, "recovered"))).toBe(false)
})

it("rejects a missing source entry even if directory timestamps cannot distinguish the change", async () => {
  const lstat = fs.promises.lstat, directories = new Map<string, fs.BigIntStats>()
  let rootReads = 0
  vi.spyOn(fs.promises, "lstat").mockImplementation((async (...args: Parameters<typeof fs.promises.lstat>) => {
    const file = String(args[0])
    if (file === source && ++rootReads === 3) fs.unlinkSync(path.join(source, "audio/original.mp3"))
    const stat = await lstat(...args)
    if (stat.isDirectory()) {
      const original = directories.get(file)
      if (original) return original
      directories.set(file, stat as fs.BigIntStats)
    }
    return stat
  }) as typeof fs.promises.lstat)
  await expect(recoverBookCopy(root, label, "recovered")).rejects.toMatchObject({ code: "BOOK_RECOVERY_COPY_UNSAFE" })
  expect(fs.existsSync(path.join(root, "recovered"))).toBe(false)
})

it("recovers a real interrupted transaction in the copy and preserves the original journal and mutex", async () => {
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {createBookStorage} from ${JSON.stringify(path.resolve("packages/storage/dist/book-storage.js"))};
    const storage=createBookStorage(${JSON.stringify(label)},${JSON.stringify(root)});
    storage.transaction(()=>{
      storage.putNodeData('web-rendering','pg001',{uncommitted:true});
      const lock=${JSON.stringify(path.join(source, ".book-writer.json"))};
      const owner=JSON.parse(fs.readFileSync(lock,'utf8')); delete owner.coordinatedDatabases;
      fs.writeFileSync(lock,JSON.stringify(owner));
      process.kill(process.pid,'SIGKILL');
    });
  `], { encoding: "utf8", timeout: 5000 })
  expect(child.signal, child.stderr).toBe("SIGKILL")
  const original = bytes(source)
  expect(() => createBookStorage(label, root)).toThrow("BOOK_BUSY")
  await recoverBookCopy(root, label, "recovered")
  expect(bytes(source)).toEqual(original)
  const recovered = createBookStorage("recovered", root)
  try { expect(recovered.getLatestNodeData("web-rendering", "pg001")?.data).toEqual({ html: "Second manual version" }) }
  finally { recovered.close() }
})

it("keeps a killed copy hidden and refuses its database while another fresh copy remains recoverable", async () => {
  const original = bytes(source)
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import fs from 'node:fs';
    import {recoverBookCopy} from ${JSON.stringify(path.resolve("packages/storage/dist/book-recovery-copy.js"))};
    const open=fs.promises.open;
    fs.promises.open=async function(file,...args){
      const handle=await open.call(this,file,...args);
      if(String(file)===${JSON.stringify(path.join(root, "interrupted", "interrupted.db"))}) process.kill(process.pid,'SIGKILL');
      return handle;
    };
    await recoverBookCopy(${JSON.stringify(root)},${JSON.stringify(label)},'interrupted');
  `], { encoding: "utf8", timeout: 5000 })
  expect(child.signal, child.stderr).toBe("SIGKILL")
  expect(bytes(source)).toEqual(original)
  expect(fs.existsSync(path.join(root, "interrupted", BOOK_RECOVERY_PENDING_FILE))).toBe(true)
  expect(() => createBookStorage("interrupted", root)).toThrow("not been validated")
  await recoverBookCopy(root, label, "recovered")
  expect(bytes(source)).toEqual(original)
  expect(fs.existsSync(path.join(root, "recovered", BOOK_RECOVERY_PENDING_FILE))).toBe(false)
})

it("allows initial extraction of a recovered PDF-only book while retaining lock evidence", async () => {
  const empty = createBookStorage("initial", root); empty.close()
  const initial = path.join(root, "initial")
  fs.writeFileSync(path.join(initial, "initial.pdf"), "PDF bytes")
  fs.mkdirSync(path.join(initial, "initial.db.lock"))
  await recoverBookCopy(root, "initial", "initial-copy")
  const copy = path.join(root, "initial-copy")
  expect(withBookWriter(copy, () => inspectExtractionDestination(copy, extractionHash("PDF bytes"), inputs))).toBe("initial")
  const evidence = fs.readdirSync(copy).find(name => name.startsWith(".book-recovery-"))!
  fs.writeFileSync(path.join(copy, evidence, "unknown-content"), "not bookkeeping")
  expect(() => withBookWriter(copy, () => inspectExtractionDestination(copy, extractionHash("PDF bytes"), inputs))).toThrow("EXTRACTION_LEGACY")
})

it("preserves an extraction manifest and relocates only its source PDF entry", async () => {
  const manifest = { schemaVersion: 1, attemptId: randomUUID(), status: "failed", sourceHash: extractionHash("original PDF"), inputs,
    inputFingerprint: extractionHash(JSON.stringify(inputs)), pages: [], images: [], nodes: [],
    assets: [{ path: "stranded.pdf", hash: extractionHash("original PDF") }] }
  const original = JSON.stringify(manifest)
  fs.writeFileSync(path.join(source, "extraction.json"), original)
  await recoverBookCopy(root, label, "recovered")
  const copy = path.join(root, "recovered"), evidence = fs.readdirSync(copy).find(name => name.startsWith(".book-recovery-"))!
  expect(fs.readFileSync(path.join(source, "extraction.json"), "utf8")).toBe(original)
  expect(fs.readFileSync(path.join(copy, evidence, "extraction.json"), "utf8")).toBe(original)
  expect(JSON.parse(fs.readFileSync(path.join(copy, "extraction.json"), "utf8"))).toEqual({ ...manifest, assets: [{ ...manifest.assets[0], path: "recovered.pdf" }] })
})

it("refuses a live reservation owner even when its directory contains unrelated evidence", async () => {
  const reservation = path.join(source, ".book-writer.json.recovery")
  fs.mkdirSync(reservation)
  const token = randomUUID()
  fs.writeFileSync(path.join(reservation, "owner.json"), JSON.stringify({ format: "adt-book-admission-v1", rootToken: token,
    owner: { token, host: os.hostname(), pid: process.pid } }))
  fs.writeFileSync(path.join(reservation, "unknown-evidence"), "preserve")
  const original = bytes(source)
  await expect(recoverBookCopy(root, label, "recovered")).rejects.toMatchObject({ code: "BOOK_BUSY" })
  expect(bytes(source)).toEqual(original)
  expect(fs.existsSync(path.join(root, "recovered"))).toBe(false)
})


it.each([false, true])("reports an existing destination without touching it (interrupted=%s)", async interrupted => {
  const destination = path.join(root, "taken")
  fs.mkdirSync(destination); fs.writeFileSync(path.join(destination, "owner-file"), "keep")
  if (interrupted) fs.writeFileSync(path.join(destination, BOOK_RECOVERY_PENDING_FILE), "pending")
  const original = bytes(source), existing = bytes(destination)
  await expect(recoverBookCopy(root, label, "taken")).rejects.toMatchObject({ code: "BOOK_RECOVERY_COPY_DESTINATION_EXISTS" })
  expect(bytes(source)).toEqual(original); expect(bytes(destination)).toEqual(existing)
})
it.each([
  ["ENOSPC", "BOOK_RECOVERY_COPY_NO_SPACE"], ["EDQUOT", "BOOK_RECOVERY_COPY_NO_SPACE"],
  ["EACCES", "BOOK_RECOVERY_COPY_ACCESS_DENIED"], ["EROFS", "BOOK_RECOVERY_COPY_ACCESS_DENIED"],
])("reports %s while preserving the original and removing only its own partial copy", async (errno, code) => {
  const original = bytes(source), open = fs.promises.open
  vi.spyOn(fs.promises, "open").mockImplementation(((...args: Parameters<typeof fs.promises.open>) => {
    if (String(args[0]).startsWith(path.join(root, "failed") + path.sep)) return Promise.reject(Object.assign(new Error(errno), { code: errno }))
    return open(...args)
  }) as typeof fs.promises.open)
  await expect(recoverBookCopy(root, label, "failed")).rejects.toMatchObject({ code })
  expect(bytes(source)).toEqual(original)
  expect(fs.existsSync(path.join(root, "failed"))).toBe(false)
})

import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { BOOK_RECOVERY_PENDING_FILE, BookRecoveryCopyAudit, type BookRecoveryCopyErrorCode, ExtractionManifest, parseBookLabel } from "@adt/types"
import { assertNoKnownLiveBookOwner, BookBusyError, withBookRecoverySource, withNewBookWriter } from "./book-writer.js"
import { openCoordinatedDatabase } from "./database-admission.js"
import { atomicBookFile } from "./sectioning-transition.js"

export class BookRecoveryCopyError extends Error {
  constructor(message: string, readonly code: BookRecoveryCopyErrorCode = "BOOK_RECOVERY_COPY_UNSAFE") {
    super(message)
  }
}

const unsafe = () => new BookRecoveryCopyError("The source changed, contains unsafe paths, or could not be validated. The original book and its lock evidence have been preserved.")
const stamp = (stat: fs.BigIntStats) => [stat.dev, stat.ino, stat.mode, stat.nlink, stat.size, stat.mtimeNs, stat.ctimeNs].join(":")

/** Stream a stable regular file without following aliases. Opening SQLite on
 * the source would itself create/change locks, so copying never opens its DB. */
async function copyOrHash(file: string, destination?: string): Promise<{ identity: string; hash: string }> {
  const before = await fs.promises.lstat(file, { bigint: true })
  if (!before.isFile() || before.nlink !== 1n || await fs.promises.realpath(file) !== file) throw unsafe()
  const input = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  let output: fs.promises.FileHandle | undefined
  try {
    if (stamp(await input.stat({ bigint: true })) !== stamp(before)) throw unsafe()
    if (destination) output = await fs.promises.open(destination, "wx", Number(before.mode & 0o777n))
    const hash = createHash("sha256"), buffer = Buffer.allocUnsafe(1024 * 1024)
    for (;;) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null)
      if (!bytesRead) break
      hash.update(buffer.subarray(0, bytesRead))
      if (output) {
        for (let offset = 0; offset < bytesRead;) {
          const { bytesWritten } = await output.write(buffer, offset, bytesRead - offset, null)
          if (!bytesWritten) throw unsafe()
          offset += bytesWritten
        }
      }
    }
    if (stamp(await input.stat({ bigint: true })) !== stamp(before) ||
        stamp(await fs.promises.lstat(file, { bigint: true })) !== stamp(before)) throw unsafe()
    if (output) { await output.chmod(Number(before.mode & 0o777n)); await output.sync() }
    return { identity: stamp(before), hash: hash.digest("hex") }
  } finally {
    try { await input.close() } finally { await output?.close() }
  }
}

/** Recover an explicitly requested separate copy. Original admission remains
 * unchanged. Stability checks are conservative: any observed source change
 * discards our partial copy. SQLite recovers only the copied journal/WAL. */
export async function recoverBookCopy(booksDir: string, sourceLabel: string, label: string): Promise<void> {
  parseBookLabel(sourceLabel); parseBookLabel(label)
  let destinationReserved = false
  try {
    const root = fs.realpathSync(booksDir), source = path.join(root, sourceLabel), destination = path.join(root, label)
    if (source === destination || fs.realpathSync(source) !== source || !fs.lstatSync(source).isDirectory()) throw unsafe()
    if (fs.existsSync(path.join(source, BOOK_RECOVERY_PENDING_FILE))) throw unsafe()
    assertNoKnownLiveBookOwner(source)
    const evidenceName = `.book-recovery-${randomUUID()}`
    // The source must have a database; a PDF-only project can be opened normally.
    if (!fs.lstatSync(path.join(source, `${sourceLabel}.db`), { throwIfNoEntry: false })?.isFile()) throw unsafe()
    await withBookRecoverySource(source, () => withNewBookWriter(destination, async () => {
      destinationReserved = true
      let completed = false
      try {
        const evidence = path.join(destination, evidenceName)
        fs.mkdirSync(evidence)
        atomicBookFile(path.join(destination, BOOK_RECOVERY_PENDING_FILE), JSON.stringify({ sourceLabel, label }))
        const files = new Map<string, { identity: string; hash: string }>()
        const directories = new Map<string, string>()
        let checkedFiles = 0, checkedDirectories = 0
        const mapName = (name: string) => {
          if (name === ".book-writer.json" || name.startsWith(".book-writer.json.") || name.endsWith(".db.lock")) return path.join(evidenceName, "locks", name)
          if (name === `${sourceLabel}.pdf`) return `${label}.pdf`
          if (name === `${sourceLabel}.db` || ["-wal", "-shm", "-journal"].some(suffix => name === `${sourceLabel}.db${suffix}`)) return label + name.slice(sourceLabel.length)
          return name
        }
        const visit = async (relative: string, target: string, copying: boolean) => {
          const folder = path.join(source, relative)
          const stat = await fs.promises.lstat(folder, { bigint: true })
          if (!stat.isDirectory() || await fs.promises.realpath(folder) !== folder) throw unsafe()
          if (copying) directories.set(relative, stamp(stat))
          else {
            if (directories.get(relative) !== stamp(stat)) throw unsafe()
            checkedDirectories++
          }
          for (const name of (await fs.promises.readdir(folder)).sort()) {
            const entry = path.join(relative, name), file = path.join(source, entry)
            const output = path.join(target, relative ? name : mapName(name))
            const child = await fs.promises.lstat(file, { bigint: true })
            if (child.isDirectory()) {
              if (copying) await fs.promises.mkdir(output, { recursive: true })
              await visit(entry, output, copying)
            } else if (child.isFile()) {
              if (copying) await fs.promises.mkdir(path.dirname(output), { recursive: true })
              const observed = await copyOrHash(file, copying ? output : undefined)
              if (copying) files.set(entry, observed)
              else {
                if (JSON.stringify(files.get(entry)) !== JSON.stringify(observed)) throw unsafe()
                checkedFiles++
              }
            } else throw unsafe()
          }
          if (stamp(await fs.promises.lstat(folder, { bigint: true })) !== stamp(stat)) throw unsafe()
        }
        await visit("", destination, true)
        assertNoKnownLiveBookOwner(source)
        await visit("", destination, false)
        if (checkedFiles !== files.size || checkedDirectories !== directories.size) throw unsafe()
        assertNoKnownLiveBookOwner(source)

        // Retain the original extraction record before relocating its PDF path.
        // All immutable entity/history/identity bytes keep their original values.
        const extraction = path.join(destination, "extraction.json")
        if (fs.existsSync(extraction)) {
          const original = fs.readFileSync(extraction, "utf8")
          const parsed = ExtractionManifest.safeParse(JSON.parse(original))
          if (!parsed.success) throw unsafe()
          fs.writeFileSync(path.join(evidence, "extraction.json"), original, { flag: "wx" })
          atomicBookFile(extraction, JSON.stringify({ ...parsed.data, assets: parsed.data.assets.map(asset =>
            asset.path === `${sourceLabel}.pdf` ? { ...asset, path: `${label}.pdf` } : asset) }))
        }
        // No migrations or recovery repair: validate the copied SQLite database,
        // preserving its history and allowing SQLite's own crash rollback only.
        const db = openCoordinatedDatabase(path.join(destination, `${label}.db`), { fileMustExist: true })
        try {
          if (JSON.stringify(db.all("PRAGMA integrity_check")) !== JSON.stringify([{ integrity_check: "ok" }])) throw unsafe()
          const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('pages', 'node_data')")
          if (tables.length !== 2) throw unsafe()
        } finally { db.close() }
        const audit = BookRecoveryCopyAudit.parse({ format: "adt-book-recovery-copy-v1", sourceLabel, label,
          createdAt: new Date().toISOString(), files: [...files].map(([file, value]) => ({ path: file, sha256: value.hash })) })
        atomicBookFile(path.join(evidence, "audit.json"), JSON.stringify(audit, null, 2))
        fs.unlinkSync(path.join(destination, BOOK_RECOVERY_PENDING_FILE))
        completed = true
      } finally {
        // Remove our partial copy while its writer admission is still held.
        // Once admission releases, another operation may own this pathname.
        if (!completed) fs.rmSync(destination, { recursive: true, force: true })
      }
    }))
  } catch (error) {
    if (error instanceof BookBusyError || error instanceof BookRecoveryCopyError) throw error
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === "EEXIST" && !destinationReserved) throw new BookRecoveryCopyError("That recovery copy label already exists, possibly as an interrupted copy. Choose a different label. The original book is unchanged.", "BOOK_RECOVERY_COPY_DESTINATION_EXISTS")
    if (code === "ENOSPC" || code === "EDQUOT") throw new BookRecoveryCopyError("There is not enough disk space for the recovery copy. Free space and retry. The original book is unchanged.", "BOOK_RECOVERY_COPY_NO_SPACE")
    if (code === "EACCES" || code === "EPERM" || code === "EROFS") throw new BookRecoveryCopyError("The recovery copy could not read or write its files. Check folder access and retry. The original book is unchanged.", "BOOK_RECOVERY_COPY_ACCESS_DENIED")
    throw unsafe()
  }
}

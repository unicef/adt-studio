import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type { Storage } from "@adt/storage"
import { PackageOwnershipReceipt, PublicationPageEntry } from "@adt/types"
import { SectioningSafetyError } from "../sectioning-errors.js"
import { resolveReadingOrder, type ResolvedItem } from "../reading-order.js"

const receipt = ".build-owners"
const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex")
const owner = (item: ResolvedItem) => item.kind === "quiz" ? null : item.pageId

function regularMember(root: string, name: string): string {
  const actualRoot = fs.realpathSync(root), file = path.resolve(actualRoot, name)
  if (!file.startsWith(actualRoot + path.sep) || fs.realpathSync(file) !== file || !fs.statSync(file).isFile()) {
    throw new Error("Invalid packaged file")
  }
  return file
}

/** The old fixed-layout compatibility path could overwrite a contradictory HTML
 * declaration while packaging. A filename or wrapper in that artifact does not
 * prove its author. Bind new files to the resolver's source and final bytes. */
export function recordPackagedOwners(storage: Storage, root: string, items: readonly ResolvedItem[]): void {
  const bookId = storage.getBookIdentity?.() ?? null
  if (storage.bookDir && !bookId) throw new SectioningSafetyError("PACKAGE_RECOVERY_UNSAFE", "Book identity is unavailable; the previous package is retained.")
  const entries = items.map(item => [item.id, owner(item), digest(fs.readFileSync(regularMember(root, item.id + ".html")))])
  // The offline runtime embeds every page in one script. Check those bytes
  // independently; a correct set of standalone HTML files cannot vouch for a
  // preloader retained from a different package.
  const offline = "assets/offline-preloader.js"
  const preloader = digest(fs.readFileSync(regularMember(root, offline)))
  fs.writeFileSync(path.join(root, receipt), JSON.stringify({ format: "adt-package-owners-v2", bookId, entries, preloader }))
}

export function retainedPackageOwnership(storage: Storage, root: string) {
  const order = resolveReadingOrder(storage)
  const current = new Map(order.items.map(item => [item.id, item]))
  // Do not hide admission/storage errors. An unreadable package manifest cannot
  // authorize serving files. The live reader still has its own source proof.
  const result = { allOwned: false, entries: [] as { href: string; section_id: string }[],
    current: new Set(current.keys()), memberDigests: new Map<string, string>() }
  let manifest
  const receipts = new Map<string, [string | null, string]>()
  try {
    manifest = PublicationPageEntry.array().nonempty().parse(JSON.parse(fs.readFileSync(regularMember(root, "content/pages.json"), "utf8")))
    // An older receipt cannot prove which book supplied its intact bytes.
    // Keep the artifact, use the owned live reader, and require explicit
    // preparation for downloads. Same-book moves keep the persisted UUID.
    const record = PackageOwnershipReceipt.parse(JSON.parse(fs.readFileSync(regularMember(root, receipt), "utf8")))
    if (record.bookId !== storage.getBookIdentity?.()) return result
    const offline = "assets/offline-preloader.js"
    if (digest(fs.readFileSync(regularMember(root, offline))) !== record.preloader) return result
    result.memberDigests.set(offline, record.preloader)
    for (const row of record.entries) {
      if (receipts.has(row[0])) return result
      receipts.set(row[0], [row[1], row[2]])
    }
  } catch { return result }

  for (const entry of manifest) {
    const item = current.get(entry.section_id)
    if (!item || path.basename(entry.href) !== entry.href || entry.href !== item.id + ".html") continue
    const proof = receipts.get(item.id)
    if (!proof || proof[0] !== owner(item)) continue
    try {
      const hash = digest(fs.readFileSync(regularMember(root, entry.href)))
      if (hash !== proof[1]) continue
      result.memberDigests.set(entry.href, hash)
    } catch { continue }
    result.entries.push(entry)
  }
  const names = new Set(result.entries.map(entry => entry.href))
  result.allOwned = names.size === manifest.length && receipts.size === manifest.length &&
    fs.readdirSync(root).every(name => !name.toLowerCase().endsWith(".html") || name === "index.html" || names.has(name))
  return result
}

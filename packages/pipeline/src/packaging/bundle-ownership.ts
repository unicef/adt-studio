import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import { DomUtils, parseDocument } from "htmlparser2"
import type { Storage } from "@adt/storage"
import { PageSectioningOutput, PublicationPageEntry, WebRenderingOutput } from "@adt/types"
import { renderedSectionId } from "../render-sectioning.js"
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
export function recordPackagedOwners(root: string, items: readonly ResolvedItem[]): void {
  const entries = items.map(item => [item.id, owner(item), digest(fs.readFileSync(regularMember(root, item.id + ".html")))])
  fs.writeFileSync(path.join(root, receipt), JSON.stringify(entries))
}

function legacyOwnerUncertain(storage: Storage, item: ResolvedItem): boolean {
  if (item.kind === "quiz") return false
  // Inspect retained evidence, not only the selected row: restoring a valid
  // render must not certify wrong bytes created before the ownership fix.
  try {
    return storage.getAllNodeVersions("web-rendering", item.pageId).some(({ data }) => {
      const parsed = WebRenderingOutput.safeParse(data)
      if (!parsed.success || parsed.data.sections.length !== 1) return false
      const entry = parsed.data.sections[0]
      // Restrict this qualification to an artifact the previous producer could
      // actually have restamped. Ordinary lowercase/reflowable legacy pages
      // stay readable, including pages with multiple historical identities.
      if (entry.sectionId || entry.html.includes("data-section-id")) return false
      const doc = parseDocument(entry.html)
      const roots = DomUtils.findAll(el => el.attribs.id === "content", doc.children)
      if (roots.length !== 1) return false
      const declared = DomUtils.findAll(el => Object.hasOwn(el.attribs, "data-section-id"), doc.children)
      if (declared.length === 1 && renderedSectionId(entry) === item.id) return false
      if (!declared.length) {
        roots[0].attribs["data-section-id"] = item.id
        if (renderedSectionId({ ...entry, html: DomUtils.getOuterHTML(doc) }) === item.id) return false
      }
      return ["fixed-layout-sectioning", "page-sectioning"].some(node =>
        storage.getAllNodeVersions(node, item.pageId).some(row => {
          const source = PageSectioningOutput.safeParse(row.data)
          if (!source.success || source.data.sections.length !== 1) return false
          const section = source.data.sections[0]
          return section.sectionId === item.id && (node === "fixed-layout-sectioning" ||
            (entry.sectionType === "fixed-layout-page" && section.sectionType === "fixed-layout-page" && !!section.placement && !!section.viewport))
        }))
    })
  } catch (error) { if (error instanceof SyntaxError) return true; throw error }
}

export function retainedPackageOwnership(storage: Storage, root: string) {
  const order = resolveReadingOrder(storage)
  const current = new Map(order.items.map(item => [item.id, item]))
  // Do not hide admission/storage errors. An unreadable package manifest cannot
  // authorize serving files. The live reader still has its own source proof.
  const result = { allOwned: false, entries: [] as { href: string; section_id: string }[], current }
  let manifest, receipts: Map<string, [unknown, unknown]> | undefined
  try {
    manifest = PublicationPageEntry.array().nonempty().parse(JSON.parse(fs.readFileSync(regularMember(root, "content/pages.json"), "utf8")))
    if (fs.lstatSync(path.join(root, receipt), { throwIfNoEntry: false })) {
      const rows: unknown = JSON.parse(fs.readFileSync(regularMember(root, receipt), "utf8"))
      if (!Array.isArray(rows)) return result
      receipts = new Map()
      for (const row of rows) {
        if (!Array.isArray(row) || row.length !== 3 || typeof row[0] !== "string" || receipts.has(row[0])) return result
        receipts.set(row[0], [row[1], row[2]])
      }
    }
  } catch { return result }

  for (const entry of manifest) {
    const item = current.get(entry.section_id)
    if (!item || path.basename(entry.href) !== entry.href || entry.href !== item.id + ".html") continue
    if (receipts) {
      const proof = receipts.get(item.id)
      if (!proof || proof[0] !== owner(item)) continue
      try { if (proof[1] !== digest(fs.readFileSync(regularMember(root, entry.href)))) continue }
      catch { continue }
    } else if (legacyOwnerUncertain(storage, item)) continue
    result.entries.push(entry)
  }
  const names = new Set(result.entries.map(entry => entry.href))
  result.allOwned = names.size === manifest.length && (!receipts || receipts.size === manifest.length) &&
    fs.readdirSync(root).every(name => !name.toLowerCase().endsWith(".html") || name === "index.html" || names.has(name))
  return result
}

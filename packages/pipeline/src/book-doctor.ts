/**
 * Book doctor: a read-only compatibility check for existing books.
 *
 * Reports, per book, the facts that decide whether an older book needs
 * attention on this version: schema version, stale lock files, rendered
 * sections with no provable owner (omitted from preview and export), duplicate
 * text ids, and catalog ids that re-key on this version (whose translations and
 * audio detach). It writes nothing, migrates nothing and calls no model.
 */
import fs from "node:fs"
import path from "node:path"
import { DomUtils, parseDocument } from "htmlparser2"
import { createBookStorage, readBookSchemaVersion, type Storage } from "@adt/storage"
import { SCHEMA_VERSION, WebRenderingOutput, collectLeafNodes } from "@adt/types"
import type { PageSectioningSection } from "@adt/types"
import { renderingOwnershipWarnings, withLegacyRenderingOwnership, getRenderSectioning, resolveRenderedSection } from "./render-sectioning.js"
import { buildTextCatalogSnapshot } from "./text-catalog.js"

export interface OwnerCandidate {
  sectionId: string
  sectionType: string
  /** Leaf ids the rendering and the section share, over the section's leaves. */
  leafOverlap: number
  leafTotal: number
}

export interface UnownedRendering {
  pageId: string
  sectionIndex: number
  sectionType?: string
  /** First words of the rendered text, to recognise the section. */
  preview: string
  candidates: OwnerCandidate[]
}

export interface BookDiagnosis {
  label: string
  schemaVersion: number | null
  schemaStatus: "current" | "older" | "newer" | "unreadable"
  /** `<label>.db.lock` directory left by an interrupted process. */
  staleLockDir: boolean
  /** `.book-writer.json` content when present; informational only. */
  writerLease: string | null
  pages: number
  unownedRenderings: UnownedRendering[]
  duplicateTextIds: Array<{ id: string; pageIds: string[]; texts: number }>
  rekeyedCatalogIds: {
    oldOnly: string[]
    newOnly: string[]
    detachedTranslations: number
    detachedAudio: number
    detachedPreparations: number
  }
  /** Set when the book could not be opened or read; deeper checks were skipped. */
  error?: string
}

const emptyRekey = () => ({ oldOnly: [], newOnly: [], detachedTranslations: 0, detachedAudio: 0, detachedPreparations: 0 })

function htmlLeafIds(html: string): Set<string> {
  const doc = parseDocument(html)
  return new Set(DomUtils.findAll((element) => element.type === "tag" && element.name !== "img" && !!element.attribs["data-id"], doc.children).map((element) => element.attribs["data-id"]))
}

function htmlPreview(html: string): string {
  const text = DomUtils.textContent(parseDocument(html)).replace(/\s+/g, " ").trim()
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

function readLease(bookDir: string): string | null {
  const file = path.join(bookDir, ".book-writer.json")
  if (!fs.existsSync(file)) return null
  try {
    const lease = JSON.parse(fs.readFileSync(file, "utf8")) as { pid?: unknown; host?: unknown }
    return `pid ${String(lease.pid ?? "?")} on ${String(lease.host ?? "?")}`
  } catch {
    return "unreadable"
  }
}

function sectionCandidates(storage: Storage, pageId: string, rendering: WebRenderingOutput, entryIndex: number): OwnerCandidate[] {
  const sections: PageSectioningSection[] = getRenderSectioning(storage, pageId)?.sections ?? []
  const entry = rendering.sections[entryIndex]
  const ownedElsewhere = new Set(rendering.sections.flatMap((other, index) => {
    if (index === entryIndex) return []
    const owner = resolveRenderedSection(other, sections)?.sectionId
    return owner ? [owner] : []
  }))
  const leafIds = htmlLeafIds(entry.html)
  return sections
    .filter((section) => !section.isPruned && !ownedElsewhere.has(section.sectionId))
    .map((section) => {
      const leaves = collectLeafNodes(section.nodes).filter((leaf) => leaf.role !== "image").map((leaf) => leaf.nodeId)
      return { sectionId: section.sectionId, sectionType: section.sectionType, leafOverlap: leaves.filter((id) => leafIds.has(id)).length, leafTotal: leaves.length }
    })
    .filter((candidate) => candidate.leafOverlap > 0 || candidate.sectionType === entry.sectionType)
    .sort((a, b) => b.leafOverlap - a.leafOverlap || a.sectionId.localeCompare(b.sectionId))
}

function diagnoseOpenBook(storage: Storage, diagnosis: BookDiagnosis): void {
  const pages = storage.getPages()
  diagnosis.pages = pages.length

  for (const warning of renderingOwnershipWarnings(storage)) {
    const parsed = WebRenderingOutput.safeParse(storage.getLatestNodeData("web-rendering", warning.pageId)?.data)
    if (!parsed.success) continue
    const rendering = withLegacyRenderingOwnership(storage, warning.pageId, parsed.data)
    const entryIndex = rendering.sections.findIndex((entry) => entry.sectionIndex === warning.sectionIndex)
    if (entryIndex === -1) continue
    const entry = rendering.sections[entryIndex]
    diagnosis.unownedRenderings.push({
      pageId: warning.pageId, sectionIndex: warning.sectionIndex, sectionType: entry.sectionType,
      preview: htmlPreview(entry.html), candidates: sectionCandidates(storage, warning.pageId, rendering, entryIndex),
    })
  }

  const snapshot = buildTextCatalogSnapshot(storage, pages)
  diagnosis.duplicateTextIds = (snapshot.conflicts ?? []).map((conflict) => ({ id: conflict.id, pageIds: conflict.pageIds, texts: conflict.texts.length }))

  const stored = storage.getLatestNodeData("text-catalog", "book")?.data as { entries?: Array<{ id: string }> } | undefined
  if (!stored?.entries) return
  const storedIds = new Set(stored.entries.map((entry) => entry.id))
  const newIds = new Set(snapshot.entries.map((entry) => entry.id))
  const oldOnly = new Set([...storedIds].filter((id) => !newIds.has(id)))
  if (!oldOnly.size) return
  const count = (node: string, key: "id" | "textId") => storage.getNodeItemIds(node).reduce((total, itemId) => {
    const entries = (storage.getLatestNodeData(node, itemId)?.data as { entries?: Array<Record<string, unknown>> } | undefined)?.entries ?? []
    return total + entries.filter((entry) => oldOnly.has(String(entry[key]))).length
  }, 0)
  diagnosis.rekeyedCatalogIds = {
    oldOnly: [...oldOnly].sort(),
    newOnly: [...newIds].filter((id) => !storedIds.has(id)).sort(),
    detachedTranslations: count("text-catalog-translation", "id"),
    detachedAudio: count("tts", "textId"),
    detachedPreparations: count("core-tts-catalog", "id"),
  }
}

/** Diagnose one book. Never throws for a book problem; see `error`. */
export function diagnoseBook(booksDir: string, label: string): BookDiagnosis {
  const bookDir = path.join(path.resolve(booksDir), label)
  const dbPath = path.join(bookDir, `${label}.db`)
  const diagnosis: BookDiagnosis = {
    label, schemaVersion: null, schemaStatus: "unreadable",
    staleLockDir: fs.existsSync(`${dbPath}.lock`), writerLease: readLease(bookDir),
    pages: 0, unownedRenderings: [], duplicateTextIds: [], rekeyedCatalogIds: emptyRekey(),
  }
  if (!fs.existsSync(dbPath)) {
    diagnosis.error = "no database file"
    return diagnosis
  }
  if (diagnosis.staleLockDir) {
    // Opening would fail with "database is locked"; nothing else is provable.
    diagnosis.error = `stale lock directory ${label}.db.lock; remove it before opening this book`
    return diagnosis
  }
  try {
    diagnosis.schemaVersion = readBookSchemaVersion(dbPath)
  } catch (error) {
    diagnosis.error = `cannot read schema: ${error instanceof Error ? error.message : String(error)}`
    return diagnosis
  }
  if (diagnosis.schemaVersion === null) return diagnosis
  diagnosis.schemaStatus = diagnosis.schemaVersion === SCHEMA_VERSION ? "current" : diagnosis.schemaVersion < SCHEMA_VERSION ? "older" : "newer"
  // Opening an older book would migrate it and a newer one would be refused;
  // this check must stay read-only, so deeper checks need the current schema.
  if (diagnosis.schemaStatus !== "current") return diagnosis
  let storage: Storage | undefined
  try {
    storage = createBookStorage(label, booksDir)
    diagnoseOpenBook(storage, diagnosis)
  } catch (error) {
    diagnosis.error = error instanceof Error ? error.message : String(error)
  } finally {
    storage?.close()
  }
  return diagnosis
}

/** Diagnose every `<label>/<label>.db` under a books directory, in name order. */
export function diagnoseBooks(booksDir: string): BookDiagnosis[] {
  const root = path.resolve(booksDir)
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root)
    .filter((entry) => fs.existsSync(path.join(root, entry, `${entry}.db`)))
    .sort()
    .map((label) => diagnoseBook(root, label))
}

export function hasFindings(diagnosis: BookDiagnosis): boolean {
  return !!diagnosis.error || diagnosis.staleLockDir || diagnosis.schemaStatus !== "current" ||
    diagnosis.unownedRenderings.length > 0 || diagnosis.duplicateTextIds.length > 0 || diagnosis.rekeyedCatalogIds.oldOnly.length > 0
}

export function formatDiagnosis(diagnosis: BookDiagnosis): string {
  const head: string[] = []
  if (diagnosis.schemaVersion === null) head.push("schema unknown")
  else if (diagnosis.schemaStatus === "current") head.push(`schema ${diagnosis.schemaVersion}`)
  else head.push(`schema ${diagnosis.schemaVersion} (${diagnosis.schemaStatus} than this version's ${SCHEMA_VERSION}; deeper checks skipped)`)
  if (diagnosis.schemaStatus === "current" && !diagnosis.error) head.push(`${diagnosis.pages} pages`)
  if (diagnosis.writerLease) head.push(`writer lease ${diagnosis.writerLease}`)
  if (diagnosis.error) head.push(`ERROR ${diagnosis.error}`)
  const lines = [`${diagnosis.label}: ${head.join(" · ")}`]
  const { unownedRenderings, duplicateTextIds, rekeyedCatalogIds } = diagnosis
  if (unownedRenderings.length) {
    lines.push(`  rendered sections without a provable owner (omitted from preview/export): ${unownedRenderings.length}`)
    for (const item of unownedRenderings) {
      const candidates = item.candidates.length
        ? item.candidates.map((candidate) => `${candidate.sectionId} (${candidate.sectionType}, ${candidate.leafOverlap}/${candidate.leafTotal} leaves)`).join(", ")
        : "none on this page"
      lines.push(`    ${item.pageId} rendering #${item.sectionIndex} "${item.preview}" → candidates: ${candidates}`)
    }
  }
  if (duplicateTextIds.length) {
    lines.push(`  duplicate text ids (first copy wins, warning shown): ${duplicateTextIds.length}`)
    for (const item of duplicateTextIds.slice(0, 10)) lines.push(`    ${item.id} on ${item.pageIds.join(", ")} (${item.texts} texts)`)
    if (duplicateTextIds.length > 10) lines.push(`    … ${duplicateTextIds.length - 10} more`)
  }
  if (rekeyedCatalogIds.oldOnly.length) {
    lines.push(`  catalog ids that re-key on this version: ${rekeyedCatalogIds.oldOnly.length} (detached: ${rekeyedCatalogIds.detachedTranslations} translations, ${rekeyedCatalogIds.detachedAudio} audio, ${rekeyedCatalogIds.detachedPreparations} preparations)`)
    lines.push(`    old: ${rekeyedCatalogIds.oldOnly.slice(0, 6).join(", ")}${rekeyedCatalogIds.oldOnly.length > 6 ? ", …" : ""}`)
    lines.push(`    new: ${rekeyedCatalogIds.newOnly.slice(0, 6).join(", ")}${rekeyedCatalogIds.newOnly.length > 6 ? ", …" : ""}`)
    lines.push("    a Language and Speech run regenerates the detached outputs")
  }
  if (!hasFindings(diagnosis)) lines[0] += " · no findings"
  return lines.join("\n")
}

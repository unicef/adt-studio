import { packageFilesHash } from "./packaging/publication.js"
import fs from "node:fs"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { ValidationArtifactSnapshot, PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import type { Storage } from "@adt/storage"
import { inputSignature } from "./output-freshness.js"
import { renderedSectionId } from "./sectioning-sync-evidence.js"
import { resolvePackagedPageFilePath } from "./accessibility-assessment-shared.js"

const FILE = ".validation-inputs.json"
function artifactFile(adtDir: string, href: string): string | null {
  if (!fs.lstatSync(adtDir).isDirectory() || /[?#\\]/.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null
  const candidate = resolvePackagedPageFilePath(adtDir, href).filePath
  if (!candidate || !fs.lstatSync(candidate).isFile()) return null
  return fs.realpathSync(candidate).startsWith(fs.realpathSync(adtDir) + path.sep) ? candidate : null
}
/** Read from the actual loaded document, including runtime soft navigation.
 * This identity is a reference to a server-captured artifact, never origin proof. */
export function stampValidationArtifact(adtDir: string, entries: Array<{ href: string; section_id?: string }>, storage?: Storage): string {
  const id = randomUUID()
  const owners = storage ? activeSectionOwners(storage) : new Map()
  for (const entry of entries) {
    const file = artifactFile(adtDir, entry.href)
    if (!file) continue
    const html = fs.readFileSync(file, "utf8").replace(/<meta\s+name="adt-validation-(?:artifact|page)"[^>]*>\s*/gi, "")
    const matches = owners.get(entry.section_id)
    const owner = matches?.length === 1 ? matches[0].pageId : undefined
    const ownerMeta = owner ? `<meta name="adt-validation-page" content="${owner.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')}">` : ""
    fs.writeFileSync(file, html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}<meta name="adt-validation-artifact" content="${id}">${ownerMeta}`))
  }
  return id
}
function activeSectionOwners(storage: Storage) {
  const owners = new Map<string, Array<{ pageId: string; version: number; data: unknown }>>()
  for (const page of storage.getPages()) {
    const row = storage.getLatestNodeData("page-sectioning", page.pageId)
    const source = PageSectioningOutput.safeParse(row?.data)
    if (!source.success) continue
    for (const section of source.data.sections) if (!section.isPruned) {
      const list = owners.get(section.sectionId) ?? []
      list.push({ pageId: page.pageId, version: row!.version, data: row!.data }); owners.set(section.sectionId, list)
    }
  }
  return owners
}
export function writeValidationArtifact(storage: Storage, adtDir: string, entries: Array<{ section_id: string; href: string }>, id?: string): void {
  const owners = activeSectionOwners(storage)
  const sections: ValidationArtifactSnapshot["sections"] = []
  for (const entry of entries) {
    const matches = owners.get(entry.section_id)
    if (matches?.length !== 1 || entries.filter((value) => value.section_id === entry.section_id).length !== 1) continue
    const source = matches[0], rendering = storage.getLatestNodeData("web-rendering", source.pageId)
    const parsed = WebRenderingOutput.safeParse(rendering?.data)
    if (!parsed.success || parsed.data.sections.filter((section) => renderedSectionId(section) === entry.section_id).length !== 1) continue
    const file = artifactFile(adtDir, entry.href)
    if (!file || !fs.lstatSync(file).isFile()) continue
    sections.push({ pageId: source.pageId, sectionId: entry.section_id, href: entry.href,
      sourceVersion: source.version, renderingVersion: rendering!.version,
      sourceHash: inputSignature(source.data), renderingHash: inputSignature(rendering!.data),
      artifactHash: createHash("sha256").update(fs.readFileSync(file)).digest("hex") })
  }
  fs.writeFileSync(path.join(adtDir, FILE), JSON.stringify({ id, sections }))
}

/** Legacy/edited bundles remain inspectable without fabricating evidence. */
export function readValidationArtifact(adtDir: string): ValidationArtifactSnapshot | undefined {
  try {
    const file = path.join(adtDir, FILE)
    if (!fs.lstatSync(file).isFile()) return undefined
    const snapshot = ValidationArtifactSnapshot.parse(JSON.parse(fs.readFileSync(file, "utf8")))
    const sections = snapshot.sections.filter((section) => {
      const file = artifactFile(adtDir, section.href)
      return file && fs.lstatSync(file).isFile() && createHash("sha256").update(fs.readFileSync(file)).digest("hex") === section.artifactHash
    })
    return { ...snapshot, sections }
  } catch { return undefined }
}

/** Review notes also support legacy/custom pages without semantic repair proof. */
export function isValidationArtifactPage(adtDir: string, id: string, href: string): boolean {
  try {
    const inventory = JSON.parse(fs.readFileSync(path.join(adtDir, "content", "pages.json"), "utf8")) as Array<{ href?: string }>
    if (!Array.isArray(inventory) || inventory.filter((entry) => entry.href === href).length !== 1) return false
    const file = artifactFile(adtDir, href)
    return !!file && fs.readFileSync(file, "utf8").includes(`<meta name="adt-validation-artifact" content="${id}">`)
  } catch { return false }
}

/** Hash every tested asset, excluding build bookkeeping written after auditing. */
export function validationArtifactHash(adtDir: string): string {
  return packageFilesHash(adtDir, [".build-hash", ".build-version", ".build-warnings"])
}

import {
  extractTextCatalogEntriesFromHtml,
  normalizeLocale,
  projectImportedHtmlSection,
} from "@adt/pipeline"
import { TextCatalogOutput, type AdtBundleImportPreview } from "@adt/types"

import { readAdtBundle, type ReadAdtBundle } from "./bundle-reader.js"
import { AdtImportError } from "./error.js"

export function pageIdFromSection(sectionId: string, index: number): string | null {
  if (/^(?:qz|quiz)[-_]?\d*/i.test(sectionId)) return null
  const pageMatch = sectionId.match(/^(pg\d+)/i)
  return pageMatch?.[1] ?? `pg${String(index + 1).padStart(3, "0")}`
}

export function recoveredPageCount(
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
): number {
  return new Set(
    pages
      .map((page, index) => pageIdFromSection(page.section_id, index))
      .filter((pageId): pageId is string => pageId !== null),
  ).size
}

export function createRecoveredCatalog(
  sourceTexts: Record<string, string>,
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
  pageHtml: Record<string, string>,
  legacyRecovery = false,
): {
  catalog: TextCatalogOutput
  htmlEntryCount: number
  ignoredHtmlEntryCount: number
  imageCount: number
  captionedImageCount: number
} {
  const recovered = new Map<string, string>()
  const recoveredPageIds = new Set<string>()
  const sourceImageIds = new Set<string>()
  let imageCount = 0
  let captionedImageCount = 0
  pages.forEach((page, index) => {
    const html = pageHtml[page.href]
    if (!html) return
    const pageId = pageIdFromSection(page.section_id, index)
    if (!pageId) return
    recoveredPageIds.add(pageId)
    const projection = projectImportedHtmlSection(
      html,
      page.section_id,
      undefined,
      { repairLegacyIds: legacyRecovery },
    )
    imageCount += projection.images.length
    captionedImageCount += projection.images.filter((image) => (
      Boolean(sourceTexts[image.imageId]) || image.alt.length > 0 || image.decorative
    )).length
    projection.images.forEach((image) => sourceImageIds.add(image.imageId))
    const entries = legacyRecovery
      ? [
          ...projection.nodes.flatMap((node) => (
            node.role !== "image" && node.text
              ? [{ id: node.nodeId, text: node.text }]
              : []
          )),
          ...projection.images.flatMap((image) => (
            image.alt ? [{ id: image.imageId, text: image.alt }] : []
          )),
        ]
      : extractTextCatalogEntriesFromHtml(html, pageId)
    for (const entry of entries) {
      if (recovered.has(entry.id)) {
        throw new AdtImportError(`Duplicate stable text id across ADT pages: ${entry.id} (${page.href})`)
      }
      recovered.set(entry.id, entry.text)
    }
  })

  // Preserve generated feature text (glossary, quizzes, Easy Read) and any
  // legacy catalog ids that cannot be attributed to one page. Page HTML wins
  // whenever the same stable id was edited outside Studio.
  const merged = new Map<string, string>()
  for (const [id, text] of Object.entries(sourceTexts)) {
    const belongsToRecoveredPage = [...recoveredPageIds]
      .some((pageId) => id.startsWith(`${pageId}_`))
    const generatedCompanion = id.endsWith("_easy_read") || id.includes("_ans_")
    if (
      belongsToRecoveredPage
      && !generatedCompanion
      && !sourceImageIds.has(id)
      && !recovered.has(id)
    ) continue
    merged.set(id, text)
  }
  for (const [id, text] of recovered) {
    // Image descriptions in texts.json are the accessible source of truth.
    // Exported HTML may intentionally carry a shorter visual fallback alt.
    if (sourceImageIds.has(id) && sourceTexts[id] !== undefined) continue
    merged.set(id, text)
  }

  return {
    catalog: TextCatalogOutput.parse({
      entries: [...merged].map(([id, text]) => ({ id, text })),
      generatedAt: new Date().toISOString(),
    }),
    htmlEntryCount: recovered.size,
    ignoredHtmlEntryCount: 0,
    imageCount,
    captionedImageCount,
  }
}

function recoveredCatalogChanged(
  catalog: TextCatalogOutput,
  sourceTexts: Record<string, string>,
): boolean {
  if (catalog.entries.length !== Object.keys(sourceTexts).length) return true
  return catalog.entries.some((entry) => sourceTexts[entry.id] !== entry.text)
}

export function hasSourceChanges(
  bundle: ReturnType<typeof readAdtBundle>,
  catalog: TextCatalogOutput,
  sourceTexts: Record<string, string>,
): boolean {
  return recoveredCatalogChanged(catalog, sourceTexts)
    || bundle.ignoredEdits.sourceTextsChanged
    || bundle.ignoredEdits.pageHtmlChanged.length > 0
    || bundle.ignoredEdits.pageHtmlMissing.length > 0
}

export function compareWithExportBaseline(
  bundle: ReturnType<typeof readAdtBundle>,
): AdtBundleImportPreview["exportComparisonStatus"] {
  const frozen = bundle.manifest.frozen
  const baselinePageHrefs = Object.keys(frozen?.pageHtmlFingerprints ?? {})
  const currentPageHrefs = [...new Set(bundle.pages.map((page) => page.href))]
  const pageSetChanged = baselinePageHrefs.length > 0 && (
    baselinePageHrefs.some((href) => !currentPageHrefs.includes(href))
    || currentPageHrefs.some((href) => !baselinePageHrefs.includes(href))
  )
  const verifiedMismatch = bundle.ignoredEdits.sourceTextsChanged
    || bundle.ignoredEdits.pageHtmlChanged.length > 0
    || bundle.ignoredEdits.pageHtmlMissing.length > 0
    || pageSetChanged

  if (verifiedMismatch) return "changed"

  const completeBaseline = Boolean(frozen?.sourceTextsFingerprint)
    && baselinePageHrefs.length > 0
    && currentPageHrefs.every((href) => baselinePageHrefs.includes(href))
    && baselinePageHrefs.every((href) => currentPageHrefs.includes(href))
  return completeBaseline ? "unchanged" : "unavailable"
}

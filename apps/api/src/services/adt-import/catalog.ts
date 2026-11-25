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

type RecoveredPage = { section_id: string; href: string; page_number?: number }

/** The catalog entries one page contributes, and the image ids on it. */
function recoveredPageEntries(
  page: RecoveredPage,
  index: number,
  html: string | undefined,
  legacyRecovery: boolean,
): {
  pageId: string
  entries: Array<{ id: string; text: string }>
  images: ReturnType<typeof projectImportedHtmlSection>["images"]
  imageIds: Set<string>
} | null {
  if (!html) return null
  const pageId = pageIdFromSection(page.section_id, index)
  if (!pageId) return null
  const projection = projectImportedHtmlSection(
    html,
    page.section_id,
    undefined,
    { repairLegacyIds: legacyRecovery },
  )
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
  return {
    pageId,
    entries,
    images: projection.images,
    imageIds: new Set(projection.images.map((image) => image.imageId)),
  }
}

/**
 * The exporter writes the same <img data-id alt> into every section an image
 * appears in; one id with one text is one entry, not a conflict. Any other id
 * on two pages is.
 */
function isAcceptedRepeat(earlier: string, text: string, id: string, imageIds: Set<string>): boolean {
  return earlier === text && imageIds.has(id)
}

/**
 * Every stable id that more than one page carries, with the pages in reading
 * order. The catalog keeps one entry per id, so each of these would silently
 * lose a copy's text; the import review lists them all at once (#1153).
 */
export function findCrossPageDuplicateIds(
  pages: RecoveredPage[],
  pageHtml: Record<string, string>,
  legacyRecovery = false,
): Array<{ id: string; hrefs: string[] }> {
  const seen = new Map<string, { text: string; hrefs: string[]; duplicate: boolean }>()
  pages.forEach((page, index) => {
    const recovered = recoveredPageEntries(page, index, pageHtml[page.href], legacyRecovery)
    if (!recovered) return
    for (const entry of recovered.entries) {
      const earlier = seen.get(entry.id)
      if (!earlier) {
        seen.set(entry.id, { text: entry.text, hrefs: [page.href], duplicate: false })
        continue
      }
      if (isAcceptedRepeat(earlier.text, entry.text, entry.id, recovered.imageIds)) continue
      if (!earlier.hrefs.includes(page.href)) earlier.hrefs.push(page.href)
      earlier.duplicate = true
    }
  })
  return [...seen]
    .filter(([, value]) => value.duplicate)
    .map(([id, value]) => ({ id, hrefs: value.hrefs }))
}

export function createRecoveredCatalog(
  sourceTexts: Record<string, string>,
  pages: RecoveredPage[],
  pageHtml: Record<string, string>,
  legacyRecovery = false,
  options: {
    /** "throw" (default) refuses a repeated id. "keep-first" keeps the first
     * copy; only for the import preview, whose compatibility report lists the
     * repeats (see findCrossPageDuplicateIds) and blocks the import. */
    onDuplicate?: "throw" | "keep-first"
  } = {},
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
    const pageEntries = recoveredPageEntries(page, index, pageHtml[page.href], legacyRecovery)
    if (!pageEntries) return
    const { pageId, entries, images, imageIds } = pageEntries
    recoveredPageIds.add(pageId)
    imageCount += images.length
    captionedImageCount += images.filter((image) => (
      Boolean(sourceTexts[image.imageId]) || image.alt.length > 0 || image.decorative
    )).length
    images.forEach((image) => sourceImageIds.add(image.imageId))
    for (const entry of entries) {
      const earlier = recovered.get(entry.id)
      if (earlier === undefined) {
        recovered.set(entry.id, entry.text)
        continue
      }
      if (isAcceptedRepeat(earlier, entry.text, entry.id, imageIds)) continue
      if (options.onDuplicate === "keep-first") continue
      throw new AdtImportError(`Duplicate stable text id across ADT pages: ${entry.id} (${page.href})`)
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

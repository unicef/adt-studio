import {
  extractTextCatalogEntriesFromHtml,
  projectImportedFixedLayoutPage,
  projectImportedHtmlSection,
  type ImportedFixedLayoutProjection,
} from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import {
  AdtActivityImportDecision,
  ImageCaptioningOutput,
  type AdtImportedActivityReview,
} from "@adt/types"

import { readAdtBundle } from "../adt-bundle-reader.js"
import { pageIdFromSection } from "../adt-import-catalog.js"
import { FIXED_LAYOUT_SECTION_TYPE } from "../adt-import-fixed-layout.js"

/**
 * Project the exported HTML into the storyboard entities the normal pipeline
 * writes. Returns how the book was projected so the caller can write a matching
 * `config.yaml` — an imported fixed-layout book has to be recognized by
 * `isFixedLayoutBook()` for packaging and re-export to keep its geometry.
 */
export function seedImportedStoryboard(
  label: string,
  booksDir: string,
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
  pageHtml: Record<string, string>,
  toc: Array<{ section_id: string; title: string; chapter_id: string }>,
  legacyRecovery = false,
  sourceTexts: Record<string, string> = {},
  activityOverrides: ReadonlyMap<string, string> = new Map(),
  activityReview?: AdtImportedActivityReview,
  activityDecisions: readonly AdtActivityImportDecision[] = [],
): { fixedLayoutPageCount: number } {
  const imageUrlPrefix = `/api/books/${encodeURIComponent(label)}/images`
  const grouped = new Map<string, Array<{
    sectionId: string
    href: string
    projection: ReturnType<typeof projectImportedHtmlSection>
    fixedLayout: ReturnType<typeof projectImportedFixedLayoutPage>
  }>>()
  pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    if (!pageId) return
    const entries = grouped.get(pageId) ?? []
    const html = pageHtml[page.href] ?? ""
    entries.push({
      sectionId: page.section_id,
      href: page.href,
      projection: projectImportedHtmlSection(
        html,
        page.section_id,
        imageUrlPrefix,
        {
          repairLegacyIds: legacyRecovery,
          ...(activityOverrides.has(page.section_id)
            ? { sectionTypeOverride: activityOverrides.get(page.section_id) }
            : {}),
        },
      ),
      // A user-classified activity is a reflowable section by definition, so an
      // explicit decision always wins over layout sniffing.
      fixedLayout: activityOverrides.has(page.section_id)
        ? null
        : projectImportedFixedLayoutPage(html, imageUrlPrefix),
    })
    grouped.set(pageId, entries)
  })

  let fixedLayoutPageCount = 0
  const storage = createBookStorage(label, booksDir)
  try {
    let pageNumber = 0
    let recoveredCaptions = 0
    let importedImages = 0
    for (const [pageId, entries] of grouped) {
      pageNumber++
      storage.putNodeData("page-sectioning", pageId, {
        reasoning: "Recovered from the exported ADT HTML storyboard.",
        sections: entries.map((entry) => {
          const nodes = [...entry.projection.nodes]
          const tocEntry = toc.find((candidate) => candidate.section_id === entry.sectionId)
          if (tocEntry && !nodes.some((node) => node.role === "heading")) {
            nodes.unshift({
              nodeId: tocEntry.chapter_id,
              role: "heading",
              text: tocEntry.title,
              isPruned: false,
            })
          }
          return {
            sectionId: entry.sectionId,
            sectionType: entry.projection.sectionType,
            backgroundColor: "#ffffff",
            textColor: "#111827",
            pageNumber,
            isPruned: false,
            nodes,
          }
        }),
      })
      // A fixed-layout page renders from its `#content` box, not from a
      // reflowable section: unwrapping it would drop the page's pixel viewport,
      // its reference width and the positioning context every absolutely-placed
      // child depends on. Seed the positioned tree under its own node — never
      // over `page-sectioning`, which keeps the semantic tree above — so the
      // render-sectioning resolver hands downstream features and re-export the
      // tree that matches the rendered HTML.
      const fixedLayoutSections = entries.map((entry) => (
        entry.fixedLayout ? { sectionId: entry.sectionId, ...entry.fixedLayout } : null
      ))
      const positioned = fixedLayoutSections.every((section) => section !== null)
        ? fixedLayoutSections as Array<{ sectionId: string } & ImportedFixedLayoutProjection>
        : null
      if (positioned) {
        fixedLayoutPageCount++
        storage.putNodeData("fixed-layout-sectioning", pageId, {
          reasoning: "Recovered from the exported ADT fixed-layout HTML: nodes are in the exported draw order, so DOM order preserves z-stacking.",
          sections: positioned.map((section) => ({
            sectionId: section.sectionId,
            sectionType: FIXED_LAYOUT_SECTION_TYPE,
            backgroundColor: "#ffffff",
            textColor: "#000000",
            pageNumber,
            isPruned: false,
            nodes: section.nodes,
            placement: section.placement,
            viewport: section.viewport,
          })),
        })
      }
      storage.putNodeData("web-rendering", pageId, {
        sections: positioned
          ? positioned.map((section, sectionIndex) => ({
              sectionIndex,
              sectionType: FIXED_LAYOUT_SECTION_TYPE,
              reasoning: "Imported fixed-layout HTML is the canonical storyboard source.",
              html: section.html,
            }))
          : entries.map((entry, sectionIndex) => ({
              sectionIndex,
              sectionType: entry.projection.sectionType,
              reasoning: "Imported HTML is the canonical storyboard source.",
              html: entry.projection.html,
            })),
      })
      const captions = entries.flatMap((entry) => entry.projection.images)
        .filter((image) => Boolean(sourceTexts[image.imageId]) || image.alt.length > 0 || image.decorative)
        .map((image) => ({
          imageId: image.imageId,
          reasoning: "Recovered from the exported ADT HTML.",
          caption: image.decorative ? "" : (sourceTexts[image.imageId] ?? image.alt),
          ...(image.decorative ? { decorative: true as const } : {}),
          source: "manual" as const,
        }))
      importedImages += entries.reduce((total, entry) => total + entry.projection.images.length, 0)
      if (captions.length > 0) {
        storage.putNodeData("image-captioning", pageId, ImageCaptioningOutput.parse({ captions }))
        recoveredCaptions += captions.length
      }
    }
    storage.markStepCompleted("page-sectioning", "Recovered from exported ADT HTML")
    storage.markStepCompleted("web-rendering", "Recovered from exported ADT HTML")
    if (importedImages > 0 && recoveredCaptions === importedImages) {
      storage.markStepCompleted("image-captioning", "Recovered from exported ADT HTML")
    }
    if (activityReview) {
      storage.putNodeData("imported-activity-review", "book", {
        version: 1,
        reviewedAt: new Date().toISOString(),
        items: activityReview.items,
        decisions: activityDecisions,
      })
    }
  } finally {
    storage.close()
  }
  return { fixedLayoutPageCount }
}


/**
 * The archive's own `assets/config.json` is the publication's declared
 * presentation, while the seeded projection is what we could actually recover
 * from its pages. When a book declares fixed layout and no page projected that
 * way, the import silently degraded to reflowable — the exact failure this path
 * exists to prevent — so say so instead of shipping a broken storyboard quietly.
 */
export function warnOnUndetectedFixedLayout(
  bundle: ReturnType<typeof readAdtBundle>,
  fixedLayoutPageCount: number,
): void {
  if (!bundle.presentation.fixedLayout || fixedLayoutPageCount > 0) return
  console.warn(
    "[adt-import] The archive declares fixedLayout but none of its pages carry a "
    + "positioned #content box. The storyboard was imported as reflowable and its "
    + "original page geometry could not be recovered.",
  )
}



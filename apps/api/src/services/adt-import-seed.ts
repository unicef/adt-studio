import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import yaml from "js-yaml"
import {
  extractTextCatalogEntriesFromHtml,
  generateOfflinePreloader,
  normalizeLocale,
  projectImportedFixedLayoutPage,
  projectImportedHtmlSection,
  restoreImportedCustomActivityScripts,
  type ImportedFixedLayoutProjection,
} from "@adt/pipeline"
import { createBookStorage, openBookDb } from "@adt/storage"
import {
  AdtActivityImportDecision,
  BookMetadata,
  EasyReadOutput,
  GlossaryOutput,
  ImageCaptioningOutput,
  ImageClassificationOutput,
  TTSOutput,
  TextCatalogOutput,
  QuizGenerationOutput,
  TocGenerationOutput,
  WordTimestampOutput,
  type AdtImportedActivityReview,
} from "@adt/types"

import { readAdtBundle, type ReadAdtBundle } from "./adt-bundle-reader.js"
import {
  analyzeImportedActivities,
  resolveImportedActivityDecisions,
} from "./adt-activity-reconciliation.js"
import {
  createRecoveredCatalog,
  hasSourceChanges,
  pageIdFromSection,
  recoveredPageCount,
} from "./adt-import-catalog.js"
import { AdtImportError } from "./adt-import-error.js"
import { FIXED_LAYOUT_CONFIG, FIXED_LAYOUT_SECTION_TYPE } from "./adt-import-fixed-layout.js"
import { ADT_IMPORT_IN_PROGRESS_MARKER } from "./adt-import-marker.js"
import { recoverImportedQuizzes } from "./adt-import-quiz.js"

export interface ImportedAdtSeedResult {
  label: string
  title: string
  sourceFileName: string | null
  createdAt: string
  coverBase64: string | null
  sourceLanguage: string
  outputLanguages: string[]
  runtimeFeatures: Record<string, boolean>
  pageCount: number
  catalogEntryCount: number
  glossaryEntryCount: number
  tocEntryCount: number
  translationLanguageCount: number
  recoveredHtmlEntryCount: number
  ignoredHtmlEntryCount: number
  contentChanged: boolean
}



interface AdtImportInProgressMarker {
  version: 1
  createdAt: string
  sourceLabel: string
  sourceFileName: string | null
}


export function seedPages(
  dbPath: string,
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
  pageHtml: Record<string, string>,
  legacyRecovery = false,
): void {
  const grouped = new Map<string, { texts: string[] }>()
  pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    if (!pageId) return
    const group = grouped.get(pageId) ?? { texts: [] }
    const html = pageHtml[page.href] ?? ""
    group.texts.push(...(legacyRecovery
      ? projectImportedHtmlSection(
          html,
          page.section_id,
          undefined,
          { repairLegacyIds: true },
        ).nodes.flatMap((node) => node.role !== "image" && node.text ? [node.text] : [])
      : extractTextCatalogEntriesFromHtml(html, pageId).map((entry) => entry.text)))
    grouped.set(pageId, group)
  })

  const db = openBookDb(dbPath)
  try {
    let pageNumber = 0
    for (const [pageId, group] of grouped) {
      pageNumber++
      db.run(
        `INSERT INTO pages (page_id, page_number, text)
         VALUES (?, ?, ?)
         ON CONFLICT (page_id) DO UPDATE SET
           page_number = excluded.page_number,
           text = excluded.text`,
        [pageId, pageNumber, group.texts.join("\n")],
      )
    }
  } finally {
    db.close()
  }
}

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


export function seedImportedFeatures(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  generatedAt: string,
): void {
  const storage = createBookStorage(label, booksDir)
  try {
    if (bundle.toc.length > 0) {
      storage.putNodeData("toc-generation", "book", TocGenerationOutput.parse({
        entries: bundle.toc.map((entry, index) => ({
          id: `toc_${String(index + 1).padStart(3, "0")}`,
          title: entry.title,
          sectionId: entry.section_id,
          href: entry.href,
          chapterId: entry.chapter_id,
          level: entry.level ?? 1,
        })),
        pageCount: bundle.pages.filter((page, index) => (
          pageIdFromSection(page.section_id, index) !== null
        )).length,
        generatedAt,
      }))
      storage.markStepCompleted("toc-generation", "Recovered from exported ADT data")
    }

    const sourceGlossary = bundle.glossaries[bundle.manifest.languages.source]
      ?? bundle.glossaries[normalizeLocale(bundle.manifest.languages.source)]
    if (sourceGlossary && Object.keys(sourceGlossary).length > 0) {
      storage.putNodeData("glossary", "book", GlossaryOutput.parse({
        items: Object.values(sourceGlossary).map((entry) => ({
          id: entry.id,
          source: "manual" as const,
          word: entry.word,
          definition: entry.definition,
          variations: entry.variations,
          emojis: entry.emoji ? [entry.emoji] : [],
        })),
        pageCount: bundle.pages.filter((page, index) => (
          pageIdFromSection(page.section_id, index) !== null
        )).length,
        generatedAt,
      }))
      storage.markStepCompleted("glossary", "Recovered from exported ADT data")
    }

    const sourceTexts = bundle.texts[bundle.manifest.languages.source] ?? {}
    const { quizzes, declaredCount } = recoverImportedQuizzes(bundle, sourceTexts)
    // Seed only what is missing. A re-projection (see
    // `ensureImportedAdtProjectProjection`) must not replace quizzes the user
    // has edited in Studio since the import.
    if (quizzes.length > 0 && !storage.getLatestNodeData("quiz-generation", "book")) {
      storage.putNodeData("quiz-generation", "book", QuizGenerationOutput.parse({
        generatedAt,
        language: normalizeLocale(bundle.manifest.languages.source),
        pagesPerQuiz: Math.max(...quizzes.map((quiz) => quiz.pageIds.length)),
        quizzes,
      }))
      // Only claim the step is done when every quiz in the archive came back.
      // A partial recovery still needs the user to regenerate the rest.
      if (quizzes.length === declaredCount) {
        storage.markStepCompleted("quiz-generation", "Recovered from exported ADT data")
      }
    }
  } finally {
    storage.close()
  }
}

function seedImportedSpeech(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  files: Record<string, Uint8Array>,
  sourceContentChanged: boolean,
  generatedAt: string,
): void {
  if (sourceContentChanged) return
  const bookDir = path.join(path.resolve(booksDir), label)
  const storage = createBookStorage(label, booksDir)
  let recoveredSpeech = false
  let recoveredTimestamps = false
  try {
    for (const archiveLanguage of bundle.manifest.languages.output) {
      const language = normalizeLocale(archiveLanguage)
      const audioMapPath = `${bundle.root}content/i18n/${archiveLanguage}/audios.json`
      const audioMapBytes = files[audioMapPath]
      if (!audioMapBytes) continue
      let audioMap: Record<string, unknown>
      try {
        const parsed = JSON.parse(new TextDecoder().decode(audioMapBytes)) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue
        audioMap = parsed as Record<string, unknown>
      } catch {
        continue
      }

      const audioDir = path.join(bookDir, "audio", language)
      const entries: TTSOutput["entries"] = []
      for (const [textId, fileValue] of Object.entries(audioMap)) {
        if (typeof fileValue !== "string" || path.basename(fileValue) !== fileValue) continue
        const extension = path.extname(fileValue).toLowerCase()
        if (![".mp3", ".wav", ".ogg", ".flac"].includes(extension)) continue
        const bytes = files[`${bundle.root}content/i18n/${archiveLanguage}/audio/${fileValue}`]
        if (!bytes) continue
        fs.mkdirSync(audioDir, { recursive: true })
        fs.writeFileSync(path.join(audioDir, fileValue), bytes)
        entries.push({
          textId,
          language,
          fileName: fileValue,
          voice: "imported",
          model: "imported-adt",
          cached: false,
          provider: "imported",
        })
      }
      if (entries.length === 0) continue
      storage.putNodeData("tts", language, TTSOutput.parse({ entries, generatedAt }))
      recoveredSpeech = true

      const timecodePath = `${bundle.root}content/i18n/${archiveLanguage}/timecode/timecode_output.json`
      const timecodeBytes = files[timecodePath]
      if (!timecodeBytes) continue
      try {
        const runtime = JSON.parse(new TextDecoder().decode(timecodeBytes)) as Record<string, {
          timecodes?: [unknown, { word_timestamps?: Array<{ text?: unknown; start?: unknown; end?: unknown }> }]
        }>
        const timestampEntries: WordTimestampOutput["entries"] = {}
        for (const [textId, value] of Object.entries(runtime)) {
          const words = value?.timecodes?.[1]?.word_timestamps
            ?.filter((word) => typeof word.text === "string"
              && typeof word.start === "number"
              && typeof word.end === "number")
            .map((word) => ({ word: word.text as string, start: word.start as number, end: word.end as number }))
            ?? []
          if (words.length === 0) continue
          timestampEntries[textId] = {
            textId,
            language,
            words,
            duration: Math.max(...words.map((word) => word.end)),
          }
        }
        if (Object.keys(timestampEntries).length > 0) {
          storage.putNodeData("tts-timestamps", language, WordTimestampOutput.parse({
            entries: timestampEntries,
            generatedAt,
          }))
          recoveredTimestamps = true
        }
      } catch {
        // Invalid optional timestamps do not discard otherwise valid audio.
      }
    }
    if (recoveredSpeech) storage.markStepCompleted("tts", "Recovered from exported ADT audio")
    if (recoveredTimestamps) {
      storage.markStepCompleted("word-timestamps", "Recovered from exported ADT timecodes")
    }
  } finally {
    storage.close()
  }
}

function importedImageDimensions(bytes: Uint8Array, extension: string): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (extension === "png" && bytes.byteLength >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if ((extension === "jpg" || extension === "jpeg") && bytes.byteLength >= 4) {
    let offset = 2
    while (offset + 9 < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (length < 2) break
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) }
      }
      offset += length + 2
    }
  }
  if (extension === "webp" && bytes.byteLength >= 30) {
    const chunk = new TextDecoder("ascii").decode(bytes.subarray(12, 16))
    if (chunk === "VP8X") {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
      return { width, height }
    }
  }
  if (extension === "svg") {
    const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.byteLength, 4096)))
    const viewBox = text.match(/viewBox=["'][^"']*?([\d.]+)[ ,]+([\d.]+)["']/i)
    if (viewBox) return { width: Math.max(1, Math.round(Number(viewBox[1]))), height: Math.max(1, Math.round(Number(viewBox[2]))) }
  }
  return { width: 1024, height: 1024 }
}

function resolveImportedImage(
  files: Record<string, Uint8Array>,
  root: string,
  href: string,
  imageId: string,
  src: string,
): { archivePath: string; bytes: Uint8Array; extension: string } | null {
  const supported = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"])
  const candidates: string[] = []
  for (const extension of supported) candidates.push(`${root}images/${imageId}.${extension}`)
  if (src && !/^(?:data:|https?:|\/)/i.test(src)) {
    let decoded = src.split(/[?#]/, 1)[0]
    try { decoded = decodeURIComponent(decoded) } catch { /* keep the encoded form */ }
    const relative = path.posix.normalize(path.posix.join(path.posix.dirname(href), decoded))
    if (relative && relative !== ".." && !relative.startsWith("../")) {
      candidates.push(`${root}${relative}`)
    }
  }
  candidates.push(...Object.keys(files).filter((archivePath) => {
    if (!archivePath.startsWith(root)) return false
    const basename = path.posix.basename(archivePath)
    return basename.slice(0, basename.lastIndexOf(".")) === imageId
  }))

  for (const archivePath of candidates) {
    const bytes = files[archivePath]
    if (!bytes) continue
    const extension = path.posix.extname(archivePath).slice(1).toLowerCase()
    if (supported.has(extension)) return { archivePath, bytes, extension }
  }
  return null
}

export function seedImportedImages(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  files: Record<string, Uint8Array>,
): void {
  const bookDir = path.join(path.resolve(booksDir), label)
  const imagesDir = path.join(bookDir, "images")
  fs.mkdirSync(imagesDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  const firstImageByPage = new Map<string, { bytes: Uint8Array; extension: string }>()
  const imageIdsByPage = new Map<string, string[]>()
  try {
    bundle.pages.forEach((page, index) => {
      const pageId = pageIdFromSection(page.section_id, index)
      if (!pageId) return
      const projection = projectImportedHtmlSection(
        bundle.pageHtml[page.href] ?? "",
        page.section_id,
        undefined,
        { repairLegacyIds: bundle.sourceFormat === "legacy-studio-export" },
      )
      for (const image of projection.images) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(image.imageId)) continue
        const resolved = resolveImportedImage(
          files,
          bundle.root,
          page.href,
          image.imageId,
          image.src,
        )
        if (!resolved) continue
        const hash = createHash("sha256").update(resolved.bytes).digest("hex")
        const filename = `${image.imageId}.${resolved.extension}`
        fs.writeFileSync(path.join(imagesDir, filename), resolved.bytes)
        const dimensions = importedImageDimensions(resolved.bytes, resolved.extension)
        db.run(
          `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (image_id) DO UPDATE SET
             page_id = excluded.page_id,
             path = excluded.path,
             hash = excluded.hash,
             width = excluded.width,
             height = excluded.height,
             source = excluded.source`,
          [image.imageId, pageId, `images/${filename}`, hash, dimensions.width, dimensions.height, "extract"],
        )
        imageIdsByPage.set(pageId, [...(imageIdsByPage.get(pageId) ?? []), image.imageId])
        if (!firstImageByPage.has(pageId)) {
          firstImageByPage.set(pageId, { bytes: resolved.bytes, extension: resolved.extension })
        }
      }
    })

    const logicalPages = bundle.pages
      .map((page, index) => pageIdFromSection(page.section_id, index))
      .filter((pageId): pageId is string => pageId !== null)
    const firstPageId = logicalPages[0]
    if (firstPageId && bundle.cover) {
      const extension = bundle.cover.mimeType === "image/png"
        ? "png"
        : bundle.cover.mimeType === "image/webp" ? "webp" : "jpg"
      firstImageByPage.set(firstPageId, { bytes: bundle.cover.bytes, extension })
    }
    for (const [pageId, image] of firstImageByPage) {
      const hash = createHash("sha256").update(image.bytes).digest("hex")
      const filename = `${pageId}_page.${image.extension}`
      fs.writeFileSync(path.join(imagesDir, filename), image.bytes)
      const dimensions = importedImageDimensions(image.bytes, image.extension)
      db.run(
        `INSERT INTO images (image_id, page_id, path, hash, width, height, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (image_id) DO UPDATE SET
           page_id = excluded.page_id,
           path = excluded.path,
           hash = excluded.hash,
           width = excluded.width,
           height = excluded.height,
           source = excluded.source`,
        [`${pageId}_page`, pageId, `images/${filename}`, hash, dimensions.width, dimensions.height, "extract"],
      )
    }
  } finally {
    db.close()
  }

  // Every consumer that asks "which images does this page have?" — the page
  // summary's `imageCount`, and with it the Captions gallery — reads the
  // `image-filtering` classification, not the images table. Without one an
  // imported book reports zero images everywhere and Captions renders "No
  // images in this book" even though the captions themselves were recovered.
  // Nothing here can justify pruning: the imported HTML already draws these
  // images, so they are all in use. The synthetic `_page` render is the one
  // exception, pruned exactly as the native pipeline prunes it.
  const storage = createBookStorage(label, booksDir)
  try {
    for (const [pageId, imageIds] of imageIdsByPage) {
      // Only when the page has no classification yet: on a re-projection the
      // existing one carries the user's own pruning decisions.
      if (storage.getLatestNodeData("image-filtering", pageId)) continue
      storage.putNodeData("image-filtering", pageId, ImageClassificationOutput.parse({
        images: [
          ...imageIds.map((imageId) => ({
            imageId,
            isPruned: false,
            reason: "Recovered from the exported ADT HTML, which already draws this image.",
          })),
          {
            imageId: `${pageId}_page`,
            isPruned: true,
            reason: "Whole-page render: keeping it would draw the page twice.",
          },
        ],
      }))
    }
    if (imageIdsByPage.size > 0) {
      storage.markStepCompleted("image-filtering", "Recovered from exported ADT HTML")
    }
  } finally {
    storage.close()
  }
}

/**
 * Project an exported ADT bundle into `label` as a normal pipeline project.
 *
 * The caller resolves the final label first and owns cleanup: an in-progress
 * marker keeps the half-written directory out of `listBooks`, and the caller
 * removes the directory if any later import step fails. Both the parsed bundle
 * and the expanded archive are passed in so one import never re-reads the ZIP.
 */
export function seedImportedAdtProject(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  options: {
    sourceFileName?: string
    activityDecisions?: readonly AdtActivityImportDecision[]
  } = {},
): ImportedAdtSeedResult {
  const activityDecisions = options.activityDecisions ?? []
  if (bundle.pages.length === 0 || Object.keys(bundle.pageHtml).length === 0) {
    throw new AdtImportError("The ADT bundle does not contain recoverable book pages")
  }
  if (!files[`${bundle.root}index.html`]) {
    throw new AdtImportError("ADT bundle is missing its book entry page")
  }
  const activityReview = analyzeImportedActivities(bundle)
  const activityOverrides = resolveImportedActivityDecisions(activityReview, activityDecisions)

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtImportError("The ADT bundle does not contain its source text catalog")
  }
  const { catalog, htmlEntryCount, ignoredHtmlEntryCount } = createRecoveredCatalog(
    sourceTexts,
    bundle.pages,
    bundle.pageHtml,
    bundle.sourceFormat === "legacy-studio-export",
  )
  const outputLanguages = [...new Set(
    bundle.manifest.languages.output
      .map((language) => normalizeLocale(language))
      .filter((language) => language !== sourceLanguage),
  )]
  const sourceContentChanged = hasSourceChanges(bundle, catalog, sourceTexts)

  const bookDir = path.join(path.resolve(booksDir), label)
  const createdAt = new Date().toISOString()

  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(path.join(bookDir, ADT_IMPORT_IN_PROGRESS_MARKER), JSON.stringify({
    version: 1,
    createdAt,
    sourceLabel: bundle.manifest.book.label,
    sourceFileName: options.sourceFileName ?? null,
  } satisfies AdtImportInProgressMarker, null, 2))

  const storage = createBookStorage(label, booksDir)
  try {
    const metadata = BookMetadata.parse({
      title: bundle.title,
      authors: [],
      publisher: null,
      language_code: sourceLanguage,
      cover_page_number: null,
      reasoning: "Imported from an exported ADT bundle using its HTML as the source.",
    })
    storage.putNodeData("metadata", "book", metadata)
    storage.putNodeData("text-catalog", "book", catalog)
    const catalogIds = new Set(catalog.entries.map((entry) => entry.id))
    for (const language of outputLanguages) {
      const texts = bundle.texts[language] ?? bundle.texts[language.replace("-", "_")]
      if (!texts) continue
      storage.putNodeData("text-catalog-translation", language, TextCatalogOutput.parse({
        entries: Object.entries(texts)
          .filter(([id]) => catalogIds.has(id))
          .map(([id, text]) => ({ id, text })),
        generatedAt: createdAt,
      }))
    }
    storage.markStepCompleted("text-catalog", "Imported from exported ADT HTML")
    storage.markStepCompleted("catalog-translation", "Recovered from ADT language catalogs")
    storage.markStepSkipped("image-translation")
  } finally {
    storage.close()
  }

  const legacyRecovery = bundle.sourceFormat === "legacy-studio-export"
  seedPages(path.join(bookDir, `${label}.db`), bundle.pages, bundle.pageHtml, legacyRecovery)
  const storyboard = seedImportedStoryboard(
    label,
    booksDir,
    bundle.pages,
    bundle.pageHtml,
    bundle.toc,
    legacyRecovery,
    sourceTexts,
    activityOverrides,
    activityReview,
    activityDecisions,
  )
  seedImportedFeatures(label, booksDir, bundle, createdAt)
  seedImportedImages(label, booksDir, bundle, files)
  seedImportedSpeech(label, booksDir, bundle, files, sourceContentChanged, createdAt)
  warnOnUndetectedFixedLayout(bundle, storyboard.fixedLayoutPageCount)
  fs.writeFileSync(path.join(bookDir, "config.yaml"), yaml.dump({
    editing_language: sourceLanguage,
    // The existing Speech UI treats this as the selectable narration list;
    // normal books always include their source language here as well.
    output_languages: [sourceLanguage, ...outputLanguages],
    ...(storyboard.fixedLayoutPageCount > 0 ? FIXED_LAYOUT_CONFIG : {}),
  }))

  return {
    label,
    title: bundle.title,
    sourceFileName: options.sourceFileName ?? null,
    createdAt,
    coverBase64: bundle.cover
      ? `data:${bundle.cover.mimeType};base64,${Buffer.from(bundle.cover.bytes).toString("base64")}`
      : null,
    sourceLanguage,
    outputLanguages,
    runtimeFeatures: bundle.runtimeFeatures,
    pageCount: recoveredPageCount(bundle.pages),
    catalogEntryCount: catalog.entries.length,
    glossaryEntryCount: Object.keys(bundle.glossaries[bundle.manifest.languages.source] ?? {}).length,
    tocEntryCount: bundle.toc.length,
    translationLanguageCount: outputLanguages.filter((language) => (
      bundle.texts[language] || bundle.texts[language.replace("-", "_")]
    )).length,
    recoveredHtmlEntryCount: htmlEntryCount,
    ignoredHtmlEntryCount,
    contentChanged: sourceContentChanged,
  }
}


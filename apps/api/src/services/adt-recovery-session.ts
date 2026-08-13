import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import { zipSync } from "fflate"
import yaml from "js-yaml"
import {
  ADT_EDITING_ALLOWED_ROOT_ENTRIES,
  buildRuntimeTimecodeMap,
  extractImportedHtmlPresentationAssets,
  extractTextCatalogEntriesFromHtml,
  inspectImportedHtmlContract,
  getWordTimestamps,
  generateOfflinePreloader,
  normalizeLocale,
  projectImportedHtmlSection,
  restoreImportedCustomActivityScripts,
} from "@adt/pipeline"
import { createBookStorage, openBookDb } from "@adt/storage"
import {
  ADT_EDITING_CONTRACT_VERSION,
  ADT_EDITING_CONTRACT_MIN_VERSION,
  type AdtActivityImportDecision,
  BookMetadata,
  AdtRoundTripManifest,
  EasyReadOutput,
  GlossaryOutput,
  ImageCaptioningOutput,
  SpeechConfig,
  TTSOutput,
  TextCatalogOutput,
  TocGenerationOutput,
  WordTimestampOutput,
  isTtsExcluded,
  parseBookLabel,
} from "@adt/types"

import {
  AdtBundleEditorError,
  extractAdtBundleArchiveFiles,
  refreshOfflinePreloader,
} from "./adt-bundle-editor.js"
import {
  ADT_BUNDLE_READER_LIMITS,
  AdtBundleReadError,
  readAdtBundle,
} from "./adt-bundle-reader.js"
import {
  createAdtImportRepairGuide,
  type AdtAgentGuideReview,
} from "./adt-import-repair-guide.js"
import { ADT_RECOVERY_MARKER } from "./adt-recovery-marker.js"
import { ensureProjectIdentity } from "./project-identity.js"
import { ARCHIVE_SAFETY_LIMITS } from "./archive-safety.js"
import {
  analyzeImportedActivities,
  resolveImportedActivityDecisions,
  type AdtImportedActivityReview,
} from "./adt-activity-reconciliation.js"

export { ADT_RECOVERY_MARKER } from "./adt-recovery-marker.js"

export const ADT_IMPORT_PROJECTION_VERSION = 3

export interface AdtRecoverySession {
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
  previewPath: string
}

export interface AdtRecoveryImportPreview {
  isAdtBundle: true
  legacyRecovery: boolean
  label: string
  title: string
  coverBase64: string | null
  sourceLanguage: string
  outputLanguages: string[]
  runtimeFeatures: Record<string, boolean>
  pageCount: number
  imageCount: number
  captionedImageCount: number
  glossaryEntryCount: number
  tocEntryCount: number
  translationLanguageCount: number
  contentChanged: boolean
  exportComparisonStatus: "unchanged" | "changed" | "unavailable"
  activityReview: AdtImportedActivityReview
  compatibility: AdtImportCompatibility
  agentGuide: AdtAgentGuideReview
}

export type AdtImportCompatibilityIssueCode =
  | "missing-editing-contract"
  | "unsupported-editing-contract"
  | "nested-page"
  | "unexpected-bundle-entry"
  | "changed-page-structure"
  | "missing-content-root"
  | "multiple-content-roots"
  | "missing-section"
  | "multiple-sections"
  | "missing-section-type"
  | "missing-data-id"
  | "duplicate-data-id"
  | "image-missing-data-id"
  | "remote-asset"
  | "unsafe-asset"
  | "unsupported-stylesheet"
  | "unsupported-script"
  | "unsupported-asset-location"
  | "missing-asset"

export interface AdtImportCompatibilityIssue {
  code: AdtImportCompatibilityIssueCode
  pageHref: string
  detail?: string
}

export interface AdtImportCompatibility {
  supported: boolean
  issues: AdtImportCompatibilityIssue[]
}

export interface AdtRecoveryPreviewSync {
  audioCount: number
  languages: string[]
  revision: number
}

interface AdtRecoveryMarker {
  version: 1
  createdAt: string
  sourceLabel: string
  sourceFileName: string | null
}

export class AdtRecoverySessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AdtRecoverySessionError"
  }
}

export function assessAdtImportCompatibility(
  zipBuffer: Buffer,
  bundle = readAdtBundle(zipBuffer),
): AdtImportCompatibility {
  const archiveFiles = extractAdtBundleArchiveFiles(zipBuffer)
  const archivePaths = new Set(Object.keys(archiveFiles))
  const issues: AdtImportCompatibilityIssue[] = []
  const pageHrefs = new Set(bundle.pages.map((page) => page.href))
  for (const archivePath of archivePaths) {
    if (!archivePath.startsWith(bundle.root)) continue
    const relativePath = archivePath.slice(bundle.root.length)
    if (!relativePath || relativePath.endsWith("/")) continue
    const [rootEntry] = relativePath.split("/")
    const allowedRootHtml = !relativePath.includes("/")
      && relativePath.endsWith(".html")
      && pageHrefs.has(relativePath)
    if (!allowedRootHtml && !ADT_EDITING_ALLOWED_ROOT_ENTRIES.has(rootEntry)) {
      issues.push({
        code: "unexpected-bundle-entry",
        pageHref: relativePath,
        detail: rootEntry,
      })
    }
  }
  if (!bundle.manifest.editingContract && bundle.sourceFormat !== "legacy-studio-export") {
    issues.push({
      code: "missing-editing-contract",
      pageHref: "manifest.json",
    })
  } else if (
    bundle.manifest.editingContract
    && (
      bundle.manifest.editingContract.version < ADT_EDITING_CONTRACT_MIN_VERSION
      || bundle.manifest.editingContract.version > ADT_EDITING_CONTRACT_VERSION
    )
  ) {
    issues.push({
      code: "unsupported-editing-contract",
      pageHref: "manifest.json",
      detail: String(bundle.manifest.editingContract.version),
    })
  }
  const stylesheets = new Set<string>()
  const declaredOrder = bundle.manifest.editingContract?.pageOrder
  if (declaredOrder && (
    declaredOrder.length !== bundle.pages.length
    || declaredOrder.some((page, index) => (
      page.sectionId !== bundle.pages[index]?.section_id
      || page.href !== bundle.pages[index]?.href
    ))
  )) {
    issues.push({ code: "changed-page-structure", pageHref: "content/pages.json" })
  }
  const declaredDataIds = bundle.manifest.editingContract?.pageDataIds
  if (bundle.manifest.editingContract?.version === ADT_EDITING_CONTRACT_VERSION && declaredOrder) {
    const declaredHrefs = new Set(declaredOrder.map((page) => page.href))
    for (const page of declaredOrder) {
      if (!Object.prototype.hasOwnProperty.call(declaredDataIds ?? {}, page.href)) {
        issues.push({ code: "changed-page-structure", pageHref: page.href })
      }
    }
    for (const href of Object.keys(declaredDataIds ?? {})) {
      if (!declaredHrefs.has(href)) {
        issues.push({ code: "changed-page-structure", pageHref: href })
      }
    }
  }
  for (const page of bundle.pages) {
    const generatedQuizPage = /^(?:qz|quiz)[-_]?\d*/i.test(page.section_id)
    if (path.posix.dirname(page.href) !== ".") {
      issues.push({ code: "nested-page", pageHref: page.href })
    }
    const originalInspection = inspectImportedHtmlContract(
      bundle.pageHtml[page.href] ?? "",
      page.section_id,
      { allowSectionDataId: generatedQuizPage },
    )
    const inspection = bundle.sourceFormat === "legacy-studio-export"
      ? inspectImportedHtmlContract(
          `<div id="content">${projectImportedHtmlSection(
            bundle.pageHtml[page.href] ?? "",
            page.section_id,
            undefined,
            { repairLegacyIds: true },
          ).html}</div>`,
          page.section_id,
        )
      : originalInspection
    issues.push(...inspection.issues.map((issue) => ({
      code: issue.code,
      pageHref: page.href,
      ...(issue.detail ? { detail: issue.detail } : {}),
    })))
    if (bundle.sourceFormat === "legacy-studio-export") {
      const resourceIssueCodes = new Set([
        "remote-asset",
        "unsafe-asset",
        "unsupported-stylesheet",
        "unsupported-script",
        "unsupported-asset-location",
      ])
      issues.push(...originalInspection.issues
        .filter((issue) => resourceIssueCodes.has(issue.code))
        .map((issue) => ({
          code: issue.code,
          pageHref: page.href,
          ...(issue.detail ? { detail: issue.detail } : {}),
        })))
    }
    const declaredIds = declaredDataIds?.[page.href]
    const legacyQuizContract = generatedQuizPage && declaredIds?.length === 0
    if (declaredIds && !legacyQuizContract && (
      declaredIds.length !== inspection.dataIds.length
      || declaredIds.some((id, index) => id !== inspection.dataIds[index])
    )) {
      issues.push({ code: "changed-page-structure", pageHref: page.href })
    }
    for (const asset of originalInspection.localAssets) {
      let decoded = asset
      try { decoded = decodeURIComponent(asset) } catch { /* use the literal path */ }
      const relativePath = path.posix.normalize(
        path.posix.join(path.posix.dirname(page.href), decoded),
      )
      if (!archivePaths.has(`${bundle.root}${relativePath}`)) {
        issues.push({ code: "missing-asset", pageHref: page.href, detail: asset })
      } else if (relativePath.toLowerCase().endsWith(".css")) {
        stylesheets.add(relativePath)
      }
    }
  }
  const checkedStylesheets = new Set<string>()
  while (stylesheets.size > 0) {
    const stylesheet = stylesheets.values().next().value as string
    stylesheets.delete(stylesheet)
    if (checkedStylesheets.has(stylesheet)) continue
    checkedStylesheets.add(stylesheet)
    const bytes = archiveFiles[`${bundle.root}${stylesheet}`]
    if (!bytes) continue
    const css = new TextDecoder().decode(bytes)
    const references = [
      ...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi),
      ...css.matchAll(/@import\s+["']([^"']+)["']/gi),
    ].map((match) => match[1].trim())
    for (const reference of references) {
      if (!reference || reference.startsWith("#") || reference.startsWith("data:")) continue
      if (/^(?:https?:)?\/\//i.test(reference)) {
        issues.push({ code: "remote-asset", pageHref: stylesheet, detail: reference })
        continue
      }
      if (/^(?:[a-z]+:|\/|\\)/i.test(reference)) {
        issues.push({ code: "unsafe-asset", pageHref: stylesheet, detail: reference })
        continue
      }
      const resolved = path.posix.normalize(path.posix.join(
        path.posix.dirname(stylesheet),
        reference.split(/[?#]/, 1)[0],
      ))
      if (resolved === ".." || resolved.startsWith("../")) {
        issues.push({ code: "unsafe-asset", pageHref: stylesheet, detail: reference })
      } else if (!archivePaths.has(`${bundle.root}${resolved}`)) {
        issues.push({
          code: "missing-asset",
          pageHref: stylesheet,
          detail: reference,
        })
      } else if (resolved.toLowerCase().endsWith(".css")) {
        stylesheets.add(resolved)
      }
    }
  }
  const unique = [...new Map(issues.map((issue) => [
    `${issue.code}:${issue.pageHref}:${issue.detail ?? ""}`,
    issue,
  ])).values()].slice(0, 50)
  return { supported: unique.length === 0, issues: unique }
}

export function previewAdtRecoveryImport(
  zipBuffer: Buffer,
  agentGuideTemplate?: string,
): AdtRecoveryImportPreview {
  const bundle = readAdtBundle(zipBuffer, { includePreviewImages: true })
  if (bundle.pages.length === 0 || Object.keys(bundle.pageHtml).length === 0) {
    throw new AdtRecoverySessionError("The ADT bundle does not contain recoverable book pages")
  }

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtRecoverySessionError("The ADT bundle does not contain its source text catalog")
  }
  const { catalog, imageCount, captionedImageCount } = createRecoveredCatalog(
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
  const activityReview = analyzeImportedActivities(bundle, { includePreviews: true })
  const compatibility = assessAdtImportCompatibility(zipBuffer, bundle)
  const template = agentGuideTemplate ?? (() => {
    const defaultPath = path.resolve(process.cwd(), "assets", "AGENTS.md.liquid")
    if (!fs.existsSync(defaultPath)) {
      throw new AdtRecoverySessionError("ADT Studio repair guide is unavailable")
    }
    return fs.readFileSync(defaultPath, "utf8")
  })()

  return {
    isAdtBundle: true,
    legacyRecovery: bundle.sourceFormat === "legacy-studio-export",
    label: bundle.manifest.book.label,
    title: bundle.title,
    coverBase64: bundle.cover
      ? `data:${bundle.cover.mimeType};base64,${Buffer.from(bundle.cover.bytes).toString("base64")}`
      : null,
    sourceLanguage,
    outputLanguages,
    runtimeFeatures: bundle.runtimeFeatures,
    pageCount: recoveredPageCount(bundle.pages),
    imageCount,
    captionedImageCount,
    glossaryEntryCount: Object.keys(bundle.glossaries[bundle.manifest.languages.source] ?? {}).length,
    tocEntryCount: bundle.toc.length,
    translationLanguageCount: outputLanguages.filter((language) => (
      bundle.texts[language] || bundle.texts[language.replace("-", "_")]
    )).length,
    contentChanged: hasSourceChanges(bundle, catalog, sourceTexts),
    exportComparisonStatus: compareWithExportBaseline(bundle),
    activityReview,
    compatibility,
    agentGuide: createAdtImportRepairGuide(bundle, compatibility, template, activityReview),
  }
}

function within(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

function safeLabelPart(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/-+$/g, "")
    .slice(0, 80) || "book"
}

function createSessionLabel(sourceLabel: string, booksDir: string): string {
  const base = `adt-recovery-${safeLabelPart(sourceLabel)}`
  for (let attempt = 0; attempt < 10; attempt++) {
    const label = `${base}-${randomUUID().slice(0, 8)}`
    if (!fs.existsSync(path.join(path.resolve(booksDir), label))) return parseBookLabel(label)
  }
  throw new AdtRecoverySessionError("Could not allocate a temporary ADT workspace")
}

function writeBundlePreview(
  files: Record<string, Uint8Array>,
  archiveRoot: string,
  targetDir: string,
): void {
  fs.mkdirSync(targetDir, { recursive: true })
  for (const [archivePath, bytes] of Object.entries(files)) {
    if (!archivePath.startsWith(archiveRoot)) continue
    const relativePath = archivePath.slice(archiveRoot.length)
    if (!relativePath || relativePath.endsWith("/")) continue
    const outputPath = path.resolve(targetDir, relativePath)
    if (!within(outputPath, targetDir)) {
      throw new AdtRecoverySessionError(`ADT bundle contains an unsafe preview path: ${archivePath}`)
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, bytes)
  }
  if (!fs.existsSync(path.join(targetDir, "index.html"))) {
    throw new AdtRecoverySessionError("ADT bundle is missing its book entry page")
  }
}

function pageIdFromSection(sectionId: string, index: number): string | null {
  if (/^(?:qz|quiz)[-_]?\d*/i.test(sectionId)) return null
  const pageMatch = sectionId.match(/^(pg\d+)/i)
  return pageMatch?.[1] ?? `pg${String(index + 1).padStart(3, "0")}`
}

function recoveredPageCount(
  pages: Array<{ section_id: string; href: string; page_number?: number }>,
): number {
  return new Set(
    pages
      .map((page, index) => pageIdFromSection(page.section_id, index))
      .filter((pageId): pageId is string => pageId !== null),
  ).size
}

function createRecoveredCatalog(
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
        throw new AdtRecoverySessionError(`Duplicate stable text id across ADT pages: ${entry.id} (${page.href})`)
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

function hasSourceChanges(
  bundle: ReturnType<typeof readAdtBundle>,
  catalog: TextCatalogOutput,
  sourceTexts: Record<string, string>,
): boolean {
  return recoveredCatalogChanged(catalog, sourceTexts)
    || bundle.ignoredEdits.sourceTextsChanged
    || bundle.ignoredEdits.pageHtmlChanged.length > 0
    || bundle.ignoredEdits.pageHtmlMissing.length > 0
}

function compareWithExportBaseline(
  bundle: ReturnType<typeof readAdtBundle>,
): AdtRecoveryImportPreview["exportComparisonStatus"] {
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

function seedPages(
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

function seedImportedStoryboard(
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
): void {
  const grouped = new Map<string, Array<{
    sectionId: string
    href: string
    projection: ReturnType<typeof projectImportedHtmlSection>
  }>>()
  pages.forEach((page, index) => {
    const pageId = pageIdFromSection(page.section_id, index)
    if (!pageId) return
    const entries = grouped.get(pageId) ?? []
    entries.push({
      sectionId: page.section_id,
      href: page.href,
      projection: projectImportedHtmlSection(
        pageHtml[page.href] ?? "",
        page.section_id,
        `/api/books/${encodeURIComponent(label)}/images`,
        {
          repairLegacyIds: legacyRecovery,
          ...(activityOverrides.has(page.section_id)
            ? { sectionTypeOverride: activityOverrides.get(page.section_id) }
            : {}),
        },
      ),
    })
    grouped.set(pageId, entries)
  })

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
      storage.putNodeData("web-rendering", pageId, {
        sections: entries.map((entry, sectionIndex) => ({
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
}

function seedImportedFeatures(
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

function seedImportedImages(
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
}

export function isAdtRecoverySession(label: string, booksDir: string): boolean {
  const safeLabel = parseBookLabel(label)
  return fs.existsSync(path.join(path.resolve(booksDir), safeLabel, ADT_RECOVERY_MARKER))
}

function readAdtRecoveryMarker(label: string, booksDir: string): AdtRecoveryMarker {
  const markerPath = path.join(path.resolve(booksDir), label, ADT_RECOVERY_MARKER)
  let marker: unknown
  try {
    marker = JSON.parse(fs.readFileSync(markerPath, "utf8"))
  } catch {
    throw new AdtRecoverySessionError("ADT workspace metadata could not be read")
  }
  const value = marker as Partial<AdtRecoveryMarker> | null
  if (
    !value
    || value.version !== 1
    || typeof value.createdAt !== "string"
    || typeof value.sourceLabel !== "string"
    || !(typeof value.sourceFileName === "string" || value.sourceFileName === null)
  ) {
    throw new AdtRecoverySessionError("ADT workspace metadata is invalid")
  }
  return value as AdtRecoveryMarker
}

function describeAdtRecoverySession(
  label: string,
  booksDir: string,
  bundle: ReturnType<typeof readAdtBundle>,
  marker: AdtRecoveryMarker,
): AdtRecoverySession {
  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtRecoverySessionError("The ADT bundle does not contain its source text catalog")
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
  const speechLanguages = [...new Set(
    bundle.manifest.languages.output.map((language) => normalizeLocale(language)),
  )]
  let generatedSpeech = false
  let everyLanguageHasGeneratedVersion = speechLanguages.length > 0
  const storage = createBookStorage(label, booksDir)
  try {
    for (const language of speechLanguages) {
      const row = storage.getLatestNodeData("tts", language)
        ?? storage.getLatestNodeData("tts", language.replace("-", "_"))
      const wasInvalidatedByImport = Boolean(
        row
        && typeof row.data === "object"
        && row.data !== null
        && "invalidatedBySourceRevision" in row.data,
      )
      if (!row || wasInvalidatedByImport) {
        everyLanguageHasGeneratedVersion = false
        continue
      }
      const parsed = TTSOutput.safeParse(row.data)
      if (parsed.success && parsed.data.entries.length > 0) generatedSpeech = true
    }
  } finally {
    storage.close()
  }
  const readAloud = generatedSpeech || (
    !everyLanguageHasGeneratedVersion && Boolean(bundle.runtimeFeatures.readAloud)
  )
  const contentChanged = hasSourceChanges(bundle, catalog, sourceTexts)
  return {
    label,
    title: bundle.title,
    sourceFileName: marker.sourceFileName,
    createdAt: marker.createdAt,
    coverBase64: bundle.cover
      ? `data:${bundle.cover.mimeType};base64,${Buffer.from(bundle.cover.bytes).toString("base64")}`
      : null,
    sourceLanguage,
    outputLanguages,
    runtimeFeatures: { ...bundle.runtimeFeatures, readAloud },
    pageCount: recoveredPageCount(bundle.pages),
    catalogEntryCount: catalog.entries.length,
    glossaryEntryCount: Object.keys(bundle.glossaries[bundle.manifest.languages.source] ?? {}).length,
    tocEntryCount: bundle.toc.length,
    translationLanguageCount: outputLanguages.filter((language) => (
      bundle.texts[language] || bundle.texts[language.replace("-", "_")]
    )).length,
    recoveredHtmlEntryCount: htmlEntryCount,
    ignoredHtmlEntryCount,
    contentChanged,
    previewPath: `/books/${label}/adt/index.html`,
  }
}

export function getAdtRecoverySession(label: string, booksDir: string): AdtRecoverySession {
  const safeLabel = parseBookLabel(label)
  if (!isAdtRecoverySession(safeLabel, booksDir)) {
    throw new AdtRecoverySessionError("ADT workspace not found")
  }
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const marker = readAdtRecoveryMarker(safeLabel, booksDir)
  let sourceZip: Buffer
  try {
    sourceZip = fs.readFileSync(path.join(bookDir, "source-adt.zip"))
  } catch {
    throw new AdtRecoverySessionError("ADT workspace source bundle could not be read")
  }
  return describeAdtRecoverySession(safeLabel, booksDir, readAdtBundle(sourceZip), marker)
}

export function listAdtRecoverySessions(booksDir: string): AdtRecoverySession[] {
  const root = path.resolve(booksDir)
  if (!fs.existsSync(root)) return []
  const sessions: AdtRecoverySession[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!fs.existsSync(path.join(root, entry.name, ADT_RECOVERY_MARKER))) continue
    try {
      sessions.push(getAdtRecoverySession(entry.name, booksDir))
    } catch {
      // A malformed workspace should not prevent healthy sessions from being
      // resumed. It remains on disk for inspection or explicit deletion.
    }
  }
  return sessions.sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export function createAdtRecoverySession(
  zipBuffer: Buffer,
  booksDir: string,
  sourceFileName?: string,
  activityDecisions: readonly AdtActivityImportDecision[] = [],
): AdtRecoverySession {
  let bundle
  try {
    bundle = readAdtBundle(zipBuffer)
  } catch (error) {
    if (error instanceof AdtBundleReadError) throw error
    throw new AdtRecoverySessionError("The ADT bundle could not be read")
  }
  if (bundle.pages.length === 0 || Object.keys(bundle.pageHtml).length === 0) {
    throw new AdtRecoverySessionError("The ADT bundle does not contain recoverable book pages")
  }
  const activityReview = analyzeImportedActivities(bundle)
  const activityOverrides = resolveImportedActivityDecisions(activityReview, activityDecisions)

  const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
  const sourceTexts = bundle.texts[bundle.manifest.languages.source]
  if (!sourceTexts) {
    throw new AdtRecoverySessionError("The ADT bundle does not contain its source text catalog")
  }
  let files: Record<string, Uint8Array>
  try {
    files = extractAdtBundleArchiveFiles(zipBuffer)
  } catch (error) {
    if (error instanceof AdtBundleEditorError) throw new AdtRecoverySessionError(error.message)
    throw error
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

  const label = createSessionLabel(bundle.manifest.book.label, booksDir)
  const bookDir = path.join(path.resolve(booksDir), label)
  const createdAt = new Date().toISOString()
  try {
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
    seedImportedStoryboard(
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
    fs.writeFileSync(path.join(bookDir, "config.yaml"), yaml.dump({
      editing_language: sourceLanguage,
      // The existing Speech UI treats this as the selectable narration list;
      // normal books always include their source language here as well.
      output_languages: [sourceLanguage, ...outputLanguages],
    }))
    fs.writeFileSync(path.join(bookDir, "source-adt.zip"), zipBuffer)
    fs.writeFileSync(path.join(bookDir, ADT_RECOVERY_MARKER), JSON.stringify({
      version: 1,
      createdAt,
      sourceLabel: bundle.manifest.book.label,
      sourceFileName: sourceFileName ?? null,
    } satisfies AdtRecoveryMarker, null, 2))

    writeBundlePreview(files, bundle.root, path.join(bookDir, "adt"))
  } catch (error) {
    fs.rmSync(bookDir, { recursive: true, force: true })
    throw error
  }

  return {
    label,
    title: bundle.title,
    sourceFileName: sourceFileName ?? null,
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
    previewPath: `/books/${label}/adt/index.html`,
  }
}

export function deleteAdtRecoverySession(label: string, booksDir: string): void {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!isAdtRecoverySession(safeLabel, booksDir)) {
    throw new AdtRecoverySessionError("Book is not a temporary ADT workspace")
  }
  fs.rmSync(bookDir, { recursive: true, force: true })
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)
}

function safeAudioSource(bookDir: string, language: string, fileName: string): string | null {
  if (path.basename(fileName) !== fileName) return null
  for (const directoryLanguage of [language, language.replace("-", "_")]) {
    const audioRoot = path.join(bookDir, "audio", directoryLanguage)
    const candidate = path.resolve(audioRoot, fileName)
    if (within(candidate, audioRoot) && fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      return candidate
    }
  }
  return null
}

function readArchiveJsonRecord(
  files: Record<string, Uint8Array>,
  archivePath: string,
  description: string,
): Record<string, unknown> {
  const bytes = files[archivePath]
  if (!bytes) return {}
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object")
    return value as Record<string, unknown>
  } catch {
    throw new AdtRecoverySessionError(`The recovered ${description} is invalid`)
  }
}

function readRecoverySpeechConfig(bookDir: string): SpeechConfig | undefined {
  const configPath = path.join(bookDir, "config.yaml")
  if (!fs.existsSync(configPath)) return undefined
  let config: unknown
  try {
    config = yaml.load(fs.readFileSync(configPath, "utf8"))
  } catch {
    throw new AdtRecoverySessionError("The recovered book configuration is invalid")
  }
  if (!config || typeof config !== "object" || !("speech" in config)) return undefined
  const parsed = SpeechConfig.safeParse((config as Record<string, unknown>).speech)
  if (!parsed.success) {
    throw new AdtRecoverySessionError("The recovered speech configuration is invalid")
  }
  return parsed.data
}

const MAX_RECOVERY_EXPANDED_BYTES = ARCHIVE_SAFETY_LIMITS.expandedBytes

function projectLatestSpeech(
  label: string,
  booksDir: string,
  baseZip: Buffer,
): {
  bundle: ReturnType<typeof readAdtBundle>
  files: Record<string, Uint8Array>
  audioCount: number
  languages: string[]
} {
  const bookDir = path.join(path.resolve(booksDir), label)
  const bundle = readAdtBundle(baseZip)
  const files = extractAdtBundleArchiveFiles(baseZip)
  const speechConfig = readRecoverySpeechConfig(bookDir)
  const configPath = `${bundle.root}assets/config.json`
  let runtimeConfig: Record<string, unknown> = {}
  if (files[configPath]) {
    try {
      runtimeConfig = JSON.parse(new TextDecoder().decode(files[configPath])) as Record<string, unknown>
    } catch {
      throw new AdtRecoverySessionError("The recovered runtime config is invalid")
    }
  }

  const storage = createBookStorage(label, booksDir)
  const syncedLanguages: string[] = []
  let audioCount = 0
  let timecodeCount = 0
  try {
    for (const archiveLanguage of bundle.manifest.languages.output) {
      const language = normalizeLocale(archiveLanguage)
      const legacyLanguage = language.replace("-", "_")
      const audioPrefix = `${bundle.root}content/i18n/${archiveLanguage}/audio/`
      const audiosPath = `${bundle.root}content/i18n/${archiveLanguage}/audios.json`
      const timecodePath = `${bundle.root}content/i18n/${archiveLanguage}/timecode/timecode_output.json`
      const row = storage.getLatestNodeData("tts", language)
        ?? storage.getLatestNodeData("tts", legacyLanguage)

      const wasInvalidatedByImport = Boolean(
        row
        && typeof row.data === "object"
        && row.data !== null
        && "invalidatedBySourceRevision" in row.data,
      )
      if (!row || wasInvalidatedByImport) {
        // No recovered generation exists yet: keep the narration that arrived
        // in the edited ADT export, including its timecodes and runtime flags.
        const importedAudioMap = readArchiveJsonRecord(files, audiosPath, "audio map")
        const importedTimecodes = readArchiveJsonRecord(files, timecodePath, "timecode map")
        const includedAudioEntries = Object.entries(importedAudioMap).filter(([textId, fileName]) =>
          typeof fileName === "string"
          && !isTtsExcluded(textId, speechConfig)
          && Boolean(files[`${audioPrefix}${fileName}`]),
        ) as Array<[string, string]>
        const includedTimecodes = Object.fromEntries(
          Object.entries(importedTimecodes)
            .filter(([textId]) => !isTtsExcluded(textId, speechConfig)),
        )
        if (speechConfig?.excluded_categories?.length || speechConfig?.excluded_text_ids?.length) {
          const includedFiles = new Set(includedAudioEntries.map(([, fileName]) => fileName))
          for (const [textId, fileName] of Object.entries(importedAudioMap)) {
            if (
              typeof fileName === "string"
              && isTtsExcluded(textId, speechConfig)
              && !includedFiles.has(fileName)
            ) {
              delete files[`${audioPrefix}${fileName}`]
            }
          }
          files[audiosPath] = encodeJson(Object.fromEntries(includedAudioEntries))
          files[timecodePath] = encodeJson(includedTimecodes)
        }
        const importedAudioCount = includedAudioEntries.length
        const importedTimecodeCount = Object.keys(includedTimecodes).length
        if (importedAudioCount > 0) {
          syncedLanguages.push(language)
          audioCount += importedAudioCount
        }
        timecodeCount += importedTimecodeCount
        continue
      }

      const parsed = TTSOutput.safeParse(row.data)
      if (!parsed.success) {
        throw new AdtRecoverySessionError(`Recovered speech data is invalid for ${language}`)
      }
      for (const archivePath of Object.keys(files)) {
        if (archivePath.startsWith(audioPrefix)) delete files[archivePath]
      }
      const audioMap: Record<string, string> = {}
      for (const entry of parsed.data.entries) {
        if (!isTtsExcluded(entry.textId, speechConfig)) {
          const source = safeAudioSource(bookDir, language, entry.fileName)
          if (!source) continue
          const archivePath = `${audioPrefix}${entry.fileName}`
          files[archivePath] = fs.readFileSync(source)
          audioMap[entry.textId] = entry.fileName
        }
      }
      files[audiosPath] = encodeJson(audioMap)

      const runtimeTimecodes = buildRuntimeTimecodeMap(
        getWordTimestamps(storage, language),
        speechConfig,
      )
      files[timecodePath] = encodeJson(runtimeTimecodes)
      timecodeCount += Object.keys(runtimeTimecodes).length

      const languageAudioCount = Object.keys(audioMap).length
      if (languageAudioCount > 0) {
        syncedLanguages.push(language)
        audioCount += languageAudioCount
      }
    }
  } finally {
    storage.close()
  }

  const features = runtimeConfig.features && typeof runtimeConfig.features === "object"
    ? { ...(runtimeConfig.features as Record<string, unknown>) }
    : {}
  features.readAloud = audioCount > 0
  features.highlight = timecodeCount > 0
  runtimeConfig.features = features
  files[configPath] = encodeJson(runtimeConfig)

  refreshOfflinePreloader(files, bundle.root, bundle.manifest.languages.output)

  const expandedBytes = Object.values(files).reduce((total, bytes) => total + bytes.byteLength, 0)
  if (expandedBytes > MAX_RECOVERY_EXPANDED_BYTES) {
    throw new AdtRecoverySessionError("Recovered ADT output exceeds the expanded archive size limit")
  }
  return { bundle, files, audioCount, languages: syncedLanguages }
}

function replacePreviewAtomically(
  bookDir: string,
  files: Record<string, Uint8Array>,
  archiveRoot: string,
): void {
  const previewRoot = path.join(bookDir, "adt")
  const temporaryRoot = path.join(bookDir, `.adt-next-${randomUUID()}`)
  const backupRoot = path.join(bookDir, `.adt-previous-${randomUUID()}`)
  writeBundlePreview(files, archiveRoot, temporaryRoot)
  let movedCurrent = false
  try {
    if (fs.existsSync(previewRoot)) {
      fs.renameSync(previewRoot, backupRoot)
      movedCurrent = true
    }
    fs.renameSync(temporaryRoot, previewRoot)
    if (movedCurrent) fs.rmSync(backupRoot, { recursive: true, force: true })
  } catch (error) {
    fs.rmSync(temporaryRoot, { recursive: true, force: true })
    if (movedCurrent && !fs.existsSync(previewRoot) && fs.existsSync(backupRoot)) {
      fs.renameSync(backupRoot, previewRoot)
    }
    throw error
  }
}

/** Rebuild the preview from the edited source archive plus the latest
 * versioned Speech output. Replacing the directory avoids stale audio from a
 * previous generation surviving a deletion or language change. */
export function syncAdtRecoveryPreview(label: string, booksDir: string): AdtRecoveryPreviewSync {
  const safeLabel = parseBookLabel(label)
  if (!isAdtRecoverySession(safeLabel, booksDir)) {
    throw new AdtRecoverySessionError("ADT workspace not found")
  }
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const sourceZip = fs.readFileSync(path.join(bookDir, "source-adt.zip"))
  const projected = projectLatestSpeech(safeLabel, booksDir, sourceZip)
  replacePreviewAtomically(bookDir, projected.files, projected.bundle.root)
  return {
    audioCount: projected.audioCount,
    languages: projected.languages,
    revision: Date.now(),
  }
}

function readCurrentImportedAdtSource(label: string, booksDir: string): Buffer {
  const bookDir = path.join(path.resolve(booksDir), parseBookLabel(label))
  const currentPath = path.join(bookDir, ".adt-import-current.json")
  let revisionId: string
  try {
    const current = JSON.parse(fs.readFileSync(currentPath, "utf8")) as { revisionId?: unknown }
    if (
      typeof current.revisionId !== "string"
      || path.basename(current.revisionId) !== current.revisionId
      || current.revisionId.includes("..")
    ) {
      throw new Error("invalid revision id")
    }
    revisionId = current.revisionId
  } catch {
    throw new AdtRecoverySessionError("Imported ADT revision metadata could not be read")
  }
  try {
    return fs.readFileSync(path.join(bookDir, ".adt-imports", revisionId, "source.zip"))
  } catch {
    throw new AdtRecoverySessionError("Imported ADT source archive could not be read")
  }
}

/** Upgrade projects imported before the normal pipeline projection existed.
 * Every entity write appends a version; the immutable source ZIP remains the
 * rollback/audit source if an upgrade is interrupted. */
export function ensureImportedAdtProjectProjection(label: string, booksDir: string): boolean {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const currentPath = path.join(bookDir, ".adt-import-current.json")
  if (!fs.existsSync(currentPath)) return false

  let current: Record<string, unknown>
  try {
    const value = JSON.parse(fs.readFileSync(currentPath, "utf8")) as unknown
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid marker")
    current = value as Record<string, unknown>
  } catch {
    throw new AdtRecoverySessionError("Imported ADT revision metadata could not be read")
  }
  if (
    typeof current.projectionVersion === "number"
    && current.projectionVersion >= ADT_IMPORT_PROJECTION_VERSION
  ) return false

  const sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  const bundle = readAdtBundle(sourceZip)
  const files = extractAdtBundleArchiveFiles(sourceZip)
  const legacyRecovery = bundle.sourceFormat === "legacy-studio-export"
  seedPages(path.join(bookDir, `${safeLabel}.db`), bundle.pages, bundle.pageHtml, legacyRecovery)
  seedImportedStoryboard(
    safeLabel,
    booksDir,
    bundle.pages,
    bundle.pageHtml,
    bundle.toc,
    legacyRecovery,
    bundle.texts[bundle.manifest.languages.source] ?? {},
  )
  seedImportedFeatures(safeLabel, booksDir, bundle, new Date().toISOString())
  seedImportedImages(safeLabel, booksDir, bundle, files)

  const temporaryPath = `${currentPath}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify({
    ...current,
    projectionVersion: ADT_IMPORT_PROJECTION_VERSION,
  }, null, 2)}\n`)
  fs.renameSync(temporaryPath, currentPath)
  return true
}

export function upgradeImportedAdtProjects(booksDir: string): void {
  const root = path.resolve(booksDir)
  if (!fs.existsSync(root)) return
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!fs.existsSync(path.join(root, entry.name, ".adt-import-current.json"))) continue
    try {
      ensureImportedAdtProjectProjection(entry.name, root)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[adt-import] Could not upgrade ${entry.name}: ${message}`)
    }
  }
}

export function getImportedAdtPresentationAssets(
  label: string,
  booksDir: string,
): { stylesheets: string[]; scripts: string[]; contentClasses: string[] } {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!fs.existsSync(path.join(bookDir, ".adt-import-current.json"))) {
    return { stylesheets: [], scripts: [], contentClasses: [] }
  }
  let sourceZip: Buffer
  try {
    sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  } catch {
    return { stylesheets: [], scripts: [], contentClasses: [] }
  }
  const bundle = readAdtBundle(sourceZip)
  const stylesheets = new Set<string>()
  const scripts = new Set<string>()
  const contentClasses = new Set<string>()
  for (const html of Object.values(bundle.pageHtml)) {
    const assets = extractImportedHtmlPresentationAssets(html)
    assets.stylesheets.forEach((asset) => stylesheets.add(asset))
    assets.scripts.forEach((asset) => scripts.add(asset))
    assets.contentClasses.forEach((className) => contentClasses.add(className))
  }
  return {
    stylesheets: [...stylesheets],
    scripts: [...scripts],
    contentClasses: [...contentClasses],
  }
}

export function getImportedAdtFeaturesNeedingRegeneration(
  label: string,
  booksDir: string,
): string[] {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!fs.existsSync(path.join(bookDir, ".adt-import-current.json"))) return []
  let bundle: ReturnType<typeof readAdtBundle>
  try {
    bundle = readAdtBundle(readCurrentImportedAdtSource(safeLabel, booksDir))
  } catch {
    return []
  }

  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const pending: string[] = []
    if (bundle.runtimeFeatures.readAloud) {
      const hasSpeech = bundle.manifest.languages.output.some((archiveLanguage) => {
        const language = normalizeLocale(archiveLanguage)
        const row = storage.getLatestNodeData("tts", language)
          ?? storage.getLatestNodeData("tts", language.replace("-", "_"))
        const parsed = TTSOutput.safeParse(row?.data)
        return parsed.success && parsed.data.entries.length > 0
      })
      if (!hasSpeech) pending.push("Speech")
    }
    if (analyzeImportedActivities(bundle).quizCount > 0) {
      const quizRow = storage.getLatestNodeData("quiz-generation", "book")
      const hasQuizzes = Boolean(
        quizRow
        && typeof quizRow.data === "object"
        && quizRow.data !== null
        && Array.isArray((quizRow.data as { quizzes?: unknown }).quizzes)
        && ((quizRow.data as { quizzes: unknown[] }).quizzes.length > 0),
      )
      if (!hasQuizzes) pending.push("Quizzes")
    }
    if (bundle.runtimeFeatures.easyRead) {
      const easyRead = EasyReadOutput.safeParse(
        storage.getLatestNodeData("easy-read", "book")?.data,
      )
      if (
        !easyRead.success
        || !easyRead.data.blocks.some((block) => block.entries.length > 0)
      ) {
        pending.push("Easy Read")
      }
    }
    if (
      bundle.runtimeFeatures.signLanguage
      && !storage.getSignLanguageVideos().some((video) => video.sectionId !== null)
    ) {
      pending.push("Sign Language")
    }
    return pending
  } finally {
    storage.close()
  }
}

function escapePresentationAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

/** Restore supported presentation assets and custom activity registrations
 * after the normal pipeline packager has rebuilt an imported ADT. Generated
 * manifests and runtime files always win; only missing source assets are copied. */
export function restoreImportedAdtPresentation(label: string, booksDir: string): boolean {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  if (!fs.existsSync(path.join(bookDir, ".adt-import-current.json"))) return false

  let sourceZip: Buffer
  try {
    sourceZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  } catch {
    // The projected database remains packageable even when presentation
    // recovery metadata from an older prototype is incomplete.
    return false
  }
  const bundle = readAdtBundle(sourceZip)
  const files = extractAdtBundleArchiveFiles(sourceZip)
  const adtDir = path.join(bookDir, "adt")
  if (!fs.existsSync(adtDir)) return false

  const presentation = getImportedAdtPresentationAssets(safeLabel, booksDir)
  let changed = false

  for (const [archivePath, bytes] of Object.entries(files)) {
    if (!archivePath.startsWith(bundle.root)) continue
    const relativePath = archivePath.slice(bundle.root.length)
    if (!relativePath || relativePath.endsWith("/") || relativePath.toLowerCase().endsWith(".html")) continue
    const outputPath = path.resolve(adtDir, relativePath)
    if (!within(outputPath, adtDir) || fs.existsSync(outputPath)) continue
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, bytes)
    changed = true
  }

  const stylesheetHtml = presentation.stylesheets
    .map((asset) => `    <link href="./${escapePresentationAttribute(asset)}" rel="stylesheet" data-adt-imported-presentation>`)
    .join("\n")
  const pagesPath = path.join(adtDir, "content", "pages.json")
  if (!fs.existsSync(pagesPath)) return false
  const pages = JSON.parse(fs.readFileSync(pagesPath, "utf8")) as Array<{
    section_id?: unknown
    href?: unknown
  }>
  for (const page of pages) {
    if (typeof page.href !== "string" || typeof page.section_id !== "string") continue
    const pagePath = path.resolve(adtDir, page.href)
    if (!within(pagePath, adtDir) || !fs.existsSync(pagePath)) continue
    let html = fs.readFileSync(pagePath, "utf8")
    const before = html
    if (stylesheetHtml && !html.includes("data-adt-imported-presentation")) {
      html = html.replace("</head>", `${stylesheetHtml}\n</head>`)
    }
    const sourcePage = bundle.pages.find((candidate) => candidate.section_id === page.section_id)
    if (sourcePage) {
      html = restoreImportedCustomActivityScripts(
        html,
        bundle.pageHtml[sourcePage.href] ?? "",
        page.section_id,
      )
    }
    if (html !== before) {
      fs.writeFileSync(pagePath, html)
      changed = true
    }
  }
  if (changed) generateOfflinePreloader(adtDir, bundle.manifest.languages.output)
  return changed
}

/** Rebuild a regular imported-ADT project's preview from its immutable source
 * revision plus the latest generated Speech entities. */
export function syncImportedAdtProjectPreview(
  label: string,
  booksDir: string,
): AdtRecoveryPreviewSync {
  const safeLabel = parseBookLabel(label)
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const baseZip = readCurrentImportedAdtSource(safeLabel, booksDir)
  const { bundle, files, audioCount, languages } = projectLatestSpeech(
    safeLabel,
    booksDir,
    baseZip,
  )
  const identity = ensureProjectIdentity(bookDir)
  files[`${bundle.root}manifest.json`] = encodeJson(AdtRoundTripManifest.parse({
    ...bundle.manifest,
    book: { ...bundle.manifest.book, label: safeLabel },
    lineage: {
      originProjectId: identity.projectId,
      sourceKind: identity.sourceKind,
      sourceFingerprint: identity.sourceFingerprint,
      publicationId: randomUUID(),
      exportedAt: new Date().toISOString(),
    },
  }))
  refreshOfflinePreloader(files, bundle.root, bundle.manifest.languages.output)
  replacePreviewAtomically(bookDir, files, bundle.root)
  return {
    audioCount,
    languages,
    revision: Date.now(),
  }
}

export function exportAdtRecoverySession(
  label: string,
  booksDir: string,
): Buffer {
  const safeLabel = parseBookLabel(label)
  if (!isAdtRecoverySession(safeLabel, booksDir)) {
    throw new AdtRecoverySessionError("ADT workspace not found")
  }
  const bookDir = path.join(path.resolve(booksDir), safeLabel)
  const sourceZip = fs.readFileSync(path.join(bookDir, "source-adt.zip"))
  const projected = projectLatestSpeech(safeLabel, booksDir, sourceZip)
  const output = Buffer.from(zipSync(projected.files, { level: 6 }))
  if (output.byteLength > ADT_BUNDLE_READER_LIMITS.archiveBytes) {
    throw new AdtRecoverySessionError("Recovered ADT ZIP exceeds the compressed archive size limit")
  }
  readAdtBundle(output)
  return output
}

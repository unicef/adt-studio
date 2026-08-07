import { parseDocument, DomUtils } from "htmlparser2"
import type {
  ContentNodeData,
  WebRenderingOutput,
  SectionRendering,
  ImageCaptioningOutput,
  GlossaryOutput,
  QuizGenerationOutput,
  TextCatalogEntry,
  TextCatalogOutput,
  PageSectioningOutput as PageSectioningOutputType,
} from "@adt/types"
import {
  WebRenderingOutput as WebRenderingOutputSchema,
} from "@adt/types"
import type { Storage, PageData } from "@adt/storage"
import { getGlossaryItemTextId } from "./glossary.js"
import { getRenderSectioning } from "./render-sectioning.js"

/** Zero-padded 3-digit number */
function pad3(n: number): string {
  return String(n).padStart(3, "0")
}

/**
 * Like DomUtils.textContent but skips the children of any <script>/<style>
 * descendants. Used so a stray inline script inside a data-id element doesn't
 * leak its source into the catalogued text (and from there into the runtime's
 * innerHTML replacement on translation).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function textContentExcludingScripts(node: any): string {
  if (!node) return ""
  if (node.type === "text") return node.data ?? ""
  const tagName = (node.name ?? node.type ?? "").toLowerCase()
  if (tagName === "script" || tagName === "style") return ""
  if (Array.isArray(node.children)) {
    let out = ""
    for (const child of node.children) {
      out += textContentExcludingScripts(child)
    }
    return out
  }
  return ""
}

/**
 * Recover the stable text entries embedded in an exported ADT HTML page.
 *
 * Exported pages are already the user's authoritative, possibly hand-edited
 * source. Keeping this extractor beside the pipeline catalog builder ensures
 * recovered bundle workspaces follow the same leaf `data-id` semantics as a
 * project generated inside Studio. Image alternative text is the exported
 * representation of an image caption, so it is recovered as catalog text too.
 */
export function extractTextCatalogEntriesFromHtml(html: string, pageId?: string): TextCatalogEntry[] {
  const doc = parseDocument(html)
  const contentRoot = DomUtils.findOne(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
    true,
  )
  const elements = DomUtils.findAll(
    (el) =>
      el.type === "tag" &&
      el.attribs?.["data-id"] !== undefined &&
      !DomUtils.findOne(
        (child) => child.type === "tag" && child.attribs?.["data-id"] !== undefined,
        el.children ?? [],
        true,
      ),
    contentRoot?.children ?? doc.children,
  )

  const entries: TextCatalogEntry[] = []
  const seen = new Set<string>()
  let activityCounter = 0
  for (const el of elements) {
    const dataId = el.attribs["data-id"]
    const id = pageId && dataId.startsWith("activity_gen_")
      ? `${pageId}_ac${pad3(++activityCounter)}`
      : dataId
    if (seen.has(id)) {
      throw new Error(`Duplicate data-id in exported ADT page: ${id}`)
    }
    seen.add(id)

    const text = (el.name === "img"
      ? el.attribs.alt ?? ""
      : textContentExcludingScripts(el)
    ).replace(/\s+/g, " ").trim()
    if (text.length > 0) entries.push({ id, text })
  }
  return entries
}

export interface ImportedHtmlImageReference {
  imageId: string
  src: string
  alt: string
  decorative: boolean
}

export interface ImportedHtmlSectionProjection {
  html: string
  sectionType: string
  nodes: ContentNodeData[]
  images: ImportedHtmlImageReference[]
}

export interface ImportedHtmlProjectionOptions {
  /** Normalize stable IDs from known pre-round-trip Studio exports. This is
   * intentionally opt-in so current projects keep the strict contract. */
  repairLegacyIds?: boolean
}

export interface ImportedHtmlPresentationAssets {
  stylesheets: string[]
  scripts: string[]
  contentClasses: string[]
}

export type ImportedHtmlContractIssueCode =
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

export interface ImportedHtmlContractIssue {
  code: ImportedHtmlContractIssueCode
  detail?: string
}

export interface ImportedHtmlContractInspection {
  issues: ImportedHtmlContractIssue[]
  localAssets: string[]
  dataIds: string[]
}

export interface ImportedHtmlContractOptions {
  /** Generated quiz pages from older Studio versions identified their root
   * section with data-id instead of data-section-id. */
  allowSectionDataId?: boolean
}

const STANDARD_ADT_STYLESHEETS = new Set([
  "content/tailwind_output.css",
  "assets/libs/fontawesome/css/all.min.css",
  "assets/fonts.css",
])

const STANDARD_ADT_SCRIPTS = new Set([
  "assets/offline-preloader.js",
  "assets/scorm.js",
  "assets/base.bundle.local.js",
  "assets/base.bundle.min.js",
  "assets/auto-fit.js",
  "assets/activities.bundle.local.js",
])

const STANDARD_ADT_PRESENTATION_ASSETS = new Set([
  ...STANDARD_ADT_STYLESHEETS,
  ...STANDARD_ADT_SCRIPTS,
])

function normalizeImportedResource(value: string): string | null {
  let withoutSuffix = value.trim().split(/[?#]/, 1)[0]
  try { withoutSuffix = decodeURIComponent(withoutSuffix) } catch { return null }
  withoutSuffix = withoutSuffix.replace(/^\.\//, "")
  if (!withoutSuffix || /^(?:[a-z]+:|\/|\\)/i.test(withoutSuffix)) return null
  if (withoutSuffix.split("/").includes("..")) return null
  return withoutSuffix.split("/").filter((part) => part && part !== ".").join("/") || null
}

function isAllowedGoogleFontsLink(tag: string, rel: string, value: string): boolean {
  if (tag !== "link") return false
  if (rel.split(/\s+/).includes("preconnect")) {
    return value === "https://fonts.googleapis.com"
      || value === "https://fonts.gstatic.com"
  }
  return rel.split(/\s+/).includes("stylesheet")
    && /^https:\/\/fonts\.googleapis\.com\/css2\?/i.test(value)
}

/** Validate the stable HTML hooks ADT Studio needs to project an exported page
 * back into pipeline entities. This is deliberately a narrow contract: the
 * importer must reject unsupported page structures instead of guessing. */
export function inspectImportedHtmlContract(
  html: string,
  expectedSectionId: string,
  options: ImportedHtmlContractOptions = {},
): ImportedHtmlContractInspection {
  const doc = parseDocument(html)
  const issues: ImportedHtmlContractIssue[] = []
  const pageDataIds: string[] = []
  const contentRoots = DomUtils.findAll(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
  )
  if (contentRoots.length === 0) issues.push({ code: "missing-content-root" })
  if (contentRoots.length > 1) issues.push({ code: "multiple-content-roots" })

  const matchingSections = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section"
      && (
        el.attribs?.["data-section-id"] === expectedSectionId
        || (options.allowSectionDataId === true && el.attribs?.["data-id"] === expectedSectionId)
      ),
    contentRoots[0]?.children ?? [],
  )
  if (matchingSections.length === 0) issues.push({ code: "missing-section", detail: expectedSectionId })
  if (matchingSections.length > 1) issues.push({ code: "multiple-sections", detail: expectedSectionId })
  const section = matchingSections[0]
  if (section && !section.attribs["data-section-type"]?.trim()) {
    issues.push({ code: "missing-section-type", detail: expectedSectionId })
  }

  if (section) {
    const elements = [section, ...DomUtils.findAll((el) => el.type === "tag", section.children ?? [])]
    const ids = new Set<string>()
    let dataIdCount = 0
    for (const element of elements) {
      if (element.type !== "tag") continue
      const dataId = element.attribs["data-id"]?.trim()
      if (dataId) {
        pageDataIds.push(dataId)
        dataIdCount++
        if (ids.has(dataId)) issues.push({ code: "duplicate-data-id", detail: dataId })
        ids.add(dataId)
      }
      if (
        element.name === "img"
        && !dataId
      ) {
        issues.push({ code: "image-missing-data-id", detail: element.attribs.src ?? "" })
      }
    }
    if (dataIdCount === 0) issues.push({ code: "missing-data-id", detail: expectedSectionId })
  }

  const localAssets = new Set<string>()
  const resourceElements = DomUtils.findAll(
    (el) => (el.type === "tag" || el.type === "script")
      && ["link", "script", "img", "source", "audio", "video"].includes(el.name),
    doc.children,
  )
  for (const element of resourceElements) {
    if (element.type !== "tag" && element.type !== "script") continue
    for (const attribute of element.name === "link"
      ? ["href"]
      : element.name === "video" ? ["src", "poster"] : ["src"]) {
      const value = element.attribs[attribute]?.trim()
      if (!value || value.startsWith("#") || value.startsWith("data:")) continue
      if (/^(?:https?:)?\/\//i.test(value)) {
        if (!isAllowedGoogleFontsLink(element.name, element.attribs.rel ?? "", value)) {
          issues.push({ code: "remote-asset", detail: value })
        }
      } else if (
        /^(?:[a-z]+:|\/|\\)/i.test(value)
        || value.split(/[?#]/, 1)[0].split("/").includes("..")
        || normalizeImportedResource(value) === null
      ) {
        issues.push({ code: "unsafe-asset", detail: value })
      } else {
        const normalized = normalizeImportedResource(value)
        if (!normalized) continue
        localAssets.add(normalized)
        if (
          element.name === "link"
          && (element.attribs.rel ?? "").split(/\s+/).includes("stylesheet")
          && !STANDARD_ADT_STYLESHEETS.has(normalized)
        ) {
          issues.push({ code: "unsupported-stylesheet", detail: value })
        } else if (element.name === "script" && !STANDARD_ADT_SCRIPTS.has(normalized)) {
          issues.push({ code: "unsupported-script", detail: value })
        } else if (
          ["img", "source", "audio", "video"].includes(element.name)
          && !normalized.startsWith("images/")
        ) {
          issues.push({ code: "unsupported-asset-location", detail: value })
        }
      }
    }
  }
  return { issues, localAssets: [...localAssets], dataIds: pageDataIds }
}

export const ADT_EDITING_ALLOWED_ROOT_ENTRIES = new Set([
  "assets",
  "content",
  "images",
  "manifest.json",
  "index.html",
  "cover.png",
  "cover.jpg",
  "cover.jpeg",
  "cover.webp",
  "AGENTS.md",
  "CLAUDE.md",
  "imsmanifest.xml",
  ".DS_Store",
  "Thumbs.db",
  "__MACOSX",
])

function normalizeLocalPresentationAsset(value: string): string | null {
  const withoutSuffix = value.trim().split(/[?#]/, 1)[0].replace(/^\.\//, "")
  if (!withoutSuffix || /^(?:[a-z]+:|\/|\\)/i.test(withoutSuffix)) return null
  if (withoutSuffix.split("/").includes("..")) return null
  const normalized = withoutSuffix.split("/").reduce<string[]>((parts, part) => {
    if (!part || part === ".") return parts
    parts.push(part)
    return parts
  }, []).join("/")
  if (!normalized || normalized.startsWith("../") || STANDARD_ADT_PRESENTATION_ASSETS.has(normalized)) {
    return null
  }
  return normalized
}

/** Find local, non-runtime stylesheets and scripts linked by an imported ADT
 * page. These are presentation dependencies, not canonical book data. */
export function extractImportedHtmlPresentationAssets(
  html: string,
): ImportedHtmlPresentationAssets {
  const doc = parseDocument(html)
  const stylesheets = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "link"
      && (el.attribs?.rel ?? "").split(/\s+/).includes("stylesheet"),
    doc.children,
  ).map((el) => normalizeLocalPresentationAsset(el.attribs.href ?? ""))
    .filter((value): value is string => value !== null)
  const scripts = DomUtils.findAll(
    (el) => el.type === "script" && Boolean(el.attribs?.src),
    doc.children,
  ).map((el) => normalizeLocalPresentationAsset(el.attribs.src ?? ""))
    .filter((value): value is string => value !== null)
  const contentRoot = DomUtils.findOne(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
    true,
  )
  const contentClasses = (contentRoot?.attribs?.class ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((className) => !/[<>"'`=\s]/.test(className))
    // Exported pages hide #content until their runtime finishes loading. The
    // editor and screenshot renderer do not execute that runtime, so retaining
    // these transient classes would make otherwise valid imported pages blank.
    .filter((className) => !["opacity-0", "invisible", "hidden"].includes(className))
  return {
    stylesheets: [...new Set(stylesheets)],
    scripts: [...new Set(scripts)],
    contentClasses: [...new Set(contentClasses)],
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

function removeExecutableImportedMarkup(section: ReturnType<typeof DomUtils.findOne>): void {
  if (!section) return
  const executable = DomUtils.findAll(
    (el) => (el.type === "tag" || el.type === "script")
      && ["script", "iframe", "object", "embed", "base", "meta", "link"].includes(el.name ?? ""),
    section.children ?? [],
  )
  executable.forEach((element) => DomUtils.removeElement(element))

  const elements = [section, ...DomUtils.findAll(
    (el) => el.type === "tag",
    section.children ?? [],
  )]
  for (const element of elements) {
    if (element.type !== "tag") continue
    for (const [name, value] of Object.entries(element.attribs)) {
      if (/^on/i.test(name)) {
        delete element.attribs[name]
        continue
      }
      if (
        ["src", "href", "xlink:href", "action", "formaction"].includes(name.toLowerCase())
        && /^\s*(?:javascript:|data:text\/html)/i.test(value)
      ) {
        delete element.attribs[name]
      }
      if (name.toLowerCase() === "style" && /(?:expression\s*\(|javascript:)/i.test(value)) {
        delete element.attribs[name]
      }
    }
  }
}

/**
 * Normalize one exported ADT page document into the same section fragment and
 * minimal semantic leaves used by the regular Storyboard pipeline. The HTML
 * remains authoritative; the semantic tree is an adapter for features such as
 * TOC, Easy Read, quizzes, and the existing section editor.
 */
export function projectImportedHtmlSection(
  html: string,
  expectedSectionId: string,
  imageUrlPrefix?: string,
  options: ImportedHtmlProjectionOptions = {},
): ImportedHtmlSectionProjection {
  const doc = parseDocument(html)
  const sections = DomUtils.findAll(
    (el) => el.type === "tag" && el.name === "section",
    doc.children,
  )
  const section = sections.find((el) => el.attribs?.["data-section-id"] === expectedSectionId)
    ?? sections[0]
  if (!section) {
    const contentRoot = DomUtils.findOne(
      (el) => el.type === "tag" && el.attribs?.id === "content",
      doc.children,
      true,
    )
    const body = DomUtils.findOne(
      (el) => el.type === "tag" && el.name === "body",
      doc.children,
      true,
    )
    const content = contentRoot
      ? DomUtils.getInnerHTML(contentRoot)
      : body ? DomUtils.getInnerHTML(body) : DomUtils.getInnerHTML(doc)
    return projectImportedHtmlSection(
      `<section data-section-id="${escapeHtmlAttribute(expectedSectionId)}" data-section-type="content">${content}</section>`,
      expectedSectionId,
      imageUrlPrefix,
      options,
    )
  }

  section.attribs["data-section-id"] = expectedSectionId
  removeExecutableImportedMarkup(section)
  const sectionType = section.attribs["data-section-type"]?.trim() || "content"
  section.attribs["data-section-type"] = sectionType

  if (options.repairLegacyIds) {
    const elements = [section, ...DomUtils.findAll(
      (el) => el.type === "tag",
      section.children ?? [],
    )]
    const used = new Set<string>()
    for (const element of elements) {
      if (element.type !== "tag") continue
      const dataId = element.attribs["data-id"]?.trim()
      if (!dataId) continue
      if (used.has(dataId)) {
        let copy = 2
        while (used.has(`${dataId}_copy${copy}`)) copy++
        const repairedId = `${dataId}_copy${copy}`
        element.attribs["data-id"] = repairedId
        used.add(repairedId)
      } else {
        used.add(dataId)
      }
    }
    for (const element of elements) {
      if (element.type !== "tag" || element.name !== "img" || element.attribs["data-id"]) continue
      const source = element.attribs.src?.split(/[?#]/, 1)[0] ?? ""
      let decoded = source
      try { decoded = decodeURIComponent(source) } catch { /* keep the literal source */ }
      const fileName = decoded.split("/").pop() ?? ""
      const imageId = fileName.replace(/\.[a-zA-Z0-9]+$/, "")
      if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(imageId) && !used.has(imageId)) {
        element.attribs["data-id"] = imageId
        used.add(imageId)
      }
    }
  }

  const leaves = DomUtils.findAll(
    (el) =>
      el.type === "tag" &&
      el.attribs?.["data-id"] !== undefined &&
      !DomUtils.findOne(
        (child) => child.type === "tag" && child.attribs?.["data-id"] !== undefined,
        el.children ?? [],
        true,
      ),
    section.children ?? [],
  )
  const nodes: ContentNodeData[] = []
  const images: ImportedHtmlImageReference[] = []
  const seen = new Set<string>()
  for (const el of leaves) {
    const nodeId = el.attribs["data-id"]?.trim()
    if (!nodeId || seen.has(nodeId)) continue
    seen.add(nodeId)

    if (el.name === "img") {
      const src = el.attribs.src ?? ""
      const alt = (el.attribs.alt ?? "").trim()
      const decorative = el.attribs["aria-hidden"] === "true" || el.attribs.role === "presentation"
      images.push({ imageId: nodeId, src, alt, decorative })
      nodes.push({ nodeId, role: "image", isPruned: false })
      if (imageUrlPrefix) el.attribs.src = `${imageUrlPrefix}/${encodeURIComponent(nodeId)}`
      continue
    }

    const text = textContentExcludingScripts(el).replace(/\s+/g, " ").trim()
    if (!text) continue
    let cursor = el as typeof el | null
    let heading = false
    while (cursor) {
      if (/^h[1-6]$/i.test(cursor.name ?? "")) {
        heading = true
        break
      }
      if (cursor === section) break
      cursor = cursor.parent?.type === "tag" ? cursor.parent : null
    }
    nodes.push({
      nodeId,
      role: heading ? "heading" : "text",
      text,
      isPruned: false,
    })
  }

  return {
    html: DomUtils.getOuterHTML(section),
    sectionType,
    nodes,
    images,
  }
}

/**
 * Extract text catalog entries from a single page's rendered HTML sections.
 * Walks the DOM looking for elements with data-id attributes.
 * - Non-img elements: extract text content
 * - img elements: look up caption from image-captioning node
 * - activity_gen_* elements: reassign to {pageId}_ac{NNN}
 */
function extractPageEntries(
  pageId: string,
  rendering: WebRenderingOutput,
  captionMap: Map<string, string>,
  prunedSectionIndices?: Set<number>,
  sectioning?: PageSectioningOutputType
): TextCatalogEntry[] {
  const entries: TextCatalogEntry[] = []
  let activityCounter = 0

  for (const section of rendering.sections) {
    if (prunedSectionIndices?.has(section.sectionIndex)) continue

    const doc = parseDocument(section.html)

    // Only catalog leaves of the data-id tree. A wrapper element with a
    // data-id whose descendants also have data-ids would otherwise emit an
    // entry whose text is the concatenation of every leaf — and a translation
    // replacing that wrapper's innerHTML at runtime would wipe the leaves'
    // structure. Custom-activity sections in particular put data-id on both
    // the outer <section> and inner text elements; leaves-only handles them
    // correctly without a section-type special case.
    const elements = DomUtils.findAll(
      (el) =>
        el.type === "tag" &&
        el.attribs?.["data-id"] !== undefined &&
        !DomUtils.findOne(
          (child) =>
            child.type === "tag" && child.attribs?.["data-id"] !== undefined,
          el.children ?? [],
          true,
        ),
      doc.children,
    )

    for (const el of elements) {
      const dataId = el.attribs["data-id"]
      const isImg = el.name === "img"

      if (isImg) {
        // Look up caption for this image
        const caption = captionMap.get(dataId)
        if (caption) {
          entries.push({ id: dataId, text: caption })
        }
      } else {
        // Reassign activity_gen_* IDs to stable page-scoped IDs
        const id = dataId.startsWith("activity_gen_")
          ? `${pageId}_ac${pad3(++activityCounter)}`
          : dataId

        // Belt-and-braces: even for non-custom sections, exclude any inline
        // <script>/<style> bodies from the catalogued text. Authors shouldn't
        // be using them here, but a stray bit of inline JS shouldn't corrupt
        // the catalog.
        const text = textContentExcludingScripts(el).replace(/\s+/g, " ").trim()
        if (text.length > 0) {
          entries.push({ id, text })
        }
      }
    }

    // Emit activity answer entries so they appear in the text catalog
    // for viewing, editing, and translation
    entries.push(...extractAnswerEntries(pageId, section, sectioning))
  }

  return entries
}

/**
 * Extract activity answer entries from a section's activityAnswers.
 * Uses the sectionId from sectioning data for unique catalog IDs.
 */
function extractAnswerEntries(
  pageId: string,
  section: SectionRendering,
  sectioning?: PageSectioningOutputType
): TextCatalogEntry[] {
  const answers = section.activityAnswers
  if (!answers || Object.keys(answers).length === 0) return []

  const sectionId =
    sectioning?.sections[section.sectionIndex]?.sectionId ??
    `${pageId}_sec${pad3(section.sectionIndex + 1)}`

  const entries: TextCatalogEntry[] = []
  for (const [key, value] of Object.entries(answers)) {
    const text = String(value)
    if (text.length > 0) {
      entries.push({ id: `${sectionId}_ans_${key}`, text })
    }
  }
  return entries
}

/**
 * Build a caption lookup map from the image-captioning node for a page.
 */
function loadCaptionMap(
  storage: Storage,
  pageId: string
): Map<string, string> {
  const map = new Map<string, string>()
  const row = storage.getLatestNodeData("image-captioning", pageId)
  if (!row) return map

  const data = row.data as ImageCaptioningOutput
  if (data.captions) {
    for (const caption of data.captions) {
      map.set(caption.imageId, caption.caption)
    }
  }
  return map
}

/**
 * Build glossary entries from the glossary node.
 */
function buildGlossaryEntries(storage: Storage): TextCatalogEntry[] {
  const row = storage.getLatestNodeData("glossary", "book")
  if (!row) return []

  const data = row.data as GlossaryOutput
  if (!data.items) return []

  const entries: TextCatalogEntry[] = []
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    if (item.pruned) continue
    const id = getGlossaryItemTextId(item, i)
    entries.push({ id, text: item.word })
    entries.push({ id: `${id}_def`, text: item.definition })
  }
  return entries
}

/**
 * Build quiz entries from the quiz-generation node.
 */
function buildQuizEntries(storage: Storage): TextCatalogEntry[] {
  const row = storage.getLatestNodeData("quiz-generation", "book")
  if (!row) return []

  const data = row.data as QuizGenerationOutput
  if (!data.quizzes) return []

  const entries: TextCatalogEntry[] = []
  for (let i = 0; i < data.quizzes.length; i++) {
    const quiz = data.quizzes[i]
    const qid = `qz${pad3(i + 1)}`
    entries.push({ id: `${qid}_que`, text: quiz.question })

    for (let j = 0; j < quiz.options.length; j++) {
      const option = quiz.options[j]
      entries.push({ id: `${qid}_o${j}`, text: option.text })
      entries.push({ id: `${qid}_o${j}_exp`, text: option.explanation })
    }
  }
  return entries
}

/**
 * Build a complete text catalog from all pipeline outputs.
 * Gathers text from rendered pages, image captions, glossary, and quizzes.
 * No LLM calls — purely reads existing node data.
 */
export async function buildTextCatalog(
  storage: Storage,
  pages: PageData[]
): Promise<TextCatalogOutput> {
  const entries: TextCatalogEntry[] = []

  // Page text + image captions
  for (const page of pages) {
    const renderingRow = storage.getLatestNodeData("web-rendering", page.pageId)
    if (!renderingRow) continue

    const parsed = WebRenderingOutputSchema.safeParse(renderingRow.data)
    if (!parsed.success) continue

    // Determine which sections are pruned. Use the render-sectioning resolver
    // so fixed-layout books read the positioned tree whose ids/section count
    // match the rendered HTML (1 section/page), not the semantic tree.
    const sectioning = getRenderSectioning(storage, page.pageId)
    const prunedIndices = new Set<number>()
    if (sectioning) {
      sectioning.sections.forEach((s: { isPruned: boolean }, i: number) => {
        if (s.isPruned) prunedIndices.add(i)
      })
    }

    const captionMap = loadCaptionMap(storage, page.pageId)
    entries.push(...extractPageEntries(
      page.pageId,
      parsed.data,
      captionMap,
      prunedIndices,
      sectioning
    ))

    // Yield to event loop so the server stays responsive during large books
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  // Glossary
  entries.push(...buildGlossaryEntries(storage))

  // Quizzes
  entries.push(...buildQuizEntries(storage))

  return {
    entries,
    generatedAt: new Date().toISOString(),
  }
}

import { resolveQuizOptionId } from "@adt/types"
import { extractImageIds } from "./image-captioning.js"
import { parseDocument, DomUtils } from "htmlparser2"
import type {
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
  answerTextId,
  resolveQuizId,
  withResolvedQuizIds,
} from "@adt/types"
import type { Storage, PageData } from "@adt/storage"
import { getGlossaryItemTextId } from "./glossary.js"
import { withLegacyRenderingOwnership, getRenderSectioning, renderedSectionId, resolveRenderedSection } from "./render-sectioning.js"
import { pad3, textContentExcludingScripts } from "./html-text.js"

/**
 * Recover the stable text entries embedded in an exported ADT HTML page.
 *
 * Exported pages are already the user's authoritative, possibly hand-edited
 * source. Keeping this extractor beside the pipeline catalog builder ensures
 * recovered bundle workspaces follow the same leaf `data-id` semantics as a
 * project generated inside Studio. Image alternative text is the exported
 * representation of an image caption, so it is recovered as catalog text too.
 */
function exportedLeafElements(html: string) {
  const doc = parseDocument(html)
  const contentRoot = DomUtils.findOne(
    (el) => el.type === "tag" && el.attribs?.id === "content",
    doc.children,
    true,
  )
  return DomUtils.findAll(
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
}

/**
 * The catalog ids `extractTextCatalogEntriesFromHtml` gives a page's generated
 * activity leaves (`activity_gen_*` → `pg001_ac001`), keyed by their data-id.
 * An import writes them into the stored HTML so the recovered catalog, its
 * translations and its audio keep naming the same leaves.
 */
export function exportedActivityCatalogIds(html: string, pageId: string): Map<string, string> {
  const ids = new Map<string, string>()
  let activityCounter = 0
  for (const el of exportedLeafElements(html)) {
    const dataId = el.attribs["data-id"]
    if (!dataId.startsWith("activity_gen_")) continue
    const id = `${pageId}_ac${pad3(++activityCounter)}`
    if (!ids.has(dataId)) ids.set(dataId, id)
  }
  return ids
}

/**
 * The catalog text of one leaf element. Plain text is its text content. Text containing math is different:
 * export converted its LaTeX to MathML in both the page HTML and `texts.json`,
 * so flattening the `<math>` markup to text content ("35=35⋅55") would make
 * every formula look edited. Such text is reproduced in the exporter's own
 * MathML form instead — prose as text, `<math>` subtrees as markup with
 * `&`/`<`/`>` escaped — and only ASCII whitespace is collapsed, because MathML
 * spacing uses non-breaking spaces.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportedElementText(el: any): string {
  const hasMath = DomUtils.findOne(
    (child) => child.type === "tag" && child.name.toLowerCase() === "math",
    el.children ?? [],
    true,
  ) !== null
  if (!hasMath) return textContentExcludingScripts(el).replace(/\s+/g, " ").trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = el.children ?? []
  return children.map((child) => serializeMathAwareText(child, false)).join("")
    .replace(/[ \t\n\r\f]+/g, " ")
    .replace(/^ +| +$/g, "")
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeMathAwareText(node: any, inMath: boolean): string {
  if (node.type === "text") return inMath ? escapeMathText(node.data ?? "") : node.data ?? ""
  const name = String(node.name ?? "").toLowerCase()
  if (name === "script" || name === "style") return ""
  const math = inMath || name === "math"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = (node.children ?? []).map((child: any) => serializeMathAwareText(child, math)).join("")
  if (!math) return inner
  const attributes = Object.entries((node.attribs ?? {}) as Record<string, string>)
    .map(([key, value]) => ` ${key}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`)
    .join("")
  return `<${node.name}${attributes}>${inner}</${node.name}>`
}

function escapeMathText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function extractTextCatalogEntriesFromHtml(html: string, pageId?: string): TextCatalogEntry[] {
  const elements = exportedLeafElements(html)

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

    const text = el.name === "img"
      ? (el.attribs.alt ?? "").replace(/\s+/g, " ").trim()
      : exportedElementText(el)
    if (text.length > 0) entries.push({ id, text })
  }
  return entries
}


/**
 * Extract text catalog entries from a single page's rendered HTML sections.
 * Walks the DOM looking for elements with data-id attributes.
 * - Non-img elements: extract text content
 * - img elements: look up caption from image-captioning node
 * - legacy activity_gen_* elements: scope to their stable owning section
 */
function extractPageEntries(
  pageId: string,
  rendering: WebRenderingOutput,
  captionMap: Map<string, string>,
  sectioning?: PageSectioningOutputType
): TextCatalogEntry[] {
  const entries: TextCatalogEntry[] = []

  for (const section of [...rendering.sections].sort((a, b) => a.sectionIndex - b.sectionIndex)) {
    const owner = resolveRenderedSection(section, sectioning?.sections, rendering.sections)
    // Match reader eligibility before deduplication: retained, omitted HTML
    // must never supply a live owner's text or certify its downstream outputs.
    if (!owner || owner.isPruned) continue

    const doc = parseDocument(section.html)
    const sectionId = renderedSectionId(section)
    const location = { pageId, sectionId }

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
          entries.push({ id: dataId, text: caption, locations: [{ ...location, role: "caption" }] })
        }
      } else {
        // Never assign catalog identities by reading position. New generated
        // activity IDs are persisted before planning; legacy IDs are scoped by
        // their owning section and cannot inherit positional corrections.
        if (dataId.startsWith("activity_gen_") && !sectionId) continue
        const id = dataId.startsWith("activity_gen_")
          ? `${sectionId ?? pageId}__${dataId}`
          : dataId

        // Belt-and-braces: even for non-custom sections, exclude any inline
        // <script>/<style> bodies from the catalogued text. Authors shouldn't
        // be using them here, but a stray bit of inline JS shouldn't corrupt
        // the catalog. Rendered math is kept as MathML rather than
        // flattened: pages rendered from Studio carry LaTeX text here, but a
        // book imported from an ADT stores the exported MathML, and the reader
        // swaps each element's content for its catalog text.
        const text = exportedElementText(el)
        if (text.length > 0) {
          entries.push({ id, text, locations: [{ ...location, role: el.name }] })
        }
      }
    }

    // Emit activity answer entries so they appear in the text catalog
    // for viewing, editing, and translation
    entries.push(...extractAnswerEntries(pageId, section))
  }

  return entries
}

/**
 * Extract activity answer entries from a section's activityAnswers.
 * Uses the sectionId from sectioning data for unique catalog IDs.
 */
function extractAnswerEntries(
  pageId: string,
  section: SectionRendering
): TextCatalogEntry[] {
  const answers = section.activityAnswers
  if (!answers || Object.keys(answers).length === 0) return []

  // sectionIds are allocated once and never reused, so they cannot be derived
  // from an array position. With no sectioning row to read the real id from,
  // a guessed `_secNNN` would likely belong to a *different* section — and
  // these ids key the answers' translations and generated audio. Skip instead.
  const sectionId = renderedSectionId(section)
  if (!sectionId) return []

  const entries: TextCatalogEntry[] = []
  for (const [key, value] of Object.entries(answers)) {
    const text = String(value)
    if (text.length > 0) {
      entries.push({ id: answerTextId(sectionId, key.startsWith("activity_gen_") ? `${sectionId}__${key}` : key), text, locations: [{ pageId, sectionId, role: "answer" }] })
    }
  }
  return entries
}

/**
 * Build a caption lookup map from the image-captioning node for a page.
 */
function loadCaptionMap(
  storage: Storage,
  pageId: string,
  imageIds: string[],
): Map<string, string> {
  const map = new Map<string, string>()
  const byOwner = new Map<string, ImageCaptioningOutput | undefined>()
  for (const id of imageIds) {
    const owner = storage.getImageMeta?.(id)?.pageId ?? pageId
    if (!byOwner.has(owner)) byOwner.set(owner, storage.getLatestNodeData("image-captioning", owner)?.data as ImageCaptioningOutput | undefined)
    const caption = byOwner.get(owner)?.captions?.find((entry) => entry.imageId === id)
    if (caption) map.set(id, caption.decorative ? "" : caption.caption)
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
    entries.push({ id, text: item.word, locations: [{ group: "glossary", role: "word" }] })
    entries.push({ id: `${id}_def`, text: item.definition, locations: [{ group: "glossary", role: "definition" }] })
    // Glossary images require captions in the inventory, but glossary output
    // has no caption text/audio consumer. Storyboard references add those.
  }
  return entries
}

/**
 * Build quiz entries from the quiz-generation node.
 */
function buildQuizEntries(storage: Storage): TextCatalogEntry[] {
  const row = storage.getLatestNodeData("quiz-generation", "book")
  if (!row) return []

  const stored = row.data as QuizGenerationOutput
  if (!stored.quizzes) return []
  const data = withResolvedQuizIds(stored)

  const entries: TextCatalogEntry[] = []
  for (let i = 0; i < data.quizzes.length; i++) {
    const quiz = data.quizzes[i]
    const qid = resolveQuizId(quiz, i)
    entries.push({ id: `${qid}_que`, text: quiz.question, locations: [{ group: "quizzes", role: "question" }] })

    for (let j = 0; j < quiz.options.length; j++) {
      const option = quiz.options[j]
      entries.push({ id: resolveQuizOptionId(option, qid, j), text: option.text, locations: [{ group: "quizzes", role: "option" }] })
      entries.push({ id: `${resolveQuizOptionId(option, qid, j)}_exp`, text: option.explanation, locations: [{ group: "quizzes", role: "explanation" }] })
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
  return buildTextCatalogSnapshot(storage, pages)
}

/** Cosmetic edits may retain a legacy conflict, but must not introduce a new
 * divergent value under an existing identity. Shared by editor and assistant. */
export function findIntroducedCatalogConflict(
  before: TextCatalogOutput["conflicts"],
  after: TextCatalogOutput["conflicts"],
) {
  return after?.find(conflict => !before?.some(previous => previous.id === conflict.id && conflict.texts.every(text => previous.texts.includes(text))))
}

/** Synchronous snapshot for atomic authored-save/catalog reconciliation. */
export function buildTextCatalogSnapshot(storage: Storage, pages: PageData[]): TextCatalogOutput {
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

    const captionMap = loadCaptionMap(storage, page.pageId, extractImageIds(parsed.data.sections.map((section) => section.html)))
    entries.push(...extractPageEntries(
      page.pageId,
      withLegacyRenderingOwnership(storage, page.pageId, parsed.data),
      captionMap,
      sectioning
    ))

  }

  // Glossary
  entries.push(...buildGlossaryEntries(storage))

  // Quizzes
  entries.push(...buildQuizEntries(storage))

  const byId = new Map<string, TextCatalogEntry>()
  for (const entry of entries) {
    const previous = byId.get(entry.id)
    if (previous) previous.locations = [...(previous.locations ?? []), ...(entry.locations ?? [])]
    else byId.set(entry.id, entry)
  }
  const texts = new Map<string, Set<string>>()
  for (const entry of entries) {
    const values = texts.get(entry.id) ?? new Set<string>()
    values.add(entry.text)
    texts.set(entry.id, values)
  }
  const conflicts = [...texts].filter(([, values]) => values.size > 1).map(([id, values]) => ({
    id, texts: [...values], locations: byId.get(id)!.locations,
    pageIds: [...new Set(byId.get(id)!.locations?.flatMap((location) => location.pageId ? [location.pageId] : []) ?? [])],
    sectionIds: [...new Set(byId.get(id)!.locations?.flatMap((location) => location.sectionId ? [location.sectionId] : []) ?? [])],
  }))
  return {
    entries: [...byId.values()],
    generatedAt: new Date().toISOString(),
    ...(conflicts.length ? { conflicts } : {}),
  }
}

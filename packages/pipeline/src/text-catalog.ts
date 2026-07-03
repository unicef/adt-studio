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
  PageSectioningOutput,
} from "@adt/types"
import type { Storage, PageData } from "@adt/storage"
import { getGlossaryItemTextId } from "./glossary.js"

/** Zero-padded 3-digit number */
function pad3(n: number): string {
  return String(n).padStart(3, "0")
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

    const elements = DomUtils.findAll(
      (el) => el.type === "tag" && el.attribs?.["data-id"] !== undefined,
      doc.children
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

        const text = DomUtils.textContent(el).replace(/\s+/g, " ").trim()
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

    // Determine which sections are pruned
    const structuringRow = storage.getLatestNodeData("page-sectioning", page.pageId)
    const structuringParsed = structuringRow
      ? PageSectioningOutput.safeParse(structuringRow.data)
      : null
    const prunedIndices = new Set<number>()
    if (structuringParsed?.success) {
      structuringParsed.data.sections.forEach((s: { isPruned: boolean }, i: number) => {
        if (s.isPruned) prunedIndices.add(i)
      })
    }

    const captionMap = loadCaptionMap(storage, page.pageId)
    entries.push(...extractPageEntries(
      page.pageId,
      parsed.data,
      captionMap,
      prunedIndices,
      structuringParsed?.success ? structuringParsed.data : undefined
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

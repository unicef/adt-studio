import { parseDocument, DomUtils } from "htmlparser2"
import type { Storage } from "@adt/storage"
import { answerTextId, formatQuizId, resolveQuizOptionId, type GlossaryItem, type QuizOption } from "@adt/types"

export function getGlossaryItemTextId(item: Pick<GlossaryItem, "id">, index: number): string {
  return item.id?.trim() || `gl${String(index + 1).padStart(3, "0")}`
}

/** Includes empty controls and containers: they may already have retained
 * answers or become text leaves after an edit. Images remain shareable. */
export function renderedTextIds(html: string): string[] {
  return DomUtils.findAll(element => element.type === "tag" && element.name !== "img" && !!element.attribs["data-id"], parseDocument(html).children)
    .map(element => element.attribs["data-id"])
}

/** Existing local source/rendering IDs may be edited without changing identity. */
export function sourceTextIds(value: unknown): Set<string> {
  const ids = new Set<string>()
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object") return
    const data = item as Record<string, unknown>
    if (typeof data.nodeId === "string" && data.role !== "image") ids.add(data.nodeId)
    if (typeof data.html === "string") for (const id of renderedTextIds(data.html)) ids.add(id)
    for (const child of Object.values(data)) visit(child)
  }
  visit(value)
  return ids
}

/** Book-wide reservation, including retired pages and source-less retained
 * outputs. Read leniently so an old schema cannot give away an identity.
 * This reads JSON/HTML only, never media files or provider responses. */
export function collectSpentContentIds(storage: Storage): Set<string> {
  const spent = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value) return
    spent.add(value)
    // The derived slot belongs to its source even before Easy Read exists.
    // Reserve the reverse as well: a fresh source must not claim an already
    // occupied derived slot when Easy Read is requested later.
    if (value.endsWith("_easy_read")) spent.add(value.slice(0, -"_easy_read".length))
    spent.add(`${value}_easy_read`)
  }
  const collect = (value: unknown): void => {
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      if (["nodeId", "sectionId", "id", "sourceId", "easyReadId", "textId", "imageId", "optionId"].includes(key)) add(child)
      collect(child)
    }
  }
  for (const page of storage.getPages()) for (const image of storage.getPageImages(page.pageId)) add(image.imageId)
  const nodes = ["page-sectioning", "fixed-layout-sectioning", "web-rendering", "glossary", "quiz-generation", "text-catalog", "text-catalog-translation", "core-tts-catalog", "easy-read", "tts", "tts-timestamps", "word-timestamps", "image-captioning"]
  for (const node of nodes) for (const itemId of storage.getNodeItemIds(node)) {
    for (const row of storage.getAllNodeVersions(node, itemId)) {
      collect(row.data)
      if (!row.data || typeof row.data !== "object") continue
      const data = row.data as Record<string, unknown>
      if (node === "glossary" && Array.isArray(data.items)) data.items.forEach((item, index) => {
        if (!item || typeof item !== "object") return
        const id = getGlossaryItemTextId({ id: typeof item.id === "string" ? item.id : undefined }, index)
        add(id); add(`${id}_def`)
      })
      if (node === "quiz-generation" && Array.isArray(data.quizzes)) data.quizzes.forEach((quiz, index) => {
        if (!quiz || typeof quiz !== "object") return
        const id = typeof quiz.quizId === "string" ? quiz.quizId : formatQuizId(index + 1)
        add(`${id}_que`)
        if (Array.isArray(quiz.options)) (quiz.options as unknown[]).forEach((option, i) => {
          if (!option || typeof option !== "object") return
          const optionId = "optionId" in option && typeof option.optionId === "string" ? option.optionId : resolveQuizOptionId(option as QuizOption, id, i)
          add(optionId); add(`${optionId}_exp`)
        })
      })
      if (node === "web-rendering" && Array.isArray(data.sections)) for (const section of data.sections) {
        if (!section || typeof section !== "object") continue
        const doc = parseDocument(typeof section.html === "string" ? section.html : "")
        const elements = DomUtils.findAll(element => element.type === "tag", doc.children)
        const owners = new Set<string>(elements.flatMap(element => element.attribs["data-section-id"] ? [element.attribs["data-section-id"]] : []))
        if (typeof section.sectionId === "string") owners.add(section.sectionId)
        for (const element of elements) {
          const id = element.attribs["data-id"]
          add(id)
          if (id?.startsWith("activity_gen_")) for (const owner of owners) add(`${owner}__${id}`)
        }
        if (section.activityAnswers && typeof section.activityAnswers === "object") {
          for (const key of Object.keys(section.activityAnswers)) for (const owner of owners) {
            add(answerTextId(owner, key.startsWith("activity_gen_") ? `${owner}__${key}` : key))
          }
        }
      }
    }
  }
  return spent
}

/** A single draft can introduce both sides of a collision before either ID is
 * in history. Preserve unchanged legacy pairs, reject every new pair. */
export function findIntroducedDerivedIdCollision(proposed: Iterable<string>, previous: Iterable<string>): string | undefined {
  const next = new Set(proposed)
  const prior = new Set(previous)
  for (const id of next) {
    const derived = `${id}_easy_read`
    if (next.has(derived) && (!prior.has(id) || !prior.has(derived))) return derived
  }
  return undefined
}

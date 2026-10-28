/** Read-only experiment: grouping never changes section ownership or saved HTML. */
import { parseDocument, DomUtils } from "htmlparser2"
import { answerTextId, type AppConfig, type SectionRendering } from "@adt/types"
import type { Storage } from "@adt/storage"
import type { ResolvedItem } from "./reading-order.js"
import { readEditableActivities, enabledEditableActivity } from "./render-editable-activity.js"
import { escapeAttr } from "./html-escape.js"

const supported = new Set([
  "activity_multiple_choice", "activity_multi_select", "activity_true_false",
  "activity_fill_in_the_blank", "activity_fill_in_a_table", "activity_open_ended_answer",
  "activity_matching", "activity_sorting", "activity_ordering", "activity_underline_text",
])

export function groupExperimentalActivityPages(
  storage: Storage, items: ResolvedItem[], config?: AppConfig,
): ResolvedItem[][] {
  const mode = config?.page_sectioning?.experimental_activity_pages
  if (!mode || mode === "off" || config?.generate_activities === false) return items.map(item => [item])
  const runs: ResolvedItem[][] = []
  for (const item of items) {
    const last = runs.at(-1)
    if (item.kind === "section" && last?.[0].kind === "section" && last[0].pageId === item.pageId) last.push(item)
    else runs.push([item])
  }
  return runs.flatMap(run => {
    const canGroup = run.length > 1 && run.some(item => item.kind === "section" && supported.has(item.section.sectionType)) &&
      run.every(item => item.kind === "section" && !item.section.viewport &&
        (!item.section.sectionType.startsWith("activity_") || supported.has(item.section.sectionType)) &&
        !/<(?:script|style)\b/i.test(item.rendering.html) &&
        !enabledEditableActivity(readEditableActivities(storage, item.pageId), item.sectionIndex, item.rendering.sectionType))
    return canGroup ? [run] : run.map(item => [item])
  })
}

/** Namespace only presentation IDs. Authored data-id and activity keys retain ownership. */
export function wrapExperimentalActivityBlock(rendering: SectionRendering, sectionId: string): string {
  const doc = parseDocument(rendering.html)
  const elements = DomUtils.findAll(el => el.type === "tag", doc.children)
  const ids = new Map(elements.filter(el => el.attribs.id).map(el => [el.attribs.id, `${sectionId}--${el.attribs.id}`]))
  for (const el of elements) {
    if (el.attribs.id) el.attribs.id = ids.get(el.attribs.id)!
    for (const attr of ["for", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
      if (el.attribs[attr]) el.attribs[attr] = el.attribs[attr].split(/\s+/).map(id => ids.get(id) ?? id).join(" ")
    }
    for (const attr of ["href", "xlink:href"]) {
      if (el.attribs[attr]?.startsWith("#")) el.attribs[attr] = `#${ids.get(el.attribs[attr].slice(1)) ?? el.attribs[attr].slice(1)}`
    }
    for (const [attr, value] of Object.entries(el.attribs)) {
      el.attribs[attr] = value.replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${ids.get(id) ?? id})`)
    }
    if (el.name === "input" && el.attribs.name) el.attribs.name = `${sectionId}--${el.attribs.name}`
    // Fragments generated as standalone screens may reserve a full viewport.
    if (el.name === "section") el.attribs.style = `${el.attribs.style ?? ""};min-height:0`
  }
  const answers = rendering.activityAnswers ?? {}
  const textIds = Object.fromEntries(Object.entries(answers)
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key]) => [key, answerTextId(sectionId, key.startsWith("activity_gen_") ? `${sectionId}__${key}` : key)]))
  return `<div id="${escapeAttr(sectionId)}" data-activity-block="${escapeAttr(sectionId)}" data-block-answers="${escapeAttr(JSON.stringify(answers))}" data-block-answer-text-ids="${escapeAttr(JSON.stringify(textIds))}">${DomUtils.getOuterHTML(doc)}</div>`
}

export function experimentalActivityPageContent(blocks: string[], mode: "page" | "section"): string {
  return `<div data-experimental-activity-page="${mode}" class="flex flex-col gap-6 w-full max-w-5xl mx-auto px-4 pt-6 pb-40">${blocks.join("\n")}</div>`
}

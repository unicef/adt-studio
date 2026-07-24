/**
 * Activity outline builder — a type-agnostic grouping index for the studio's
 * classic-activity editor. Combines two deterministic sources:
 *
 * 1. The section tree's semantic roles (`heading`, `label`,
 *    `activity_instruction`, `activity_number`, …) organize the header and
 *    classify texts.
 * 2. The rendered HTML locates the answer fields (text inputs, textareas,
 *    radios, checkboxes) and correlates them with the page's texts through
 *    card ancestry: the smallest wrapper that contains exactly one answer
 *    unit is that unit's visual card, and the `data-id` texts inside it are
 *    its prompts.
 *
 * The outline is purely organizational — every edit still flows through the
 * data-id / item-id channels, so a wrong outline can only mis-group the
 * editor display, never corrupt content. Pure function, no LLM call.
 */
import {
  ActivityOutline,
  ActivityOutlineItem,
  ActivityOutlineOption,
  ActivityOutlineText,
  ContentNodeData,
} from "@adt/types"
import {
  attr,
  buildOrderIndex,
  extractTitle,
  findActivitySection,
  findAll,
  hasAncestor,
  hasClass,
  isIndexLabel,
  tag,
  text,
} from "./extract-editable-activity.js"

// htmlparser2 node type, mirroring extract-editable-activity.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any

const TITLE_ROLES = new Set(["heading", "header", "title"])

/** nodeId → role for every unpruned leaf of the section tree. */
function collectLeafRoles(nodes: ContentNodeData[] | undefined): Map<string, string> {
  const map = new Map<string, string>()
  const walk = (ns: ContentNodeData[]) => {
    for (const n of ns) {
      if (n.isPruned) continue
      if (n.children) walk(n.children)
      else if (n.role) map.set(n.nodeId, n.role)
    }
  }
  if (nodes) walk(nodes)
  return map
}

/** An answer unit: one writable field, or one radio/checkbox group. */
interface Unit {
  inputs: Element[]
  kind: "writable" | "radio" | "checkbox"
}

export function buildActivityOutline(opts: {
  html: string
  sectionNodes?: ContentNodeData[]
}): ActivityOutline {
  const outline: ActivityOutline = { badges: [], instructions: [], items: [] }
  const section = findActivitySection(opts.html)
  if (!section) return outline

  const roles = collectLeafRoles(opts.sectionNodes)
  const order = buildOrderIndex(section)
  const pos = (el: Element): number => order.get(el) ?? Number.MAX_SAFE_INTEGER

  // Leaf-most data-id texts and data-id images, in document order.
  const textEls = findAll(section, (el) => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (findAll(el, (d) => typeof attr(d, "data-id") === "string").length > 0) return false
    return text(el).length > 0
  })
  const imgEls = findAll(
    section,
    (el) => tag(el, "img") && typeof attr(el, "data-id") === "string",
  )

  const claimed = new Set<Element>()
  const toText = (el: Element): ActivityOutlineText => ({
    dataId: attr(el, "data-id"),
    text: text(el),
  })
  const roleOf = (el: Element): string | undefined => roles.get(attr(el, "data-id") ?? "")

  // ── Answer units ──────────────────────────────────────────────────────
  const writable = findAll(section, (el) => {
    if (tag(el, "textarea")) return true
    if (!tag(el, "input")) return false
    const type = (attr(el, "type") ?? "text").toLowerCase()
    return type === "text" || type === ""
  })
  const choiceInputs = findAll(section, (el) => {
    if (!tag(el, "input")) return false
    const type = (attr(el, "type") ?? "").toLowerCase()
    return type === "radio" || type === "checkbox"
  })

  const units: Unit[] = writable.map((el): Unit => ({ inputs: [el], kind: "writable" }))
  const byGroup = new Map<string, Element[]>()
  choiceInputs.forEach((el, i) => {
    const key = attr(el, "name") || attr(el, "data-activity-item") || `__choice-${i}`
    byGroup.set(key, [...(byGroup.get(key) ?? []), el])
  })
  for (const els of byGroup.values()) {
    const type = (attr(els[0], "type") ?? "").toLowerCase()
    units.push({ inputs: els, kind: type === "radio" ? "radio" : "checkbox" })
  }
  units.sort((a, b) => pos(a.inputs[0]) - pos(b.inputs[0]))

  const allInputs = new Set<Element>([...writable, ...choiceInputs])
  const inputsUnder = (el: Element): Element[] =>
    [...allInputs].filter((i) => i === el || hasAncestor(i, section, (a) => a === el))

  // Card ancestor of a unit: ascend while growing swallows no foreign input.
  // The result is the unit's visual card — texts inside belong to it.
  const cardOf = (unit: Unit): Element => {
    const own = new Set(unit.inputs)
    let card: Element = unit.inputs[0]
    while (card.parent && card.parent !== section && card.parent.type === "tag") {
      if (inputsUnder(card.parent).some((i) => !own.has(i))) break
      card = card.parent
    }
    return card
  }

  // Minimal region of a single choice input: ascend while the parent contains
  // only this input. That's the option's label/card, holding its text + image.
  const optionRegionOf = (input: Element): Element => {
    let region: Element = input
    while (
      region.parent &&
      region.parent !== section &&
      region.parent.type === "tag" &&
      inputsUnder(region.parent).length === 1
    ) {
      region = region.parent
    }
    return region
  }

  const under = (el: Element, root: Element): boolean =>
    el === root || hasAncestor(el, section, (a) => a === root)

  // ── Header: title, badges, instructions ─────────────────────────────────
  // Title from the tree's heading role — headers are often styled <span>s the
  // h1–h6 scan misses. Fall back to the first real heading element.
  const titleEl =
    textEls.find((el) => TITLE_ROLES.has(roleOf(el) ?? "")) ??
    (() => {
      const { el } = extractTitle(section)
      if (!el) return undefined
      // extractTitle returns the heading element; anchor to its leaf-most
      // data-id text so claiming works on the same element set.
      return textEls.find((t) => under(t, el)) ?? undefined
    })()
  if (titleEl) {
    outline.title = toText(titleEl)
    claimed.add(titleEl)
  }

  const instructionEls = textEls.filter(
    (el) => !claimed.has(el) && roleOf(el) === "activity_instruction",
  )
  for (const el of instructionEls) claimed.add(el)
  outline.instructions = instructionEls.map(toText)

  // Badges (e.g. "GRADE 3"): label-role texts in the header zone — before the
  // instructions and before any answer field. Labels further down (table
  // column headers…) stay available to items / the flat list.
  const headerEnd = Math.min(
    instructionEls.length > 0 ? pos(instructionEls[0]) : Number.MAX_SAFE_INTEGER,
    units.length > 0 ? Math.min(...units.map((u) => pos(u.inputs[0]))) : Number.MAX_SAFE_INTEGER,
  )
  const badgeEls = textEls.filter(
    (el) => !claimed.has(el) && roleOf(el) === "label" && pos(el) < headerEnd,
  )
  for (const el of badgeEls) claimed.add(el)
  outline.badges = badgeEls.map(toText)

  // ── Items ────────────────────────────────────────────────────────────────
  const itemCards: { item: ActivityOutlineItem; card: Element }[] = []
  for (const unit of units) {
    const card = cardOf(unit)
    const item: ActivityOutlineItem = { prompts: [], imageIds: [], inputs: [], options: [] }

    // Choice options claim their own region first so the card pass below
    // only sees the shared texts (number, prompt/statement).
    if (unit.kind !== "writable") {
      const itemIds = new Set(
        unit.inputs.map((i) => attr(i, "data-activity-item")).filter(Boolean),
      )
      const valueChoice = itemIds.size === 1 && unit.inputs.length > 1
      item.choice = valueChoice ? "value" : unit.kind === "radio" ? "single" : "multi"
      for (const input of unit.inputs) {
        const region = optionRegionOf(input)
        const regionTexts = textEls.filter((el) => !claimed.has(el) && under(el, region))
        // The option's text is the first substantive text in its region —
        // presentational letters ("A", sr-only numbering) lose to real answer
        // text. Visible-but-index-like beats hidden (numeric options, "T"/"F");
        // anything beats nothing.
        const optTextEl =
          regionTexts.find((el) => !isIndexLabel(text(el)) && !hasClass(el, "sr-only")) ??
          regionTexts.find((el) => !hasClass(el, "sr-only")) ??
          regionTexts[0]
        const optImgEl = imgEls.find((el) => !claimed.has(el) && under(el, region))
        if (optTextEl) claimed.add(optTextEl)
        if (optImgEl) claimed.add(optImgEl)
        // Claim leftover numbering captions silently so they don't pollute
        // the item's prompts or the flat text list.
        for (const el of regionTexts) {
          if (el !== optTextEl && isIndexLabel(text(el))) claimed.add(el)
        }
        const option: ActivityOutlineOption = {
          itemId: attr(input, "data-activity-item"),
          ...(valueChoice ? { value: attr(input, "value") } : {}),
          ...(optTextEl ? { text: toText(optTextEl) } : {}),
          ...(optImgEl ? { imageId: attr(optImgEl, "data-id") } : {}),
        }
        // Options without any anchor (no text, image, or item-id) can't be
        // displayed or edited — fall back to the aria-label as static text.
        if (!option.text && !option.imageId && attr(input, "aria-label")) {
          option.text = { text: attr(input, "aria-label")! }
        }
        item.options.push(option)
      }
    } else {
      for (const input of unit.inputs) {
        item.inputs.push({
          itemId: attr(input, "data-activity-item"),
          kind: tag(input, "textarea") ? "textarea" : "text",
          placeholder: attr(input, "placeholder") || undefined,
          ariaLabel: attr(input, "aria-label") || undefined,
        })
      }
    }

    // Shared card texts: number caption + prompt sentences, in page order.
    for (const el of textEls) {
      if (claimed.has(el) || !under(el, card)) continue
      claimed.add(el)
      const role = roleOf(el)
      if (!item.number && (role === "activity_number" || isIndexLabel(text(el)))) {
        item.number = toText(el)
      } else {
        item.prompts.push(toText(el))
      }
    }
    for (const el of imgEls) {
      if (claimed.has(el) || !under(el, card)) continue
      claimed.add(el)
      item.imageIds.push(attr(el, "data-id")!)
    }

    outline.items.push(item)
    itemCards.push({ item, card })
  }

  // Orphan adoption: when one question owns several answer groups (a two-blank
  // sentence with two radio groups), the shared number/prompt sits above both
  // groups' cards and belongs to neither. Give texts stranded in the gap
  // before a still-bare item to that item.
  let prevCardPos = -1
  for (const { item, card } of itemCards) {
    const cardPos = pos(card)
    if (!item.number && item.prompts.length === 0) {
      for (const el of textEls) {
        if (claimed.has(el)) continue
        const p = pos(el)
        if (p <= prevCardPos || p >= cardPos) continue
        claimed.add(el)
        const role = roleOf(el)
        if (!item.number && (role === "activity_number" || isIndexLabel(text(el)))) {
          item.number = toText(el)
        } else {
          item.prompts.push(toText(el))
        }
      }
    }
    prevCardPos = cardPos
  }

  return outline
}

/**
 * Title + instructions for the step-by-step conversion, resolved from the
 * section tree's roles (with the outline's fallbacks). Multi-sentence
 * instructions are joined; the joined text carries no dataId, which is safe
 * because the stepper's texts are self-contained copies.
 */
export function resolveActivityHeader(opts: {
  html: string
  sectionNodes?: ContentNodeData[]
}): { title?: ActivityOutlineText; instructions?: ActivityOutlineText } {
  const outline = buildActivityOutline(opts)
  const instructions =
    outline.instructions.length === 0
      ? undefined
      : outline.instructions.length === 1
        ? outline.instructions[0]
        : { text: outline.instructions.map((i) => i.text).join(" ") }
  return { title: outline.title, instructions }
}

/**
 * Override an extracted activity's title/instructions with the tree-resolved
 * header. Fixes the pure-HTML heuristics' failure modes (grade badges read as
 * instructions, styled-span titles missed). Keeps the extractor's own result
 * where the tree has nothing better.
 */
export function applyActivityHeader<
  T extends { title?: ActivityOutlineText; instructions?: ActivityOutlineText },
>(activity: T, opts: { html: string; sectionNodes?: ContentNodeData[] }): T {
  const outline = buildActivityOutline(opts)
  const instructions =
    outline.instructions.length === 0
      ? undefined
      : outline.instructions.length === 1
        ? outline.instructions[0]
        : { text: outline.instructions.map((i) => i.text).join(" ") }
  // A header badge ("GRADE 3") mistaken for instructions is worse than none.
  const keptInstructions = outline.badges.some(
    (b) => b.dataId && b.dataId === activity.instructions?.dataId,
  )
    ? undefined
    : activity.instructions
  return {
    ...activity,
    title: outline.title ?? activity.title,
    instructions: instructions ?? keptInstructions,
  }
}

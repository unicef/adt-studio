/**
 * Deterministic extraction of LLM-rendered activity HTML into the structured
 * `EditableActivity` model (see `@adt/types` editable-activity.ts).
 *
 * The HTML follows the contracts enforced by the activity prompts and
 * `validate-activity-structure.ts`:
 *   - FITB: `.fitb-sentence` elements containing `[[blank:item-N(:hint)?]]`
 *     markers inside `data-id` text; answers in `activityAnswers[item-N]`.
 *   - MC: `label.activity-option` wrapping `input[type=radio]` with
 *     `data-activity-item` and a shared `name` per question group; correctness
 *     as booleans in `activityAnswers[item-N]`.
 *
 * Extraction is heuristic where the HTML is free-form (step/card grouping,
 * prompt/image association) — imperfections land in the studio editor where
 * the user can fix them, which is the point of the editable mode. No LLM call.
 */
import { parseDocument, DomUtils } from "htmlparser2"
import {
  EditableActivity,
  ActivityImage,
  ActivityText,
  FitbBlank,
  FitbSentence,
  FitbStep,
  McOption,
  McStep,
  blankItemIdsInText,
} from "@adt/types"

// htmlparser2 node type, mirroring validate-activity-structure.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any

export interface ExtractResult {
  activity: EditableActivity | null
  errors: string[]
  warnings: string[]
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"])

/** Pure numbering/lettering captions ("1.", "2)", "(b)", "a:") — layout
 *  artifacts of the printed page. The stepper has its own progress counter,
 *  so these are never useful as step labels or instructions. */
function isIndexLabel(textContent: string): boolean {
  return /^[([]?([0-9]{1,3}|[a-z])[)\]]?[.:]?$/i.test(textContent.trim())
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function tag(el: Element, name?: string): boolean {
  if (el?.type !== "tag") return false
  return name ? (el.name ?? "").toLowerCase() === name : true
}

function attr(el: Element, name: string): string | undefined {
  const v = el?.attribs?.[name]
  return typeof v === "string" ? v : undefined
}

function hasClass(el: Element, cls: string): boolean {
  const raw = attr(el, "class")
  if (!raw) return false
  return raw.split(/\s+/).includes(cls)
}

function findAll(root: Element, predicate: (el: Element) => boolean): Element[] {
  return DomUtils.findAll(
    (el: Element) => el.type === "tag" && predicate(el),
    root.children ?? [],
  )
}

function hasAncestor(
  node: Element,
  stopAt: Element,
  predicate: (el: Element) => boolean,
): boolean {
  let current = node.parent
  while (current && current !== stopAt) {
    if (current.type === "tag" && predicate(current)) return true
    current = current.parent
  }
  return false
}

function text(el: Element): string {
  return DomUtils.textContent(el).replace(/\s+/g, " ").trim()
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function findActivitySection(html: string): Element | null {
  const doc = parseDocument(html)
  const sections = DomUtils.findAll(
    (el: Element) =>
      el.type === "tag" &&
      tag(el, "section") &&
      typeof attr(el, "data-section-type") === "string",
    doc.children,
  )
  return sections[0] ?? null
}

function extractImage(img: Element): ActivityImage {
  const style = attr(img, "style") ?? ""
  const widthMatch = style.match(/width:\s*(\d+(?:\.\d+)?)%/)
  const widthPercent = widthMatch ? Number(widthMatch[1]) : undefined
  return {
    imageId: attr(img, "data-id"),
    src: attr(img, "src") ?? "",
    alt: attr(img, "alt") || undefined,
    ...(widthPercent && widthPercent >= 1 && widthPercent <= 100
      ? { widthPercent }
      : {}),
  }
}

/** Document-order index for "does X come before Y" comparisons. */
function buildOrderIndex(section: Element): Map<Element, number> {
  const all = findAll(section, () => true)
  const index = new Map<Element, number>()
  all.forEach((el, i) => index.set(el, i))
  index.set(section, -1)
  return index
}

function extractTitle(section: Element): { title?: ActivityText; el: Element | null } {
  const heading = findAll(section, (el) =>
    HEADING_TAGS.has((el.name ?? "").toLowerCase()),
  )[0]
  if (!heading) return { el: null }
  const t = text(heading)
  if (!t) return { el: null }
  // Prefer the data-id on the heading itself or its first data-id descendant
  // so translations keep working.
  const dataId =
    attr(heading, "data-id") ??
    findAll(heading, (el) => typeof attr(el, "data-id") === "string")
      .map((el) => attr(el, "data-id"))
      .find(Boolean)
  return { title: { text: t, dataId }, el: heading }
}

function answersFor(
  itemId: string,
  activityAnswers: Record<string, string | boolean | number> | undefined,
  warnings: string[],
): string[] {
  const raw = activityAnswers?.[itemId]
  if (raw === undefined || raw === null || raw === "") {
    warnings.push(
      `No stored answer for ${itemId} — the blank will accept any input.`,
    )
    return []
  }
  return String(raw)
    .split("|")
    .map((a) => a.trim())
    .filter((a) => a.length > 0)
}

// ---------------------------------------------------------------------------
// Fill in the blank
// ---------------------------------------------------------------------------

interface FitbField {
  kind: "sentence" | "input"
  el: Element
}

function extractFitb(
  section: Element,
  activityAnswers: Record<string, string | boolean | number> | undefined,
  errors: string[],
  warnings: string[],
): { steps: FitbStep[]; titleEl: Element | null; title?: ActivityText; instructions?: ActivityText } {
  const sentenceEls = findAll(section, (el) => hasClass(el, "fitb-sentence"))
  // Only sentences that actually contain blank markers become steps — the
  // class sometimes decorates static siblings.
  const markerSentences = sentenceEls.filter(
    (el) => blankItemIdsInText(DomUtils.textContent(el)).length > 0,
  )
  // Form/table-style writable fields (prompt "pattern 2b"): a literal <input>
  // or <textarea> with data-activity-item, no marker. Each becomes one step.
  const standaloneInputs = findAll(
    section,
    (el) =>
      (tag(el, "input") || tag(el, "textarea")) &&
      typeof attr(el, "data-activity-item") === "string",
  )

  const order = buildOrderIndex(section)
  const fields: FitbField[] = [
    ...markerSentences.map((el): FitbField => ({ kind: "sentence", el })),
    ...standaloneInputs.map((el): FitbField => ({ kind: "input", el })),
  ].sort((a, b) => (order.get(a.el) ?? 0) - (order.get(b.el) ?? 0))

  if (fields.length === 0) {
    errors.push(
      "No blank markers or answer fields were found in the activity HTML.",
    )
    return { steps: [], titleEl: null }
  }

  const { title, el: titleEl } = extractTitle(section)

  // Card ancestor: ascend while the parent still contains exactly this one
  // field. The resulting subtree is the field's visual card and is where we
  // look for the step's image and (for standalone inputs) label text.
  const fieldEls = fields.map((f) => f.el)
  const countUnder = (el: Element): number =>
    fieldEls.filter((f) => f === el || hasAncestor(f, section, (a) => a === el)).length
  const cardOf = (field: Element): Element => {
    let card = field
    while (
      card.parent &&
      card.parent !== section &&
      card.parent.type === "tag" &&
      countUnder(card.parent) === 1
    ) {
      card = card.parent
    }
    return card
  }
  const cards = new Map<Element, Element>()
  for (const f of fields) cards.set(f.el, cardOf(f.el))

  const isLabelText = (el: Element, scope: Element): boolean => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (el === titleEl || (titleEl && hasAncestor(el, section, (a) => a === titleEl)))
      return false
    if (blankItemIdsInText(DomUtils.textContent(el)).length > 0) return false
    // Leaf-most: skip wrappers containing another data-id element.
    if (findAll(el, (d) => typeof attr(d, "data-id") === "string").length > 0) return false
    if (isIndexLabel(text(el))) return false
    return text(el).length > 0 && (scope === section || hasAncestor(el, section, (a) => a === scope) || el === scope)
  }

  // Flat-layout label candidates: data-id texts that don't live inside any
  // field's card subtree (those are claimed per-card below).
  const insideAnyCard = (el: Element): boolean =>
    [...new Set(cards.values())].some(
      (card) => card !== undefined && card.type === "tag" && (el === card || hasAncestor(el, section, (a) => a === card)),
    )
  const flatCandidates = findAll(section, (el) => isLabelText(el, section) && !insideAnyCard(el))

  const usedImages = new Set<Element>()
  const usedLabels = new Set<Element>()
  const steps: FitbStep[] = []

  fields.forEach((field, i) => {
    const card = cards.get(field.el)!
    const img =
      card === field.el
        ? undefined
        : findAll(card, (el) => tag(el, "img")).find((el) => !usedImages.has(el))
    if (img) usedImages.add(img)

    let sentences: FitbSentence[]
    let blanks: FitbBlank[]

    if (field.kind === "sentence") {
      // Sentence text: prefer the data-id element(s) carrying the markers so
      // we keep the translation ids; fall back to the sentence element itself.
      const dataIdEls = findAll(field.el, (el) =>
        typeof attr(el, "data-id") === "string",
      ).filter((el) => blankItemIdsInText(DomUtils.textContent(el)).length > 0)
      const sourceEls = dataIdEls.length > 0 ? dataIdEls : [field.el]
      sentences = sourceEls.map((el) => ({ text: text(el), dataId: attr(el, "data-id") }))
      const itemIds = sentences.flatMap((s) => blankItemIdsInText(s.text))
      blanks = [...new Set(itemIds)].map((itemId) => ({
        itemId,
        answers: answersFor(itemId, activityAnswers, warnings),
      }))
    } else {
      // Standalone input → label text from the card. Only flat layouts (no
      // card at all) fall back to the closest preceding free-standing label
      // (2b: "label, then the input immediately after") — a card without a
      // label is an image+field step and must not steal section-level text.
      let labelEls =
        card !== field.el
          ? findAll(card, (el) => isLabelText(el, card)).filter((el) => !usedLabels.has(el))
          : []
      if (labelEls.length === 0 && card === field.el) {
        const pos = order.get(field.el) ?? 0
        const prevPos = i > 0 ? (order.get(fields[i - 1].el) ?? -1) : -1
        const preceding = flatCandidates
          .filter((el) => {
            const p = order.get(el) ?? Number.MAX_SAFE_INTEGER
            return p < pos && p > prevPos && !usedLabels.has(el)
          })
          .pop()
        labelEls = preceding ? [preceding] : []
      }
      labelEls.forEach((el) => usedLabels.add(el))
      sentences = labelEls.map((el) => ({ text: text(el), dataId: attr(el, "data-id") }))

      const itemId = attr(field.el, "data-activity-item") ?? ""
      const hint = attr(field.el, "placeholder") || undefined
      blanks = [
        {
          itemId,
          answers: answersFor(itemId, activityAnswers, warnings),
          ...(hint ? { hint } : {}),
        },
      ]
    }

    steps.push({
      id: `step-${i + 1}`,
      image: img ? extractImage(img) : undefined,
      sentences,
      blanks,
    })
  })

  const unassociated = findAll(section, (el) => tag(el, "img")).filter(
    (el) => !usedImages.has(el),
  )
  if (unassociated.length > 0) {
    warnings.push(
      `${unassociated.length} image(s) could not be matched to a step and were left out.`,
    )
  }

  // Instructions: first data-id text before the first step that isn't the
  // title, isn't inside any card, and wasn't claimed as a field label.
  const firstStepPos = Math.min(
    ...fields.map((f) => order.get(cards.get(f.el)!) ?? Number.MAX_SAFE_INTEGER),
  )
  const instructionsEl = findAll(section, (el) => {
    if (!isLabelText(el, section)) return false
    if (usedLabels.has(el)) return false
    if (insideAnyCard(el)) return false
    return (order.get(el) ?? 0) < firstStepPos
  })[0]
  const instructions = instructionsEl
    ? { text: text(instructionsEl), dataId: attr(instructionsEl, "data-id") }
    : undefined

  return { steps, titleEl, title, instructions }
}

// ---------------------------------------------------------------------------
// Multiple choice
// ---------------------------------------------------------------------------

function extractMc(
  section: Element,
  activityAnswers: Record<string, string | boolean | number> | undefined,
  errors: string[],
  warnings: string[],
): { steps: McStep[]; title?: ActivityText; instructions?: ActivityText } {
  // Option labels: explicit .activity-option class, falling back to the label
  // around each item radio (same recovery the runtime uses).
  let optionEls = findAll(
    section,
    (el) => tag(el, "label") && hasClass(el, "activity-option"),
  )
  if (optionEls.length === 0) {
    const seen = new Set<Element>()
    for (const radio of findAll(
      section,
      (el) =>
        tag(el, "input") &&
        (attr(el, "type") ?? "").toLowerCase() === "radio" &&
        typeof attr(el, "data-activity-item") === "string",
    )) {
      let label = radio.parent
      while (label && label !== section && !tag(label, "label")) label = label.parent
      if (label && tag(label, "label")) seen.add(label)
    }
    optionEls = [...seen]
  }
  if (optionEls.length === 0) {
    errors.push("No answer options (label.activity-option) found in the activity HTML.")
    return { steps: [] }
  }

  const isInsideOption = (el: Element): boolean =>
    hasAncestor(el, section, (a) => optionEls.includes(a))

  // Group options by radio name, in document order.
  const order = buildOrderIndex(section)
  interface Group {
    name: string
    options: Element[]
  }
  const groups: Group[] = []
  const groupByName = new Map<string, Group>()
  for (const optionEl of optionEls) {
    const radio = findAll(
      optionEl,
      (el) => tag(el, "input") && (attr(el, "type") ?? "").toLowerCase() === "radio",
    )[0]
    const name = (radio ? attr(radio, "name") : undefined) ?? "question-group-1"
    let group = groupByName.get(name)
    if (!group) {
      group = { name, options: [] }
      groupByName.set(name, group)
      groups.push(group)
    }
    group.options.push(optionEl)
  }

  const { title, el: titleEl } = extractTitle(section)

  // Prompt candidates: data-id text leaves outside options/feedback/title.
  const candidates = findAll(section, (el) => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (el === titleEl || (titleEl && hasAncestor(el, section, (a) => a === titleEl)))
      return false
    if (isInsideOption(el)) return false
    if (hasAncestor(el, section, (a) => hasClass(a, "feedback-container"))) return false
    // Leaf-most: skip wrappers that contain another data-id element.
    if (findAll(el, (d) => typeof attr(d, "data-id") === "string").length > 0)
      return false
    if (isIndexLabel(text(el))) return false
    return text(el).length > 0
  })

  // Context images: outside options; assigned to the first group starting
  // after the image (per-question illustrations sit above their options).
  const contextImages = findAll(
    section,
    (el) => tag(el, "img") && !isInsideOption(el),
  )

  const groupStart = (g: Group): number =>
    Math.min(...g.options.map((o) => order.get(o) ?? Number.MAX_SAFE_INTEGER))

  const usedCandidates = new Set<Element>()
  const steps: McStep[] = groups.map((group, gi) => {
    const start = groupStart(group)
    const prevStart = gi > 0 ? groupStart(groups[gi - 1]) : -1

    // Prompt: last free candidate between the previous group and this one.
    const promptEl = [...candidates]
      .filter((el) => {
        const pos = order.get(el) ?? Number.MAX_SAFE_INTEGER
        return pos < start && pos > prevStart && !usedCandidates.has(el)
      })
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .pop()
    if (promptEl) usedCandidates.add(promptEl)

    const image = contextImages.find((img) => {
      const pos = order.get(img) ?? Number.MAX_SAFE_INTEGER
      const nextStart =
        gi < groups.length - 1 ? groupStart(groups[gi + 1]) : Number.MAX_SAFE_INTEGER
      return pos > prevStart && pos < nextStart
    })

    const options: McOption[] = group.options.map((optionEl) => {
      const radio = findAll(
        optionEl,
        (el) =>
          tag(el, "input") && (attr(el, "type") ?? "").toLowerCase() === "radio",
      )[0]
      const itemId =
        (radio ? attr(radio, "data-activity-item") : undefined) ??
        attr(optionEl, "data-activity-item") ??
        ""
      const textEl = findAll(optionEl, (el) => {
        if (typeof attr(el, "data-id") !== "string") return false
        if (tag(el, "img")) return false
        if (hasAncestor(el, optionEl, (a) => hasClass(a, "feedback-container")))
          return false
        return text(el).length > 0
      })[0]
      const img = findAll(optionEl, (el) => tag(el, "img"))[0]
      const raw = activityAnswers?.[itemId]
      const correct =
        raw === true || raw === 1 || String(raw).toLowerCase() === "true"
      return {
        itemId,
        text: textEl ? { text: text(textEl), dataId: attr(textEl, "data-id") } : undefined,
        image: img ? extractImage(img) : undefined,
        correct,
      }
    })

    return { id: group.name, prompt: promptEl ? { text: text(promptEl), dataId: attr(promptEl, "data-id") } : undefined, image: image ? extractImage(image) : undefined, options }
  })

  // Validation the schema can't express well up front — friendlier messages.
  for (const step of steps) {
    if (step.options.length < 2) {
      errors.push(`Question "${step.id}" has fewer than 2 options.`)
    }
    const correctCount = step.options.filter((o) => o.correct).length
    if (correctCount !== 1) {
      errors.push(
        `Question "${step.id}" must have exactly one correct option (found ${correctCount}). Check the activity's answer key.`,
      )
    }
    for (const o of step.options) {
      if (!o.itemId) errors.push(`An option in "${step.id}" is missing data-activity-item.`)
    }
  }

  // Instructions: first unused candidate before the first group.
  const firstStart = groups.length > 0 ? groupStart(groups[0]) : 0
  const instructionsEl = candidates.find(
    (el) => !usedCandidates.has(el) && (order.get(el) ?? 0) < firstStart,
  )
  const instructions = instructionsEl
    ? { text: text(instructionsEl), dataId: attr(instructionsEl, "data-id") }
    : undefined

  return { steps, title, instructions }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const KIND_BY_SECTION_TYPE: Record<string, EditableActivity["kind"]> = {
  activity_fill_in_the_blank: "fill-in-the-blank",
  activity_multiple_choice: "multiple-choice",
}

export function supportsEditableActivity(sectionType: string): boolean {
  return sectionType in KIND_BY_SECTION_TYPE
}

export function extractEditableActivity(opts: {
  html: string
  sectionType: string
  activityAnswers?: Record<string, string | boolean | number>
  sourceRenderingVersion?: number
}): ExtractResult {
  const errors: string[] = []
  const warnings: string[] = []

  const kind = KIND_BY_SECTION_TYPE[opts.sectionType]
  if (!kind) {
    return {
      activity: null,
      errors: [`Section type "${opts.sectionType}" doesn't support step-by-step conversion.`],
      warnings,
    }
  }

  const section = findActivitySection(opts.html)
  if (!section) {
    return {
      activity: null,
      errors: ["No <section data-section-type=…> element found in the activity HTML."],
      warnings,
    }
  }

  // Math is converted to MathML for classic sections at packaging time; the
  // stepper renders plain text and has no math path yet — fail the conversion
  // up front rather than shipping raw LaTeX.
  if (/\\\(|\\\[|\\frac|\\sqrt|\\sum|\\int|\$[^$\n]+\$/.test(DomUtils.textContent(section))) {
    return {
      activity: null,
      errors: [
        "This activity contains math notation, which step-by-step activities don't support yet.",
      ],
      warnings,
    }
  }

  let candidate: EditableActivity | null = null
  if (kind === "fill-in-the-blank") {
    const { steps, title, instructions } = extractFitb(
      section,
      opts.activityAnswers,
      errors,
      warnings,
    )
    if (errors.length === 0 && steps.length > 0) {
      candidate = {
        kind,
        sectionType: opts.sectionType,
        enabled: true,
        title,
        instructions,
        steps,
        sourceRenderingVersion: opts.sourceRenderingVersion,
        extractionWarnings: warnings.length > 0 ? warnings : undefined,
      }
    }
  } else {
    const { steps, title, instructions } = extractMc(
      section,
      opts.activityAnswers,
      errors,
      warnings,
    )
    if (errors.length === 0 && steps.length > 0) {
      candidate = {
        kind,
        sectionType: opts.sectionType,
        enabled: true,
        title,
        instructions,
        steps,
        sourceRenderingVersion: opts.sourceRenderingVersion,
        extractionWarnings: warnings.length > 0 ? warnings : undefined,
      }
    }
  }

  if (!candidate) {
    if (errors.length === 0) errors.push("Nothing extractable was found in the activity HTML.")
    return { activity: null, errors, warnings }
  }

  // Final schema gate so downstream consumers can trust the shape.
  const parsed = EditableActivity.safeParse(candidate)
  if (!parsed.success) {
    return {
      activity: null,
      errors: [
        ...errors,
        ...parsed.error.issues.map((i) => i.message),
      ],
      warnings,
    }
  }
  return { activity: parsed.data, errors, warnings }
}

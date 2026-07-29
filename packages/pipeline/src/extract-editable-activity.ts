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
  OpenEndedStep,
  UnderlineStep,
  UnderlineToken,
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

/** Pure numbering/lettering captions ("1.", "2)", "(b)", "a:", "(ii)", "iv.")
 *  — layout artifacts of the printed page. The stepper has its own progress
 *  counter, so these are never useful as step labels or instructions. */
export function isIndexLabel(textContent: string): boolean {
  const t = textContent.trim()
  // A single digit-run or single letter, optionally bracketed/punctuated.
  if (/^[([]?([0-9]{1,3}|[a-z])[)\]]?[.:]?$/i.test(t)) return true
  // Roman-numeral captions "(ii)", "iii.", "(iv)". Bounded to i/v/x so real
  // words (e.g. "mill", "civil") aren't caught; covers i–xxxix, plenty for
  // activity numbering.
  const inner = t.replace(/^[([]/, "").replace(/[)\].:]+$/, "")
  return inner.length > 0 && /^x{0,3}(ix|iv|v?i{0,3})$/i.test(inner)
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

export function tag(el: Element, name?: string): boolean {
  if (el?.type !== "tag") return false
  return name ? (el.name ?? "").toLowerCase() === name : true
}

export function attr(el: Element, name: string): string | undefined {
  const v = el?.attribs?.[name]
  return typeof v === "string" ? v : undefined
}

export function hasClass(el: Element, cls: string): boolean {
  const raw = attr(el, "class")
  if (!raw) return false
  return raw.split(/\s+/).includes(cls)
}

export function findAll(root: Element, predicate: (el: Element) => boolean): Element[] {
  return DomUtils.findAll(
    (el: Element) => el.type === "tag" && predicate(el),
    root.children ?? [],
  )
}

export function hasAncestor(
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

export function text(el: Element): string {
  return DomUtils.textContent(el).replace(/\s+/g, " ").trim()
}

/** Screen-reader-only scaffolding (e.g. the `.sr-only` "FOR ONLINE READING
 *  ONLY" banner) — visible to no learner, so never an instruction/label. */
export function isHiddenText(el: Element, section: Element): boolean {
  if (hasClass(el, "sr-only")) return true
  if (hasAncestor(el, section, (a) => hasClass(a, "sr-only"))) return true
  return /^for online reading only$/i.test(text(el))
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export function findActivitySection(html: string): Element | null {
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
export function buildOrderIndex(section: Element): Map<Element, number> {
  const all = findAll(section, () => true)
  const index = new Map<Element, number>()
  all.forEach((el, i) => index.set(el, i))
  index.set(section, -1)
  return index
}

export function extractTitle(section: Element): { title?: ActivityText; el: Element | null } {
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
): {
  steps: FitbStep[]
  titleEl: Element | null
  title?: ActivityText
  instructions?: ActivityText
  wordBank?: ActivityText
} {
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
    if (isHiddenText(el, section)) return false
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

  // Leading text before the first step (excluding the title, cards, and
  // claimed labels): the instruction directive, and — for cloze activities —
  // a word bank the learner draws every answer from.
  const firstStepPos = Math.min(
    ...fields.map((f) => order.get(cards.get(f.el)!) ?? Number.MAX_SAFE_INTEGER),
  )
  const leadingEls = findAll(section, (el) => {
    if (!isLabelText(el, section)) return false
    if (usedLabels.has(el)) return false
    if (insideAnyCard(el)) return false
    return (order.get(el) ?? 0) < firstStepPos
  })

  // Word bank: the leading block that lists the answer words ("fill from the
  // box"). Detected by overlap with the answer key — language-independent, so
  // it doesn't rely on the box's markup or a keyword like "kisanduku".
  const answerWords = new Set<string>()
  for (const step of steps) {
    for (const b of step.blanks) {
      for (const a of b.answers) {
        const w = a.trim().toLowerCase()
        if (w) answerWords.add(w)
      }
    }
  }
  let wordBankEl: Element | undefined
  // Require several DISTINCT answer words: a real word bank lists many choices,
  // whereas a classification task ("mark each sentence direct or reported
  // speech") reuses 2-3 category names that also appear in its instruction —
  // which must NOT be mistaken for a word bank.
  if (answerWords.size >= 4) {
    let bestCount = 0
    for (const el of leadingEls) {
      const lower = text(el).toLowerCase()
      const tokens = new Set(lower.split(/[^\p{L}\p{N}]+/u).filter(Boolean))
      let count = 0
      for (const w of answerWords) {
        if (w.includes(" ") ? lower.includes(w) : tokens.has(w)) count++
      }
      if (count > bestCount) {
        bestCount = count
        wordBankEl = el
      }
    }
    // Strong overlap only: the block must list most of the answer words.
    if (!(bestCount >= 3 && bestCount >= Math.ceil(answerWords.size * 0.6))) {
      wordBankEl = undefined
    }
  }
  const wordBank = wordBankEl
    ? { text: text(wordBankEl), dataId: attr(wordBankEl, "data-id") }
    : undefined

  const instructionsEl = leadingEls.find((el) => el !== wordBankEl)
  const instructions = instructionsEl
    ? { text: text(instructionsEl), dataId: attr(instructionsEl, "data-id") }
    : undefined

  // Grouped form-style blanks (e.g. Methali / Nahau / Misemo sections, each
  // with a heading + worked example above its numbered lines "(i) ___"): the
  // group's heading/example are free text leaves sitting between blank groups.
  // A blank whose only per-line label is a numbering caption has empty
  // sentences — give it its group's context so every step shows which group
  // (and example) it belongs to. Every blank in a group inherits the same
  // context. Skip image cards (the picture is already the prompt) and any leaf
  // already claimed as the instruction or word bank.
  const groupLeaves = flatCandidates
    .filter((el) => el !== wordBankEl && el !== instructionsEl && !usedLabels.has(el))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  if (groupLeaves.length > 0) {
    let currentRun: Element[] = []
    let prevPos = -1
    fields.forEach((field, i) => {
      const cardPos = order.get(cards.get(field.el)!) ?? Number.MAX_SAFE_INTEGER
      const between = groupLeaves.filter((el) => {
        const p = order.get(el) ?? Number.MAX_SAFE_INTEGER
        return p > prevPos && p < cardPos
      })
      if (between.length > 0) currentRun = between
      prevPos = cardPos
      if (
        field.kind === "input" &&
        steps[i].sentences.length === 0 &&
        !steps[i].image &&
        currentRun.length > 0
      ) {
        steps[i] = {
          ...steps[i],
          sentences: currentRun.map((el) => ({ text: text(el), dataId: attr(el, "data-id") })),
        }
      }
    })
  }

  return { steps, titleEl, title, instructions, wordBank }
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
// True / false
//
// A "value-choice" activity: each statement is a <fieldset> whose two radios
// share one data-activity-item and differ by value="true"|"false"; the answer
// key stores the correct value. This is a 2-option single-select, so it maps
// onto the multiple-choice model — each statement becomes an McStep with a
// True and a False option, reusing the whole MC runtime/editor/renderer.
// ---------------------------------------------------------------------------

function extractTrueFalse(
  section: Element,
  activityAnswers: Record<string, string | boolean | number> | undefined,
  errors: string[],
  warnings: string[],
): { steps: McStep[]; title?: ActivityText; instructions?: ActivityText } {
  const radios = findAll(
    section,
    (el) =>
      tag(el, "input") &&
      (attr(el, "type") ?? "").toLowerCase() === "radio" &&
      typeof attr(el, "data-activity-item") === "string" &&
      typeof attr(el, "value") === "string",
  )
  if (radios.length === 0) {
    errors.push("No true/false options (radio inputs with a value) found in the activity HTML.")
    return { steps: [] }
  }

  // The <label> wrapping each radio (source of the True/False text).
  const labelOf = (radio: Element): Element => {
    let el = radio.parent
    while (el && el !== section && !tag(el, "label")) el = el.parent
    return el && tag(el, "label") ? el : radio
  }

  const order = buildOrderIndex(section)
  interface Group {
    name: string
    radios: Element[]
  }
  const groups: Group[] = []
  const byName = new Map<string, Group>()
  for (const radio of radios) {
    const name =
      attr(radio, "name") ?? attr(radio, "data-activity-item") ?? "question-group-1"
    let group = byName.get(name)
    if (!group) {
      group = { name, radios: [] }
      byName.set(name, group)
      groups.push(group)
    }
    group.radios.push(radio)
  }

  const { title, el: titleEl } = extractTitle(section)

  const optionLabels = new Set(radios.map(labelOf))
  const isInsideOption = (el: Element): boolean =>
    optionLabels.has(el) || hasAncestor(el, section, (a) => optionLabels.has(a))

  // Statement text: a data-id leaf outside the option labels (the <legend>).
  const candidates = findAll(section, (el) => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (el === titleEl || (titleEl && hasAncestor(el, section, (a) => a === titleEl)))
      return false
    if (isInsideOption(el)) return false
    if (hasAncestor(el, section, (a) => hasClass(a, "feedback-container"))) return false
    if (findAll(el, (d) => typeof attr(d, "data-id") === "string").length > 0) return false
    if (isIndexLabel(text(el))) return false
    return text(el).length > 0
  })

  const groupStart = (g: Group): number =>
    Math.min(...g.radios.map((r) => order.get(r) ?? Number.MAX_SAFE_INTEGER))
  const norm = (v: string | boolean | number): string => String(v).trim().toLowerCase()
  const usedCandidates = new Set<Element>()

  const steps: McStep[] = groups.map((group, gi) => {
    const start = groupStart(group)
    const prevStart = gi > 0 ? groupStart(groups[gi - 1]) : -1

    const promptEl = [...candidates]
      .filter((el) => {
        const pos = order.get(el) ?? Number.MAX_SAFE_INTEGER
        return pos < start && pos > prevStart && !usedCandidates.has(el)
      })
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
      .pop()
    if (promptEl) usedCandidates.add(promptEl)

    const sharedItemId = attr(group.radios[0], "data-activity-item") ?? ""
    const answer = activityAnswers?.[sharedItemId]
    if (answer === undefined || answer === null || answer === "") {
      warnings.push(`No stored answer for statement ${sharedItemId}.`)
    }
    const correctValue = answer !== undefined && answer !== null ? norm(answer) : undefined

    const options: McOption[] = group.radios.map((radio) => {
      const value = attr(radio, "value") ?? ""
      const label = labelOf(radio)
      const textEl =
        label !== radio
          ? findAll(
              label,
              (el) =>
                typeof attr(el, "data-id") === "string" &&
                !tag(el, "img") &&
                text(el).length > 0,
            )[0]
          : undefined
      return {
        // Synthetic per-option id (the source shares one id across both radios,
        // which MC needs to be distinct). The stepper keys its own state by
        // step id, so these ids never round-trip to the source HTML.
        itemId: `${sharedItemId}-${norm(value)}`,
        text: textEl ? { text: text(textEl), dataId: attr(textEl, "data-id") } : { text: value },
        correct: correctValue !== undefined && norm(value) === correctValue,
      }
    })

    return {
      id: group.name,
      prompt: promptEl
        ? { text: text(promptEl), dataId: attr(promptEl, "data-id") }
        : undefined,
      options,
    }
  })

  for (const step of steps) {
    if (step.options.length < 2) {
      errors.push(`Statement "${step.id}" has fewer than 2 options.`)
    }
    const correctCount = step.options.filter((o) => o.correct).length
    if (correctCount !== 1) {
      errors.push(
        `Statement "${step.id}" must have exactly one correct answer (found ${correctCount}). Check the True/False answer key.`,
      )
    }
    const ids = new Set(step.options.map((o) => o.itemId))
    if (ids.size !== step.options.length) {
      errors.push(`Statement "${step.id}" has duplicate option ids.`)
    }
  }

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
// Open-ended answer (free text, no answer key)
// ---------------------------------------------------------------------------

function isWritableField(el: Element): boolean {
  if (attr(el, "id") === "filter-input") return false
  if (tag(el, "textarea")) return true
  return tag(el, "input") && ["", "text"].includes((attr(el, "type") ?? "").toLowerCase())
}

function extractOpenEnded(
  section: Element,
  errors: string[],
): { steps: OpenEndedStep[]; title?: ActivityText; instructions?: ActivityText } {
  const fields = findAll(section, isWritableField)
  if (fields.length === 0) {
    errors.push("No writable answer fields (input or textarea) were found in the activity HTML.")
    return { steps: [] }
  }

  const order = buildOrderIndex(section)

  // Title: a heading tag, or (open-ended sources rarely use one) the first
  // heading-styled `adt-h1/2/3` text leaf.
  let { title, el: titleEl } = extractTitle(section)
  if (!title) {
    const headingLike = findAll(
      section,
      (el) =>
        typeof attr(el, "data-id") === "string" &&
        !tag(el, "img") &&
        /\badt-h[1-3]\b/.test(attr(el, "class") ?? "") &&
        findAll(el, (d) => typeof attr(d, "data-id") === "string").length === 0 &&
        text(el).length > 0,
    )[0]
    if (headingLike) {
      title = { text: text(headingLike), dataId: attr(headingLike, "data-id") }
      titleEl = headingLike
    }
  }

  // Card ancestor: same ascent as FITB — the smallest subtree that still
  // contains exactly this one field. Its `data-id` texts are the prompt.
  const countUnder = (el: Element): number =>
    fields.filter((f) => f === el || hasAncestor(f, section, (a) => a === el)).length
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
  for (const f of fields) cards.set(f, cardOf(f))

  const isLabelText = (el: Element, scope: Element): boolean => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (el === titleEl || (titleEl && hasAncestor(el, section, (a) => a === titleEl)))
      return false
    if (findAll(el, (d) => typeof attr(d, "data-id") === "string").length > 0) return false
    if (isIndexLabel(text(el))) return false
    if (isHiddenText(el, section)) return false
    if (!(scope === section || hasAncestor(el, section, (a) => a === scope) || el === scope))
      return false
    return text(el).length > 0
  }

  const usedImages = new Set<Element>()
  const steps: OpenEndedStep[] = fields.map((field, i) => {
    const card = cards.get(field)!
    const img =
      card === field
        ? undefined
        : findAll(card, (el) => tag(el, "img")).find((el) => !usedImages.has(el))
    if (img) usedImages.add(img)

    // Prompt: the card's label text(s). A question can carry more than one
    // prompt line (e.g. "…? / Why?") — join them; a single line keeps its
    // dataId so read-aloud/translation still resolves it.
    const labelEls = card !== field ? findAll(card, (el) => isLabelText(el, card)) : []
    const promptText = labelEls.map((el) => text(el)).filter(Boolean).join(" ")
    const promptDataId = labelEls.length === 1 ? attr(labelEls[0], "data-id") : undefined
    const multiline = tag(field, "textarea")
    const hint = attr(field, "placeholder") || undefined
    const ariaId = attr(field, "data-aria-id") || undefined

    return {
      id: `step-${i + 1}`,
      image: img ? extractImage(img) : undefined,
      prompt: promptText ? { text: promptText, dataId: promptDataId } : undefined,
      ...(ariaId ? { ariaId } : {}),
      ...(multiline ? { multiline: true } : {}),
      ...(hint ? { hint } : {}),
    }
  })

  // Instructions: first pre-field label that isn't a prompt (not inside any
  // card) and isn't the title.
  const insideAnyCard = (el: Element): boolean =>
    [...new Set(cards.values())].some(
      (card) =>
        card !== undefined &&
        card.type === "tag" &&
        (el === card || hasAncestor(el, section, (a) => a === card)),
    )
  const firstFieldPos = Math.min(
    ...fields.map((f) => order.get(cards.get(f)!) ?? Number.MAX_SAFE_INTEGER),
  )
  const instructionsEl = findAll(
    section,
    (el) => isLabelText(el, section) && !insideAnyCard(el) && (order.get(el) ?? 0) < firstFieldPos,
  )[0]
  const instructions = instructionsEl
    ? { text: text(instructionsEl), dataId: attr(instructionsEl, "data-id") }
    : undefined

  return { steps, title, instructions }
}

// ---------------------------------------------------------------------------
// Underline the text
// ---------------------------------------------------------------------------

function isTruthyAnswer(raw: string | boolean | number | undefined): boolean {
  return raw === true || raw === 1 || String(raw).toLowerCase() === "true"
}

/** Walk a sentence wrapper into ordered tokens: each `.activity-underline-option`
 *  becomes a selectable word; everything else is the connective text between
 *  words (spaces, punctuation, number markers). */
function tokenizeUnderline(
  container: Element,
  optionSet: Set<Element>,
  activityAnswers: Record<string, string | boolean | number> | undefined,
): UnderlineToken[] {
  const tokens: UnderlineToken[] = []
  const walk = (node: Element): void => {
    if (node.type === "text") {
      const collapsed = (node.data ?? "").replace(/\s+/g, " ")
      if (collapsed.length > 0) tokens.push({ text: collapsed })
      return
    }
    if (node.type !== "tag") return
    if (optionSet.has(node)) {
      const itemId = attr(node, "data-activity-item") ?? ""
      tokens.push({ itemId, text: text(node), correct: isTruthyAnswer(activityAnswers?.[itemId]) })
      return
    }
    for (const child of node.children ?? []) walk(child)
  }
  for (const child of container.children ?? []) walk(child)
  // Trim whitespace-only tokens at the ends (leading indentation / trailing
  // newline) so the sentence renders flush.
  while (tokens.length && !tokens[0].itemId && tokens[0].text.trim() === "") tokens.shift()
  while (
    tokens.length &&
    !tokens[tokens.length - 1].itemId &&
    tokens[tokens.length - 1].text.trim() === ""
  ) {
    tokens.pop()
  }
  return tokens
}

function extractUnderline(
  section: Element,
  activityAnswers: Record<string, string | boolean | number> | undefined,
  errors: string[],
  warnings: string[],
): { steps: UnderlineStep[]; title?: ActivityText; instructions?: ActivityText } {
  const optionEls = findAll(
    section,
    (el) =>
      hasClass(el, "activity-underline-option") &&
      typeof attr(el, "data-activity-item") === "string",
  )
  if (optionEls.length === 0) {
    errors.push("No underline options (.activity-underline-option) found in the activity HTML.")
    return { steps: [] }
  }
  const optionSet = new Set(optionEls)

  const order = buildOrderIndex(section)
  interface Group {
    key: string
    options: Element[]
  }
  const groups: Group[] = []
  const byKey = new Map<string, Group>()
  for (const opt of optionEls) {
    const key = attr(opt, "data-question-group") || "question-group-1"
    let group = byKey.get(key)
    if (!group) {
      group = { key, options: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.options.push(opt)
  }

  const { title, el: titleEl } = extractTitle(section)

  // Sentence wrapper for a group: smallest ancestor containing every option,
  // which is normally the `data-id` sentence element itself.
  const containedBy = (anc: Element, node: Element): boolean =>
    node === anc || hasAncestor(node, section, (a) => a === anc)
  const containerOf = (options: Element[]): Element | null => {
    let candidate: Element | null = options[0].parent
    while (candidate && candidate !== section) {
      if (options.every((o) => containedBy(candidate!, o))) return candidate
      candidate = candidate.parent
    }
    return null
  }

  const steps: UnderlineStep[] = []
  let droppedNoAnswer = 0
  for (const group of groups) {
    const container = containerOf(group.options)
    if (!container) continue
    const tokens = tokenizeUnderline(container, optionSet, activityAnswers)
    // A sentence where the answer key marks nothing is unwinnable in the
    // stepper — leave it out rather than ship a step the learner can't clear.
    if (!tokens.some((t) => t.itemId && t.correct)) {
      droppedNoAnswer++
      continue
    }
    const dataId = attr(container, "data-id")
    steps.push({ id: group.key, tokens, ...(dataId ? { dataId } : {}) })
  }
  if (droppedNoAnswer > 0) {
    warnings.push(
      `${droppedNoAnswer} sentence(s) had no correct word in the answer key and were left out.`,
    )
  }
  if (steps.length === 0) {
    errors.push(
      "No answerable underline sentences were found — the answer key marks no correct words.",
    )
    return { steps: [] }
  }

  // Instructions: first data-id text leaf before the first sentence that isn't
  // the title and isn't part of a sentence (a sentence wrapper contains
  // options, so it's excluded).
  const candidates = findAll(section, (el) => {
    if (typeof attr(el, "data-id") !== "string") return false
    if (tag(el, "img")) return false
    if (el === titleEl || (titleEl && hasAncestor(el, section, (a) => a === titleEl)))
      return false
    if (optionSet.has(el) || hasAncestor(el, section, (a) => optionSet.has(a))) return false
    if (findAll(el, (d) => optionSet.has(d)).length > 0) return false
    if (isIndexLabel(text(el))) return false
    return text(el).length > 0
  })
  const firstStart = Math.min(
    ...groups.map((g) =>
      Math.min(...g.options.map((o) => order.get(o) ?? Number.MAX_SAFE_INTEGER)),
    ),
  )
  const instructionsEl = candidates.find((el) => (order.get(el) ?? 0) < firstStart)
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
  // True/false is a 2-option single-select — it reuses the multiple-choice
  // model (see extractTrueFalse), so its stepper kind is "multiple-choice".
  activity_true_false: "multiple-choice",
  activity_open_ended_answer: "open-ended",
  activity_underline_text: "underline-text",
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

  const common = {
    sectionType: opts.sectionType,
    enabled: true,
    sourceRenderingVersion: opts.sourceRenderingVersion,
  }
  const warningsOf = () => (warnings.length > 0 ? warnings : undefined)

  let candidate: EditableActivity | null = null
  if (kind === "fill-in-the-blank") {
    const { steps, title, instructions, wordBank } = extractFitb(
      section,
      opts.activityAnswers,
      errors,
      warnings,
    )
    if (errors.length === 0 && steps.length > 0) {
      candidate = {
        kind,
        ...common,
        title,
        instructions,
        wordBank,
        steps,
        extractionWarnings: warningsOf(),
      }
    }
  } else if (kind === "multiple-choice") {
    // True/false shares the MC kind but has a distinct (value-choice) DOM.
    const extractor =
      opts.sectionType === "activity_true_false" ? extractTrueFalse : extractMc
    const { steps, title, instructions } = extractor(
      section,
      opts.activityAnswers,
      errors,
      warnings,
    )
    if (errors.length === 0 && steps.length > 0) {
      candidate = { kind, ...common, title, instructions, steps, extractionWarnings: warningsOf() }
    }
  } else if (kind === "open-ended") {
    const { steps, title, instructions } = extractOpenEnded(section, errors)
    if (errors.length === 0 && steps.length > 0) {
      candidate = { kind, ...common, title, instructions, steps, extractionWarnings: warningsOf() }
    }
  } else {
    const { steps, title, instructions } = extractUnderline(
      section,
      opts.activityAnswers,
      errors,
      warnings,
    )
    if (errors.length === 0 && steps.length > 0) {
      candidate = { kind, ...common, title, instructions, steps, extractionWarnings: warningsOf() }
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

/**
 * Structural validation rules for activity sections. Run against the parsed
 * DOM of a single `<section data-section-type="activity_*">` element and
 * return human-readable error strings. The errors are surfaced into the
 * visual-review feedback loop so the LLM can fix structural problems that
 * pure visual review can't see (e.g. missing `class="activity-option"` on
 * an option label — the page screenshots fine but the runtime can't find
 * the option).
 *
 * Adding a new rule: write a function that takes a context and returns
 * `string[]` (empty when the rule passes), then add it to the matching
 * activity type in `ACTIVITY_RULES`. Each rule is independent — they all
 * run and their errors concatenate.
 */
import { DomUtils } from "htmlparser2"
import {
  collectUnderlineGroups,
  containerExclusiveToGroup,
  findGroupCommonContainer,
  findUnwrappedWords,
  isWordLevelGroup,
} from "./activity-underline-repair.js"
import { inspectOrderingSection } from "./ordering-contract.js"

// htmlparser2 doesn't export its DOM node type ergonomically; treat nodes as
// `any` inside this module — DomUtils is the typed surface we rely on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any

export interface ActivityRuleContext {
  /** The activity `<section>` element (htmlparser2 node). */
  section: Element
  /** Value of the section's `data-section-type` attribute. */
  sectionType: string
}

export interface ActivityRule {
  /** Identifier used in test failures and debug logs. */
  name: string
  /** Returns one error per violation, empty array if the rule passes. */
  check: (ctx: ActivityRuleContext) => string[]
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function classListOf(el: Element): string[] {
  const raw = el.attribs?.class
  if (typeof raw !== "string" || raw.length === 0) return []
  return raw.split(/\s+/).filter(Boolean)
}

function hasClass(el: Element, cls: string): boolean {
  return classListOf(el).includes(cls)
}

function findAncestor(
  node: Element,
  predicate: (el: Element) => boolean,
): Element | null {
  let current = node.parent
  while (current) {
    if (current.type === "tag" && predicate(current)) return current
    current = current.parent
  }
  return null
}

function findAll(
  root: Element,
  predicate: (el: Element) => boolean,
): Element[] {
  return DomUtils.findAll(
    (el) => el.type === "tag" && predicate(el),
    root.children ?? [],
  )
}

function tag(el: Element, name: string): boolean {
  return el.type === "tag" && (el.name ?? "").toLowerCase() === name
}

function attr(el: Element, name: string): string | undefined {
  const v = el.attribs?.[name]
  return typeof v === "string" ? v : undefined
}

function isRadioWithItem(el: Element): boolean {
  return (
    tag(el, "input") &&
    (attr(el, "type") ?? "").toLowerCase() === "radio" &&
    typeof attr(el, "data-activity-item") === "string"
  )
}

function isCheckboxWithItem(el: Element): boolean {
  return (
    tag(el, "input") &&
    (attr(el, "type") ?? "").toLowerCase() === "checkbox" &&
    typeof attr(el, "data-activity-item") === "string"
  )
}

function isUnderlineOption(el: Element): boolean {
  return (
    el.type === "tag" &&
    hasClass(el, "activity-underline-option")
  )
}

function isWritableTextInput(el: Element): boolean {
  if (tag(el, "textarea")) return true
  if (!tag(el, "input")) return false
  const type = (attr(el, "type") ?? "text").toLowerCase()
  // The runtime queries `input[type="text"]:not(#filter-input), textarea`,
  // so anything outside that set is irrelevant to FITB/open-ended rules.
  return type === "text" || type === ""
}

// ---------------------------------------------------------------------------
// Multiple-choice / quiz rules
// ---------------------------------------------------------------------------

function mcOptionLabelMustHaveActivityClass(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  const seen = new Set<Element>()
  for (const radio of findAll(ctx.section, isRadioWithItem)) {
    const label = findAncestor(radio, (el) => tag(el, "label"))
    if (!label || seen.has(label)) continue
    seen.add(label)
    if (!hasClass(label, "activity-option")) {
      const item = attr(radio, "data-activity-item")
      errors.push(
        `The <label> wrapping radio data-activity-item="${item}" is missing class="activity-option". ` +
          `Add "activity-option" alongside any layout classes — the runtime uses this class to find clickable options. ` +
          `Without it the option renders correctly but does not respond to clicks.`,
      )
    }
  }
  return errors
}

function mcRadioMustHaveName(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const radio of findAll(ctx.section, isRadioWithItem)) {
    const name = attr(radio, "name")
    if (!name) {
      const item = attr(radio, "data-activity-item")
      errors.push(
        `The radio with data-activity-item="${item}" is missing a "name" attribute. ` +
          `All radios in a single question group must share the same "name"; ` +
          `radios in different question groups must use distinct names.`,
      )
    }
  }
  return errors
}

function mcLabelMustWrapRadio(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const label of findAll(ctx.section, (el) =>
    tag(el, "label") && hasClass(el, "activity-option"),
  )) {
    const hasRadio = findAll(label, isRadioWithItem).length > 0
    if (!hasRadio) {
      errors.push(
        `A <label class="activity-option"> contains no <input type="radio" data-activity-item="..."> descendant. ` +
          `Every option label must wrap a radio with a unique data-activity-item.`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Multi-select rules (checkboxes — "select all that apply")
// ---------------------------------------------------------------------------

function msOptionLabelMustHaveActivityClass(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  const seen = new Set<Element>()
  for (const checkbox of findAll(ctx.section, isCheckboxWithItem)) {
    const label = findAncestor(checkbox, (el) => tag(el, "label"))
    if (!label || seen.has(label)) continue
    seen.add(label)
    if (!hasClass(label, "activity-option")) {
      const item = attr(checkbox, "data-activity-item")
      errors.push(
        `The <label> wrapping checkbox data-activity-item="${item}" is missing class="activity-option". ` +
          `Add "activity-option" alongside any layout classes — the runtime uses this class to find clickable options.`,
      )
    }
  }
  return errors
}

function msCheckboxMustHaveName(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const checkbox of findAll(ctx.section, isCheckboxWithItem)) {
    if (!attr(checkbox, "name")) {
      const item = attr(checkbox, "data-activity-item")
      errors.push(
        `The checkbox with data-activity-item="${item}" is missing a "name" attribute. ` +
          `All checkboxes in a single "select all that apply" question must share the same "name"; ` +
          `checkboxes in different question groups must use distinct names.`,
      )
    }
  }
  return errors
}

function msLabelMustWrapCheckbox(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const label of findAll(ctx.section, (el) =>
    tag(el, "label") && hasClass(el, "activity-option"),
  )) {
    if (findAll(label, isCheckboxWithItem).length === 0) {
      errors.push(
        `A <label class="activity-option"> in a multi-select section contains no ` +
          `<input type="checkbox" data-activity-item="..."> descendant. Every option label ` +
          `must wrap a checkbox with a unique data-activity-item.`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Underline-text rules (inline selectable words / phrases / sentences)
// ---------------------------------------------------------------------------

function utSectionMustContainOptions(ctx: ActivityRuleContext): string[] {
  const options = findAll(ctx.section, isUnderlineOption)
  if (options.length > 0) return []
  return [
    `Underline-text activity sections must include at least one element with class="activity-underline-option". ` +
      `Wrap each selectable word, phrase, or sentence in an inline element carrying that class.`,
  ]
}

function utOptionsMustHaveItemIds(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const option of findAll(ctx.section, isUnderlineOption)) {
    if (!attr(option, "data-activity-item")) {
      errors.push(
        `Each .activity-underline-option must have a unique data-activity-item attribute so the runtime can score selections.`,
      )
    }
  }
  return errors
}

function utOptionsMustHaveQuestionGroup(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const option of findAll(ctx.section, isUnderlineOption)) {
    const item = attr(option, "data-activity-item") ?? "(missing item id)"
    if (!attr(option, "data-question-group")) {
      errors.push(
        `The .activity-underline-option with data-activity-item="${item}" is missing data-question-group. ` +
          `Underline activities use question groups to keep multiple prompts independent within one section.`,
      )
    }
  }
  return errors
}

/**
 * A selectable token gets its accessible name from its own text content (the
 * runtime deliberately sets no aria-label so the name follows the visible word
 * across language switches). An empty token is therefore an unnamed control —
 * a screen reader announces a bare "checkbox".
 */
function utOptionsMustHaveText(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const option of findAll(ctx.section, isUnderlineOption)) {
    if (DomUtils.getText(option).trim() === "") {
      const item = attr(option, "data-activity-item") ?? "(missing item id)"
      errors.push(
        `The .activity-underline-option with data-activity-item="${item}" has no text ` +
          `content. Each selectable segment takes its accessible name from its text, so ` +
          `an empty segment is announced as an unlabeled checkbox.`,
      )
    }
  }
  return errors
}

/**
 * Word-level questions must make EVERY word selectable — learners of the
 * printed book can underline any word, so a curated candidate subset both
 * weakens the task and telegraphs the answer. Scoping mirrors the deterministic
 * completion pass in activity-underline-repair.ts (which normally fixes this
 * before validation): a group counts as word-level when all of its existing
 * options are single words, and phrase/sentence-level groups are exempt.
 */
function utWordLevelGroupsFullyTokenized(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const group of collectUnderlineGroups(ctx.section)) {
    if (!group.key) continue // question-group-present rule reports the missing attribute
    if (!isWordLevelGroup(group.options)) continue
    const container = findGroupCommonContainer(ctx.section, group.options)
    if (!container) {
      errors.push(
        `The selectable segments of "${group.key}" do not share a wrapper element below the section. ` +
          `Keep all of one question's segments inside that question's own text wrapper ` +
          `(normally its data-id element) so the runtime can group and label them.`,
      )
      continue
    }
    if (!containerExclusiveToGroup(container, group.key)) {
      errors.push(
        `The wrapper containing all segments of "${group.key}" also contains segments of other ` +
          `question groups. Give each question its own wrapper (normally the sentence's data-id ` +
          `element) so questions stay independent.`,
      )
      continue
    }
    const missing = findUnwrappedWords(container)
    if (missing.length > 0) {
      errors.push(
        `Word-level underline question "${group.key}" leaves these words unselectable: ` +
          `${missing.map((w) => `"${w}"`).join(", ")}. When the answer unit is a word, EVERY word ` +
          `in the sentence must be wrapped in its own .activity-underline-option span — number ` +
          `markers like "(i)", example labels, and punctuation stay outside the spans.`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// True/false rules
// ---------------------------------------------------------------------------

function tfFieldsetMustHavePairedRadios(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  const fieldsets = findAll(ctx.section, (el) => tag(el, "fieldset"))
  for (const fs of fieldsets) {
    const radios = findAll(fs, isRadioWithItem)
    if (radios.length === 0) continue // empty fieldset is not a true/false question
    if (radios.length !== 2) {
      errors.push(
        `Each <fieldset> in a true/false section must contain exactly two radios ` +
          `(one with value="true", one with value="false"). Found ${radios.length}.`,
      )
      continue
    }
    const [a, b] = radios
    const itemA = attr(a, "data-activity-item")
    const itemB = attr(b, "data-activity-item")
    if (itemA !== itemB) {
      errors.push(
        `True/false: the two radios in a <fieldset> must share the same data-activity-item ` +
          `(they represent the same question). Got "${itemA}" and "${itemB}".`,
      )
    }
    const values = new Set([
      (attr(a, "value") ?? "").toLowerCase(),
      (attr(b, "value") ?? "").toLowerCase(),
    ])
    if (!(values.has("true") && values.has("false"))) {
      errors.push(
        `True/false: each <fieldset> must contain one radio with value="true" and one with value="false". ` +
          `Got values [${[...values].join(", ")}] for item "${itemA}".`,
      )
    }
  }
  return errors
}

function tfLabelShouldHaveValidationMark(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  for (const radio of findAll(ctx.section, isRadioWithItem)) {
    const label = findAncestor(radio, (el) => tag(el, "label"))
    if (!label) continue
    const mark = findAll(label, (el) => hasClass(el, "validation-mark"))
    if (mark.length === 0) {
      const item = attr(radio, "data-activity-item")
      const value = attr(radio, "value")
      errors.push(
        `True/false option (item="${item}", value="${value}") is missing a ` +
          `<span class="validation-mark hidden"></span> inside its <label>. ` +
          `The runtime injects a check/cross icon into this span on submit.`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Fill-in-the-blank / fill-in-a-table rules
// ---------------------------------------------------------------------------

/** Matches `[[blank:item-N]]` or `[[blank:item-N:hint]]`. */
const BLANK_MARKER_RE = /\[\[blank:item-\d+(?::[^\]]+)?\]\]/g
/** Matches malformed marker-looking patterns that probably should be markers. */
const SUSPICIOUS_BLANK_RE = /\[\[blank[^\]]*\]\]/g

function collectMarkerItemIds(section: Element): string[] {
  const text = DomUtils.getText(section)
  const ids: string[] = []
  for (const m of text.matchAll(BLANK_MARKER_RE)) {
    const itemMatch = m[0].match(/item-(\d+)/)
    if (itemMatch) ids.push(`item-${itemMatch[1]}`)
  }
  return ids
}

function fitbMarkersMustBeWellFormed(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  const text = DomUtils.getText(ctx.section)
  const allMarkers = text.match(SUSPICIOUS_BLANK_RE) ?? []
  for (const marker of allMarkers) {
    if (!BLANK_MARKER_RE.test(marker)) {
      errors.push(
        `Malformed blank marker: "${marker}". The required form is "[[blank:item-N]]" or ` +
          `"[[blank:item-N:hint]]" where N is a positive integer.`,
      )
    }
    // Reset the stateful global regex between iterations.
    BLANK_MARKER_RE.lastIndex = 0
  }
  return errors
}

function fitbInputsShouldHaveItem(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  // Inputs hydrated FROM `[[blank:]]` markers get their item id from the marker.
  // For the FITB/table pattern where the LLM emits an <input> directly (rather
  // than a marker), the input itself MUST carry data-activity-item — otherwise
  // the runtime can't validate it against the answer map.
  for (const input of findAll(ctx.section, isWritableTextInput)) {
    if (attr(input, "data-activity-item")) continue
    // Skip inputs the LLM filtered out of validation, e.g. a search filter.
    if (input.attribs?.id === "filter-input") continue
    errors.push(
      `An <${input.name}> in this activity is missing data-activity-item. ` +
        `Every editable input/textarea must carry data-activity-item="item-N" so the ` +
        `runtime can match the learner's value against the correct-answer map.`,
    )
  }
  return errors
}

// Note on `data-aria-id`: the runtime uses it as the localStorage key for
// per-input persistence (input value survives reload). When missing, the
// `persistenceKey` helper returns null and the save/load functions silently
// no-op — the activity still functions, the learner just loses their value
// on reload. We intentionally do NOT enforce it here so the validator stays
// focused on load-bearing issues that break activity functionality.

// ---------------------------------------------------------------------------
// Open-ended rules
// ---------------------------------------------------------------------------

function openEndedInputsShouldHaveAriaLabel(
  ctx: ActivityRuleContext,
): string[] {
  const errors: string[] = []
  for (const input of findAll(ctx.section, isWritableTextInput)) {
    if (input.attribs?.id === "filter-input") continue
    if (!attr(input, "aria-label") && !attr(input, "aria-labelledby")) {
      errors.push(
        `An <${input.name}> in this open-ended activity has no accessible label. ` +
          `Add aria-label="..." (or aria-labelledby) describing what the learner is being asked to write.`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Shared rules
// ---------------------------------------------------------------------------

function uniqueDataActivityItems(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  const seen = new Map<string, number>()

  // Each radio with data-activity-item counts as a distinct option; the same
  // item id appearing twice means the runtime would treat them as one logical
  // option and confuse selection. But true/false intentionally shares an item
  // id across its two radios (paired by item), so we exclude radios from this
  // uniqueness check and handle them in the true/false-specific rule.
  for (const el of findAll(ctx.section, (n) => typeof attr(n, "data-activity-item") === "string")) {
    if (isRadioWithItem(el) || isCheckboxWithItem(el)) continue
    const item = attr(el, "data-activity-item")!
    seen.set(item, (seen.get(item) ?? 0) + 1)
  }

  // For non-true-false activities, ALSO collect from radios. Skip when the
  // section is true/false — the paired-radios rule covers it.
  if (ctx.sectionType !== "activity_true_false") {
    for (const el of findAll(ctx.section, isRadioWithItem)) {
      const item = attr(el, "data-activity-item")!
      seen.set(item, (seen.get(item) ?? 0) + 1)
    }
  }

  // Multi-select checkboxes follow the same one-item-per-option rule as MC radios.
  for (const el of findAll(ctx.section, isCheckboxWithItem)) {
    const item = attr(el, "data-activity-item")!
    seen.set(item, (seen.get(item) ?? 0) + 1)
  }

  // Markers count once per occurrence in text.
  for (const id of collectMarkerItemIds(ctx.section)) {
    seen.set(id, (seen.get(id) ?? 0) + 1)
  }

  for (const [item, count] of seen) {
    if (count > 1) {
      errors.push(
        `data-activity-item="${item}" appears ${count} times in this section. ` +
          `Each option/blank must have a unique item id (item-1, item-2, …).`,
      )
    }
  }
  return errors
}

// ---------------------------------------------------------------------------
// Custom activity (activity_custom_*) accessibility rules
//
// Custom activities are LLM-authored free-form HTML, so unlike the templated
// types there's no fixed structure to validate — but the runtime still shows a
// Submit button and learners still operate the activity, including by keyboard
// and screen reader. These rules enforce the accessibility floor the generation
// prompt asks for: drop zones and cards must be named, focusable, and have a
// role; the section must be labelled and announce results via a live region.
// ---------------------------------------------------------------------------

const NATIVE_INTERACTIVE = new Set([
  "button",
  "a",
  "input",
  "select",
  "textarea",
])

function isNativeInteractive(el: Element): boolean {
  return NATIVE_INTERACTIVE.has((el.name ?? "").toLowerCase())
}

function hasRoleSemantics(el: Element): boolean {
  return isNativeInteractive(el) || typeof attr(el, "role") === "string"
}

function isFocusable(el: Element): boolean {
  return isNativeInteractive(el) || typeof attr(el, "tabindex") === "string"
}

function elementById(root: Element, id: string): Element | null {
  return findAll(root, (n) => attr(n, "id") === id)[0] ?? null
}

/** Resolve aria-labelledby to the concatenated text of the referenced ids. */
function labelledByText(section: Element, el: Element): string {
  const ref = attr(el, "aria-labelledby")
  if (!ref) return ""
  return ref
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const target = elementById(section, id)
      return target ? DomUtils.textContent(target) : ""
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

/** True when the element carries an explicit, non-empty ARIA label. */
function hasExplicitLabel(section: Element, el: Element): boolean {
  return Boolean(attr(el, "aria-label")?.trim() || labelledByText(section, el))
}

/** True when the element exposes any accessible name (label, text, or img alt). */
function hasAccessibleName(section: Element, el: Element): boolean {
  if (hasExplicitLabel(section, el)) return true
  if (DomUtils.textContent(el).replace(/\s+/g, " ").trim()) return true
  // The element may BE the image (a picture card in a jigsaw or picture-match
  // activity) — findAll only walks descendants, so check the node itself first.
  if (tag(el, "img") && (attr(el, "alt") ?? "").trim().length > 0) return true
  return findAll(el, (n) => tag(n, "img")).some(
    (img) => (attr(img, "alt") ?? "").trim().length > 0,
  )
}

function answerKeyId(el: Element): string {
  return (
    attr(el, "data-activity-target") ||
    attr(el, "data-activity-item") ||
    attr(el, "data-id") ||
    `<${el.name}>`
  )
}

function customDropZonesAreAccessible(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const zone of findAll(
    ctx.section,
    (n) => typeof attr(n, "data-activity-target") === "string",
  )) {
    const id = answerKeyId(zone)
    if (!hasExplicitLabel(ctx.section, zone)) {
      errors.push(
        `Drop zone data-activity-target="${id}" has no accessible label. ` +
          `Add aria-label="..." or aria-labelledby="<id>" naming the zone (e.g. "Top left space").`,
      )
    }
    if (!hasRoleSemantics(zone)) {
      errors.push(
        `Drop zone data-activity-target="${id}" has no role. ` +
          `Add role="group" (or "region") so screen readers announce it as a target.`,
      )
    }
    if (!isFocusable(zone)) {
      errors.push(
        `Drop zone data-activity-target="${id}" is not keyboard-focusable. ` +
          `Add tabindex="0" so keyboard users can place items into it.`,
      )
    }
  }
  return errors
}

function customCardsAreAccessible(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const card of findAll(
    ctx.section,
    (n) => typeof attr(n, "data-activity-item") === "string",
  )) {
    const id = answerKeyId(card)
    if (!hasAccessibleName(ctx.section, card)) {
      errors.push(
        `Card data-activity-item="${id}" has no accessible name. ` +
          `Give it visible text, an <img alt="...">, or aria-label="...".`,
      )
    }
    if (!hasRoleSemantics(card) || !isFocusable(card)) {
      errors.push(
        `Card data-activity-item="${id}" is not operable by keyboard. ` +
          `Use a <button>, or add role="button" and tabindex="0".`,
      )
    }
  }
  return errors
}

function customInputsHaveAccessibleLabel(ctx: ActivityRuleContext): string[] {
  const errors: string[] = []
  for (const input of findAll(ctx.section, isWritableTextInput)) {
    if (
      !attr(input, "aria-label") &&
      !attr(input, "aria-labelledby") &&
      !attr(input, "title")
    ) {
      errors.push(
        `An <${input.name}> in this custom activity has no accessible label. ` +
          `Add aria-label="..." describing what the learner must enter (a placeholder is not enough).`,
      )
    }
  }
  return errors
}

function customSectionHasLabel(ctx: ActivityRuleContext): string[] {
  if (hasExplicitLabel(ctx.section, ctx.section)) return []
  return [
    `The activity <section> has no accessible name. Add aria-labelledby="<heading-id>" ` +
      `(or aria-label) so screen readers announce the activity by name.`,
  ]
}

function customHasLiveRegion(ctx: ActivityRuleContext): string[] {
  const hasLive =
    findAll(
      ctx.section,
      (n) =>
        typeof attr(n, "aria-live") === "string" ||
        attr(n, "role") === "status" ||
        attr(n, "role") === "alert" ||
        typeof attr(n, "data-activity-status") === "string",
    ).length > 0
  if (hasLive) return []
  return [
    `This custom activity has no live region for feedback. Add an aria-live="polite" ` +
      `status element (e.g. <div data-activity-status role="status" aria-live="polite">) and write the result into it.`,
  ]
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

const MC_RULES: ActivityRule[] = [
  { name: "option-label-class", check: mcOptionLabelMustHaveActivityClass },
  { name: "radio-has-name", check: mcRadioMustHaveName },
  { name: "label-wraps-radio", check: mcLabelMustWrapRadio },
  { name: "unique-items", check: uniqueDataActivityItems },
]

const MULTI_SELECT_RULES: ActivityRule[] = [
  { name: "option-label-class", check: msOptionLabelMustHaveActivityClass },
  { name: "checkbox-has-name", check: msCheckboxMustHaveName },
  { name: "label-wraps-checkbox", check: msLabelMustWrapCheckbox },
  { name: "unique-items", check: uniqueDataActivityItems },
]

const UNDERLINE_TEXT_RULES: ActivityRule[] = [
  { name: "has-options", check: utSectionMustContainOptions },
  { name: "items-present", check: utOptionsMustHaveItemIds },
  { name: "question-group-present", check: utOptionsMustHaveQuestionGroup },
  { name: "options-have-text", check: utOptionsMustHaveText },
  { name: "word-level-fully-tokenized", check: utWordLevelGroupsFullyTokenized },
  { name: "unique-items", check: uniqueDataActivityItems },
]

const TRUE_FALSE_RULES: ActivityRule[] = [
  { name: "fieldset-paired-radios", check: tfFieldsetMustHavePairedRadios },
  { name: "validation-mark-present", check: tfLabelShouldHaveValidationMark },
  { name: "unique-items", check: uniqueDataActivityItems },
]

const FITB_RULES: ActivityRule[] = [
  { name: "markers-well-formed", check: fitbMarkersMustBeWellFormed },
  { name: "inputs-have-item", check: fitbInputsShouldHaveItem },
  { name: "unique-items", check: uniqueDataActivityItems },
]

const OPEN_ENDED_RULES: ActivityRule[] = [
  { name: "inputs-have-aria-label", check: openEndedInputsShouldHaveAriaLabel },
]

const ORDERING_RULES: ActivityRule[] = [
  {
    name: "ordering-contract",
    check: ({ section }) => inspectOrderingSection(section).errors,
  },
]

const CUSTOM_RULES: ActivityRule[] = [
  { name: "drop-zones-accessible", check: customDropZonesAreAccessible },
  { name: "cards-accessible", check: customCardsAreAccessible },
  { name: "inputs-have-label", check: customInputsHaveAccessibleLabel },
  { name: "section-has-label", check: customSectionHasLabel },
  { name: "has-live-region", check: customHasLiveRegion },
]

export const ACTIVITY_RULES: Record<string, ActivityRule[]> = {
  activity_multiple_choice: MC_RULES,
  activity_quiz: MC_RULES,
  activity_multi_select: MULTI_SELECT_RULES,
  activity_underline_text: UNDERLINE_TEXT_RULES,
  activity_true_false: TRUE_FALSE_RULES,
  activity_fill_in_the_blank: FITB_RULES,
  activity_fill_in_a_table: FITB_RULES,
  activity_open_ended_answer: OPEN_ENDED_RULES,
  activity_ordering: ORDERING_RULES,
}

/**
 * Run every registered rule for the given section type against `section`.
 * Returns a flat list of error strings (empty when no rule fired). Unknown
 * section types are a no-op — non-activity content silently passes.
 */
export function validateActivityStructure(
  section: Element,
  sectionType: string,
): string[] {
  // Custom activities share one rule set, keyed by the `activity_custom` prefix
  // (the suffix — _jigsaw, _crossword, … — is free-form).
  const rules = sectionType.startsWith("activity_custom")
    ? CUSTOM_RULES
    : ACTIVITY_RULES[sectionType]
  if (!rules) return []
  const ctx: ActivityRuleContext = { section, sectionType }
  return rules.flatMap((rule) => rule.check(ctx))
}

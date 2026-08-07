import { getDefaultStore } from "jotai"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { pagesAtom, currentSectionIdAtom } from "@/features/navigation/state/nav.atoms"
import {
  confettiTriggerAtom,
  skipEnabledAtom,
  skipHandlerAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms"
import { playActivitySound } from "@/features/activity/runtime/sounds"
import { showActivityProgressToast } from "@/features/activity/lib/progress-toast"

/**
 * `activity_multi_select` ("select all that apply"). Mirrors
 * `activity_multiple_choice` but uses CHECKBOXES — each question group
 * accepts an arbitrary number of selections. A group is considered correct
 * only when the learner's selected set EQUALS the set of correct items for
 * that group (no missed correct items, no incorrect picks).
 *
 * Cardinality matches MC: a section may host multiple question groups,
 * each identified by its inner checkbox's `name` attribute. Each group
 * tracks its own selection + validation state independently.
 */
const MS_SELECTOR = 'section[data-section-type="activity_multi_select"]'
const DEFAULT_GROUP_KEY = "__default__"

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

// `window.correctAnswers` is declared once in ./activity-globals.d.ts.
// For multi-select, `true` means the item SHOULD be selected.

function readCorrectAnswers(section: HTMLElement): Record<string, boolean> {
  const attr = section.getAttribute("data-correct-answers")
  if (attr) {
    try {
      return JSON.parse(attr) as Record<string, boolean>
    } catch {
      // fall through
    }
  }
  if (typeof window !== "undefined" && window.correctAnswers) {
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(window.correctAnswers)) out[k] = Boolean(v)
    return out
  }
  return {}
}

function getOptionItemId(option: HTMLElement): string | null {
  return (
    option.getAttribute("data-activity-item") ??
    option
      .querySelector<HTMLElement>("[data-activity-item]")
      ?.getAttribute("data-activity-item") ??
    null
  )
}

// Visual states. Outlines + faint background washes mirror the MC handler's
// look; multi-select adds a fourth "missed" state for correct options the
// learner did NOT check, so the answer key reveals after submit.
const MS_STYLE_FLAG_ATTR = "data-ms-style-state"
const MS_BADGE_ATTR = "data-ms-status-badge"
const MS_BADGE_SIZE = 22

const MS_OUTLINE_COLORS = {
  selected: "rgb(37, 99, 235)", // blue-600
  correct: "rgb(22, 163, 74)", // green-600
  incorrect: "rgb(220, 38, 38)", // red-600
} as const

const MS_BG_COLORS = {
  correct: "rgba(240, 253, 244, 0.6)",
  incorrect: "rgba(254, 242, 242, 0.6)",
} as const

type MsStyleState = "selected" | keyof typeof MS_BG_COLORS

function applyOutline(option: HTMLElement, state: MsStyleState): void {
  option.style.outline = `3px solid ${MS_OUTLINE_COLORS[state]}`
  option.style.outlineOffset = "2px"
  if (state !== "selected") {
    option.style.backgroundColor = MS_BG_COLORS[state]
  }
  option.setAttribute(MS_STYLE_FLAG_ATTR, state)
}

function clearOutline(option: HTMLElement): void {
  if (!option.hasAttribute(MS_STYLE_FLAG_ATTR)) return
  option.style.outline = ""
  option.style.outlineOffset = ""
  option.style.backgroundColor = ""
  option.removeAttribute(MS_STYLE_FLAG_ATTR)
}

function clearBadge(option: HTMLElement): void {
  option.querySelectorAll<HTMLElement>(`[${MS_BADGE_ATTR}]`).forEach((b) => b.remove())
}

function findBadgeAnchor(option: HTMLElement): HTMLElement {
  const letter = option.querySelector<HTMLElement>(".option-letter")
  if (letter) return letter
  return option
}

function attachBadge(option: HTMLElement, isCorrect: boolean): void {
  clearBadge(option)
  const badge = document.createElement("span")
  badge.setAttribute(MS_BADGE_ATTR, isCorrect ? "correct" : "incorrect")
  badge.setAttribute(
    "aria-label",
    isCorrect
      ? tr("multi-select-correct-answer", "Correct")
      : tr("multi-select-try-again", "Incorrect"),
  )
  badge.setAttribute("role", "status")
  Object.assign(badge.style, {
    position: "absolute",
    width: `${MS_BADGE_SIZE}px`,
    height: `${MS_BADGE_SIZE}px`,
    borderRadius: "9999px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "12px",
    color: "white",
    zIndex: "10",
    pointerEvents: "none",
    background: isCorrect ? "rgb(22, 163, 74)" : "rgb(220, 38, 38)",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  })

  const icon = document.createElement("i")
  icon.className = isCorrect ? "fas fa-check" : "fas fa-times"
  icon.setAttribute("aria-hidden", "true")
  badge.appendChild(icon)

  if (window.getComputedStyle(option).position === "static") {
    option.style.position = "relative"
  }
  option.appendChild(badge)

  const anchor = findBadgeAnchor(option)
  const anchorRect = anchor.getBoundingClientRect()
  const optionRect = option.getBoundingClientRect()
  const half = MS_BADGE_SIZE / 2
  badge.style.top = `${anchorRect.top - optionRect.top - half}px`
  badge.style.left = `${anchorRect.right - optionRect.left - half}px`
}

interface QuestionGroup {
  key: string
  options: HTMLElement[]
  selected: Set<HTMLElement>
  validated: boolean
}

function groupKeyForOption(option: HTMLElement): string {
  const checkbox = option.querySelector<HTMLInputElement>('input[type="checkbox"]')
  return checkbox?.name || DEFAULT_GROUP_KEY
}

function findOptionElements(section: HTMLElement): HTMLElement[] {
  const explicit = Array.from(section.querySelectorAll<HTMLElement>(".activity-option"))
  if (explicit.length > 0) return explicit
  const seen = new Set<HTMLElement>()
  const fallback: HTMLElement[] = []
  section
    .querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-activity-item]')
    .forEach((cb) => {
      const label = cb.closest<HTMLElement>("label")
      if (label && !seen.has(label)) {
        seen.add(label)
        fallback.push(label)
      }
    })
  return fallback
}

function buildGroups(section: HTMLElement): QuestionGroup[] {
  const byKey = new Map<string, HTMLElement[]>()
  findOptionElements(section).forEach((opt) => {
    const key = groupKeyForOption(opt)
    const list = byKey.get(key) ?? []
    list.push(opt)
    byKey.set(key, list)
  })
  const groups: QuestionGroup[] = []
  byKey.forEach((options, key) => {
    groups.push({ key, options, selected: new Set(), validated: false })
  })
  return groups
}

function findGroupForOption(
  groups: QuestionGroup[],
  option: HTMLElement,
): QuestionGroup | null {
  const key = groupKeyForOption(option)
  return groups.find((g) => g.key === key) ?? null
}

/**
 * Strip post-submit verdict styling from every option in the group while
 * leaving the selection set intact. Options that are still selected regain
 * the blue "selected" outline so they continue to look picked — the learner
 * can now add or remove individual checks without starting over.
 */
function clearGroupVerdict(group: QuestionGroup): void {
  for (const opt of group.options) {
    opt.removeAttribute("aria-invalid")
    clearOutline(opt)
    clearBadge(opt)
  }
  for (const opt of group.selected) {
    applyOutline(opt, "selected")
  }
  group.validated = false
}

function toggleSelection(option: HTMLElement, group: QuestionGroup): void {
  // After a submit, the group carries verdict styling (green/red outlines
  // and badges). The next toggle should drop the verdict so the learner can
  // see plain selection state again — but it must NOT wipe the selection
  // set, otherwise editing one pick forces the learner to re-check every
  // other option from scratch.
  if (group.validated) {
    clearGroupVerdict(group)
  }
  const input = option.querySelector<HTMLInputElement>('input[type="checkbox"]')
  const willBeChecked = !group.selected.has(option)
  if (willBeChecked) {
    group.selected.add(option)
    applyOutline(option, "selected")
    option.setAttribute("aria-checked", "true")
    if (input) input.checked = true
  } else {
    group.selected.delete(option)
    clearOutline(option)
    option.setAttribute("aria-checked", "false")
    if (input) input.checked = false
  }
}

function findNextPageHref(): string | null {
  const store = getDefaultStore()
  const pages = store.get(pagesAtom)
  const currentId = store.get(currentSectionIdAtom)
  if (!currentId) return null
  const idx = pages.findIndex((p) => p.section_id === currentId)
  if (idx < 0 || idx >= pages.length - 1) return null
  return pages[idx + 1].href
}

export function initializeMultiSelectActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(MS_SELECTOR)
  if (!section) return null

  const store = getDefaultStore()
  const correctAnswers = readCorrectAnswers(section)
  const groups = buildGroups(section)
  const hasNextPage = findNextPageHref() !== null

  function anySelected(): boolean {
    return groups.some((g) => g.selected.size > 0)
  }

  const resetState = () => {
    for (const g of groups) {
      g.selected.clear()
      g.validated = false
    }
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, hasNextPage)
  }

  const handleToggle = (option: HTMLElement) => {
    const group = findGroupForOption(groups, option)
    if (!group) return
    toggleSelection(option, group)
    playActivitySound("drop")
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, anySelected())
  }

  const handleValidate = () => {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }
    if (!anySelected()) return

    // For each group, the user passes when their selected SET equals the
    // correct SET. Visual feedback marks ONLY the options the learner picked
    // (green for right, red for wrong) — we never style unchecked options,
    // even correct ones the learner missed, because that would reveal the
    // answer key. The summary toast tells the learner how many are right;
    // they figure out which ones to add or remove on their next attempt.
    //
    // Toast counts are PER-OPTION across the whole section (not per-group),
    // so a section with 5 correct items and one wrong pick reads
    // "3 correct · 1 to review · 2 remaining" rather than the per-group
    // "1 to review" which collapses everything into a single bucket.
    let allCorrect = true
    let correctPicks = 0
    let wrongPicks = 0
    let missedCorrect = 0
    for (const group of groups) {
      if (group.selected.size === 0) {
        // Untouched group: don't reveal the answer key visually, but DO
        // count its correct items as "remaining" so the toast can tell the
        // learner how many are still left to find.
        allCorrect = false
        for (const option of group.options) {
          const itemId = getOptionItemId(option)
          if (itemId && correctAnswers[itemId]) missedCorrect++
        }
        continue
      }

      let groupCorrect = true
      for (const option of group.options) {
        const itemId = getOptionItemId(option)
        if (!itemId) continue
        const shouldBeChecked = Boolean(correctAnswers[itemId])
        const wasChecked = group.selected.has(option)
        if (wasChecked && shouldBeChecked) {
          applyOutline(option, "correct")
          attachBadge(option, true)
          correctPicks++
        } else if (wasChecked && !shouldBeChecked) {
          applyOutline(option, "incorrect")
          attachBadge(option, false)
          wrongPicks++
          groupCorrect = false
        } else {
          // Unchecked: no styling regardless of correctness. A missed
          // correct still causes the group to fail (below); we just don't
          // mark it visually.
          clearOutline(option)
          clearBadge(option)
          if (shouldBeChecked) {
            missedCorrect++
            groupCorrect = false
          }
        }
        option.setAttribute(
          "aria-invalid",
          wasChecked && !shouldBeChecked ? "true" : "false",
        )
      }
      group.validated = true
      if (!groupCorrect) allCorrect = false
    }

    playActivitySound(allCorrect ? "success" : "error")
    // `total` is constructed so the toast's internal identity
    //   wrong = total − correct − unfilled
    // recovers `wrongPicks`. The label override turns the legacy "empty"
    // bucket into "remaining" — the natural multi-select phrasing for
    // correct items the learner hasn't checked yet.
    showActivityProgressToast(
      {
        total: correctPicks + wrongPicks + missedCorrect,
        correct: correctPicks,
        unfilled: missedCorrect,
      },
      {
        emptyLabel: tr("activity-progress-remaining", "remaining"),
      },
    )

    if (allCorrect) {
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
    } else {
      store.set(submitStateAtom, "submit")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, anySelected())
    }
  }

  const handleSkip = () => {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  // WCAG 4.1.2: a list of `role="checkbox"` options needs a `role="group"`
  // container with an accessible name. Multi-select doesn't have a
  // radio-group analogue (the options aren't mutually exclusive), so a
  // plain group with a label is the right ARIA role.
  section.setAttribute("role", "group")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr(
        "multi-select-options-label",
        "Answer options — select all that apply",
      ),
    )
  }
  applyLocalizedAria()

  /**
   * Derive an accessible name for the option label. Prefer the inner
   * checkbox's `aria-label` (which the LLM is instructed to emit), and
   * fall back to the option's visible text content. We compute this once
   * at init since the visible text doesn't change after render.
   */
  function computeOptionName(option: HTMLElement): string {
    const innerInput = option.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    const innerAria = innerInput?.getAttribute("aria-label")?.trim()
    if (innerAria) return innerAria
    // textContent includes whitespace from indentation; collapse it.
    return (option.textContent ?? "").replace(/\s+/g, " ").trim()
  }

  const listeners: Array<() => void> = []
  for (const group of groups) {
    for (const option of group.options) {
      const onClick = (e: Event) => {
        // Clicking the inner <input> already fires native `change`; if we
        // also handle the wrapping label's click, the toggle fires twice
        // and cancels itself. Skip the label's click when the event target
        // is the checkbox itself.
        const target = e.target as HTMLElement | null
        if (target?.tagName === "INPUT") return
        e.preventDefault()
        handleToggle(option)
      }
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleToggle(option)
        }
      }
      option.addEventListener("click", onClick)
      option.addEventListener("keydown", onKey)
      // Promote the wrapping <label> to the canonical checkbox surface for
      // assistive tech: role + state + a focusable tab stop + an explicit
      // accessible name. Without aria-label, AT resolution of a custom-role
      // checkbox containing a hidden native input is browser-dependent.
      option.setAttribute("role", "checkbox")
      option.setAttribute("aria-checked", "false")
      option.setAttribute("tabindex", "0")
      if (!option.hasAttribute("aria-label")) {
        const name = computeOptionName(option)
        if (name) option.setAttribute("aria-label", name)
      }

      const innerCheckbox = option.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      )
      if (innerCheckbox) {
        // The inner native input is `sr-only` (visible to AT). With the
        // wrapping label already exposed as a checkbox, leaving the native
        // input visible to AT causes double announcements and a duplicate
        // tab stop. Hide it from the accessibility tree and remove it from
        // the tab order — pointer + keyboard input still reaches the label.
        innerCheckbox.setAttribute("aria-hidden", "true")
        innerCheckbox.setAttribute("tabindex", "-1")
        // Defensive init: clear any pre-checked state from server-rendered
        // HTML or browser autofill so the native input agrees with our
        // empty `group.selected` set. Without this the first user click on
        // an autofilled checkbox would set our state to selected while the
        // native input was already checked — visually fine (sr-only hides
        // it) but a confusing source of state divergence.
        innerCheckbox.checked = false

        const onChange = () => {
          // The native checkbox's checked state may now disagree with our
          // group state — sync via toggleSelection by setting it back and
          // calling our handler. We compare to group.selected to decide
          // whether the native flip should add or remove.
          const isInGroup = group.selected.has(option)
          if (innerCheckbox.checked !== isInGroup) handleToggle(option)
        }
        innerCheckbox.addEventListener("change", onChange)
        listeners.push(() => innerCheckbox.removeEventListener("change", onChange))
      }

      listeners.push(() => {
        option.removeEventListener("click", onClick)
        option.removeEventListener("keydown", onKey)
      })
    }
  }

  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  resetState()

  const unsubTranslations = store.sub(translationsAtom, () => {
    applyLocalizedAria()
    // Re-attach badges so the localized aria-label refreshes.
    for (const group of groups) {
      if (!group.validated) continue
      for (const option of group.options) {
        const state = option.getAttribute(MS_STYLE_FLAG_ATTR)
        if (state === "correct") attachBadge(option, true)
        else if (state === "incorrect") attachBadge(option, false)
      }
    }
  })

  return () => {
    listeners.forEach((off) => off())
    unsubTranslations()
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}

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
  submitVisibleAtom,
  validateHandlerAtom,
} from "@/features/activity/state/activity.atoms"
import { playActivitySound } from "@/features/activity/runtime/sounds"
import { showActivityProgressToast } from "@/features/activity/lib/progress-toast"
import { isAnyModalOpen } from "@/features/navigation/lib/modal-state"
import { dockMenuValueAtom, sidebarOpenAtom } from "@/shared/state/ui.atoms"

/**
 * Quiz (standalone `activity_quiz` page) and in-page `activity_multiple_choice`
 * share the same option-selection model: one set of `.activity-option` labels,
 * each carrying a unique `data-activity-item`, with a correctness map keyed by
 * those item IDs. The two diverge in:
 *   - where the correct-answers map lives (`data-correct-answers` attribute /
 *     embedded <script> for quiz; `window.correctAnswers` for MC),
 *   - cardinality: a section may host MULTIPLE multiple-choice question
 *     groups, each identified by its inner radio's `name` attribute. Each
 *     group tracks its own selection + validation state independently.
 *     Standalone quiz pages use a single synthetic group.
 */
const QUIZ_SELECTOR =
  'section[data-section-type="activity_quiz"], section[data-section-type="activity_multiple_choice"]'
const CORRECT_ANSWERS_SCRIPT_ID = "quiz-correct-answers"
const DEFAULT_GROUP_KEY = "__default__"

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

declare global {
  interface Window {
    /**
     * Map of item id → correctness. Multiple-choice ships boolean values;
     * other text-input activities ship strings. Injected by
     * `packages/pipeline/src/package-web.ts:renderPageHtml`.
     */
    correctAnswers?: Record<string, unknown>
  }
}

function readCorrectAnswers(section: HTMLElement): Record<string, boolean> {
  const attr = section.getAttribute("data-correct-answers")
  if (attr) {
    try {
      return JSON.parse(attr) as Record<string, boolean>
    } catch {
      // fall through to script tag
    }
  }
  const scriptEl = document.getElementById(CORRECT_ANSWERS_SCRIPT_ID)
  if (scriptEl?.textContent) {
    try {
      return JSON.parse(scriptEl.textContent) as Record<string, boolean>
    } catch {
      // fall through to window global
    }
  }
  // Multiple-choice sections rely on the global written by renderPageHtml.
  if (typeof window !== "undefined" && window.correctAnswers) {
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(window.correctAnswers)) out[k] = Boolean(v)
    return out
  }
  return {}
}

function resolveExplanation(option: HTMLElement): string | null {
  const explanationId = option.getAttribute("data-explanation-id")
  if (explanationId) {
    const dict = getDefaultStore().get(translationsAtom)
    if (dict[explanationId]) return dict[explanationId]
  }
  return option.getAttribute("data-explanation")
}

function getOptionItemId(option: HTMLElement): string | null {
  // Standalone quiz puts `data-activity-item` on the `.activity-option` label
  // itself; multiple-choice puts it on the inner radio input.
  return (
    option.getAttribute("data-activity-item") ??
    option
      .querySelector<HTMLElement>("[data-activity-item]")
      ?.getAttribute("data-activity-item") ??
    null
  )
}

// Standalone-quiz selection styling. The standalone quiz template bakes
// `.selected-option { ... }` into its inline CSS; these utility classes are
// the runtime supplement that gives the same visual identity for image-only
// or image-plus-text option layouts.
const SELECTION_HIGHLIGHT_CLASSES = ["ring-2", "ring-blue-400", "bg-blue-50"]
const VERDICT_CLASSES = [
  "bg-green-50",
  "bg-red-50",
  "border-green-500",
  "border-red-500",
]

// Multiple-choice (embedded `activity_multiple_choice`) visual states. The
// runtime owns these so the look is consistent regardless of how the LLM
// laid out the option (image card, text row, inline pill). Outlines are
// applied as inline styles (not Tailwind classes) so they work on existing
// rendered pages without rebuilding the per-book CSS.
const MC_STYLE_FLAG_ATTR = "data-mc-style-state"
const MC_BADGE_ATTR = "data-mc-status-badge"
const MC_BADGE_SIZE = 22

const MC_OUTLINE_COLORS = {
  selected: "rgb(37, 99, 235)", // blue-600
  correct: "rgb(22, 163, 74)", // green-600
  incorrect: "rgb(220, 38, 38)", // red-600
} as const

const QUIZ_FOCUS_OUTLINE = `3px solid ${MC_OUTLINE_COLORS.selected}`

// Only correct/incorrect get a faint wash; selected gets outline only so the
// option's own background (often supplied by the LLM via a `bg-*` class) is
// preserved and the user doesn't see a flash to transparent when picking.
const MC_BG_COLORS = {
  correct: "rgba(240, 253, 244, 0.6)",
  incorrect: "rgba(254, 242, 242, 0.6)",
} as const

type McStyleState = "selected" | keyof typeof MC_BG_COLORS

function applyMcOutline(option: HTMLElement, state: McStyleState): void {
  option.style.outline = `3px solid ${MC_OUTLINE_COLORS[state]}`
  // The outline follows the option's natural border-radius in modern browsers
  // — don't impose an inline radius here or we'll flatten LLM-emitted shapes
  // like `rounded-full` pills.
  option.style.outlineOffset = "2px"
  if (state !== "selected") {
    option.style.backgroundColor = MC_BG_COLORS[state]
  }
  option.setAttribute(MC_STYLE_FLAG_ATTR, state)
}

function clearMcOutline(option: HTMLElement): void {
  if (!option.hasAttribute(MC_STYLE_FLAG_ATTR)) return
  option.style.outline = ""
  option.style.outlineOffset = ""
  option.style.backgroundColor = ""
  option.removeAttribute(MC_STYLE_FLAG_ATTR)
}

function clearMcBadge(option: HTMLElement): void {
  option
    .querySelectorAll<HTMLElement>(`[${MC_BADGE_ATTR}]`)
    .forEach((b) => b.remove())
}

/**
 * Pick the most "anchor-like" child of an option to dock the status badge
 * against. Prefers the visible A/B/C/D letter circle when present; otherwise
 * falls back to the option's own bounding box (top-right corner). We
 * deliberately don't anchor to the radio input — it's almost always
 * `sr-only` with unreliable rendered position, and on inline pills the
 * sr-only radio sits centered inside the pill, dragging the badge across
 * the answer text.
 */
function findBadgeAnchor(option: HTMLElement): HTMLElement {
  const letter = option.querySelector<HTMLElement>(".option-letter")
  if (letter) return letter
  return option
}

/**
 * Inject a small green/red badge with a check or cross icon at the top-right
 * corner of the option's "anchor" element. This is the non-color WCAG 1.4.1
 * cue that pairs with the outline color — the icon shape says "correct" or
 * "incorrect" plainly even when color perception is degraded.
 */
function attachMcBadge(option: HTMLElement, isCorrect: boolean): void {
  clearMcBadge(option)
  const badge = document.createElement("span")
  badge.setAttribute(MC_BADGE_ATTR, isCorrect ? "correct" : "incorrect")
  badge.setAttribute(
    "aria-label",
    isCorrect
      ? tr("multiple-choice-correct-answer", "Correct")
      : tr("multiple-choice-try-again", "Incorrect"),
  )
  badge.setAttribute("role", "status")
  badge.style.position = "absolute"
  badge.style.width = `${MC_BADGE_SIZE}px`
  badge.style.height = `${MC_BADGE_SIZE}px`
  badge.style.borderRadius = "9999px"
  badge.style.display = "flex"
  badge.style.alignItems = "center"
  badge.style.justifyContent = "center"
  badge.style.fontSize = "12px"
  badge.style.color = "white"
  badge.style.zIndex = "10"
  badge.style.pointerEvents = "none"
  badge.style.background = isCorrect ? "rgb(22, 163, 74)" : "rgb(220, 38, 38)"
  badge.style.boxShadow = "0 1px 3px rgba(0,0,0,0.2)"

  const icon = document.createElement("i")
  icon.className = isCorrect ? "fas fa-check" : "fas fa-times"
  icon.setAttribute("aria-hidden", "true")
  badge.appendChild(icon)

  // Option must establish a positioning context for the absolute badge.
  if (window.getComputedStyle(option).position === "static") {
    option.style.position = "relative"
  }
  option.appendChild(badge)

  // Position the badge so its center sits on the top-right corner of the
  // anchor element. Done with getBoundingClientRect AFTER append so we have
  // real measurements; if the anchor is the option itself the result is a
  // top-right corner badge on the whole option.
  const anchor = findBadgeAnchor(option)
  const anchorRect = anchor.getBoundingClientRect()
  const optionRect = option.getBoundingClientRect()
  const half = MC_BADGE_SIZE / 2
  badge.style.top = `${anchorRect.top - optionRect.top - half}px`
  badge.style.left = `${anchorRect.right - optionRect.left - half}px`
}

interface QuestionGroup {
  key: string
  options: HTMLElement[]
  selected: HTMLElement | null
  validated: boolean
}

function groupKeyForOption(option: HTMLElement): string {
  const radio = option.querySelector<HTMLInputElement>('input[type="radio"]')
  return radio?.name || DEFAULT_GROUP_KEY
}

/**
 * Find every option label in the section. Preferred path is the explicit
 * `.activity-option` class emitted by the prompt; the fallback handles MC
 * pages where the LLM invented a custom layout (e.g. an image grid) and
 * dropped the class — we pick the nearest <label> for each radio that
 * carries `data-activity-item`. The QUIZ_SELECTOR scopes this to
 * quiz/multiple-choice sections, so this won't pick up true-false radios.
 */
function findOptionElements(section: HTMLElement): HTMLElement[] {
  const explicit = Array.from(
    section.querySelectorAll<HTMLElement>(".activity-option"),
  )
  if (explicit.length > 0) return explicit
  const seen = new Set<HTMLElement>()
  const fallback: HTMLElement[] = []
  section
    .querySelectorAll<HTMLInputElement>(
      'input[type="radio"][data-activity-item]',
    )
    .forEach((radio) => {
      const label = radio.closest<HTMLElement>("label")
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
    groups.push({ key, options, selected: null, validated: false })
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

function clearOptionState(option: HTMLElement, isStandaloneQuiz: boolean): void {
  option.classList.remove(
    "selected-option",
    ...SELECTION_HIGHLIGHT_CLASSES,
    ...VERDICT_CLASSES,
  )
  option.removeAttribute("aria-invalid")
  option.setAttribute("aria-checked", "false")
  const input = option.querySelector<HTMLInputElement>('input[type="radio"]')
  if (input) input.checked = false
  if (isStandaloneQuiz) {
    option.style.borderColor = ""
    option.style.outline = ""
    option.style.outlineOffset = ""
  } else {
    clearMcOutline(option)
    clearMcBadge(option)
  }
  const feedback = option.querySelector<HTMLElement>(".feedback-container")
  if (feedback) {
    feedback.classList.add("hidden")
    const text = feedback.querySelector<HTMLElement>(".feedback-text")
    if (text) {
      text.textContent = ""
      text.className = "feedback-text"
    }
  }
}

function clearGroupStyles(group: QuestionGroup, isStandaloneQuiz: boolean): void {
  group.options.forEach((opt) => clearOptionState(opt, isStandaloneQuiz))
}

function markSelection(
  option: HTMLElement,
  group: QuestionGroup,
  isStandaloneQuiz: boolean,
): void {
  clearGroupStyles(group, isStandaloneQuiz)
  if (isStandaloneQuiz) {
    option.classList.add("selected-option", ...SELECTION_HIGHLIGHT_CLASSES)
  } else {
    applyMcOutline(option, "selected")
  }
  option.setAttribute("aria-checked", "true")
  const input = option.querySelector<HTMLInputElement>('input[type="radio"]')
  if (input) input.checked = true
}

function applyValidationStyle(
  option: HTMLElement,
  isCorrect: boolean,
  isStandaloneQuiz: boolean,
): void {
  if (isStandaloneQuiz) {
    // Strip the blue selection ring so it doesn't fight the green/red verdict.
    option.classList.remove("selected-option", ...SELECTION_HIGHLIGHT_CLASSES)
    option.classList.add(isCorrect ? "bg-green-50" : "bg-red-50")
    const verdictColor = isCorrect
      ? MC_OUTLINE_COLORS.correct
      : MC_OUTLINE_COLORS.incorrect
    option.style.borderColor = verdictColor
    option.style.outline = `3px solid ${verdictColor}`
    option.style.outlineOffset = "2px"
  } else {
    // Keep the outline (now green/red) so the badge has something to dock on
    // and the verdict is visible from across the page.
    applyMcOutline(option, isCorrect ? "correct" : "incorrect")
    attachMcBadge(option, isCorrect)
  }
  option.setAttribute("aria-invalid", isCorrect ? "false" : "true")
}

/**
 * Per-option text feedback. Standalone quiz pages keep their LLM-emitted
 * `.feedback-container` slot ("Great job! …"). Multi-choice is badge-only —
 * the dock toast at the top of the page handles the summary message, which
 * works across the variable MC layouts (pills, text rows, image cards) far
 * more reliably than trying to dock a text caption to each option.
 */
function showFeedback(
  option: HTMLElement,
  isCorrect: boolean,
  isStandaloneQuiz: boolean,
): void {
  if (!isStandaloneQuiz) return
  const container = option.querySelector<HTMLElement>(".feedback-container")
  if (!container) return
  container.classList.remove("hidden")
  let text = container.querySelector<HTMLElement>(".feedback-text")
  if (!text) {
    text = document.createElement("div")
    text.className = "feedback-text"
    container.appendChild(text)
  }
  const explanation = resolveExplanation(option)
  text.textContent =
    explanation ||
    (isCorrect
      ? tr("multiple-choice-correct-answer", "Correct!")
      : tr("multiple-choice-try-again", "Try again"))
  text.className = `feedback-text text-lg font-semibold ${
    isCorrect ? "text-green-800" : "text-red-800"
  }`
  container.setAttribute("role", isCorrect ? "status" : "alert")
  container.setAttribute("aria-live", "polite")
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

export function initializeQuizActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(QUIZ_SELECTOR)
  if (!section) return null

  const store = getDefaultStore()
  const correctAnswers = readCorrectAnswers(section)

  // On success the dock advances to the next page — for both standalone quiz
  // pages and embedded multiple-choice. (Standalone quizzes previously skipped
  // ahead to the next `qz` page; they now move one page like any other content
  // so the reader can't accidentally jump past intervening reading pages.)
  const sectionType = section.getAttribute("data-section-type")
  const isStandaloneQuiz = sectionType === "activity_quiz"
  const findPostCorrectHref = findNextPageHref

  // Standalone quizzes validate the instant an option is picked — no Submit
  // button, and the number keys (1/2/3…) pick-and-check too. Embedded
  // multiple-choice keeps the pick-then-Submit model because a single page can
  // host several question groups that must all be answered before checking.
  const immediateValidation = isStandaloneQuiz

  const groups = buildGroups(section)
  const hasNextPage = findNextPageHref() !== null
  const hasPostCorrectTarget = findPostCorrectHref() !== null

  function anyGroupSelected(): boolean {
    return groups.some((g) => g.selected !== null)
  }

  const resetState = () => {
    for (const g of groups) {
      g.selected = null
      g.validated = false
    }
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, hasNextPage)
    // Immediate-validation quizzes have no button to show.
    store.set(submitVisibleAtom, !immediateValidation)
  }

  const validateImmediately = (option: HTMLElement, group: QuestionGroup) => {
    // Re-clicking the option that's already marked is a no-op so we don't
    // re-fire confetti / sounds on every repeat click.
    if (group.validated && group.selected === option) return
    clearGroupStyles(group, isStandaloneQuiz)
    const input = option.querySelector<HTMLInputElement>('input[type="radio"]')
    if (input) input.checked = true
    option.setAttribute("aria-checked", "true")
    group.selected = option

    const itemId = getOptionItemId(option)
    const isCorrect = itemId ? Boolean(correctAnswers[itemId]) : false
    applyValidationStyle(option, isCorrect, isStandaloneQuiz)
    showFeedback(option, isCorrect, isStandaloneQuiz)
    group.validated = true
    playActivitySound(isCorrect ? "success" : "error")

    if (isCorrect) {
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      // Reveal the Next button so the reader can advance — parity with the
      // Submit→Next flow multiple-choice uses. `handleValidate` (the button's
      // handler) navigates when the state is "next". Enabled only when a next
      // page actually exists (disabled on the final page).
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasPostCorrectTarget)
      store.set(submitVisibleAtom, true)
    } else {
      // Wrong pick — keep the button hidden; the reader simply picks again.
      store.set(submitStateAtom, "submit")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, false)
      store.set(submitVisibleAtom, false)
    }
  }

  const handleSelect = (option: HTMLElement) => {
    const group = findGroupForOption(groups, option)
    if (!group) return
    // Land focus on the option label, never the native radio. A focused native
    // radio arrow-navigates its group and swallows the reader's arrow-key page
    // turn (e.g. Thorium in the JS EPUB); the label doesn't, so arrow keys pass
    // through. Selection stays keyboard-accessible via Enter/Space + number keys.
    if (option !== document.activeElement) option.focus()
    if (immediateValidation) {
      validateImmediately(option, group)
      return
    }
    if (group.validated) clearGroupStyles(group, isStandaloneQuiz)
    markSelection(option, group, isStandaloneQuiz)
    playActivitySound("drop")
    group.selected = option
    group.validated = false
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, anyGroupSelected())
  }

  const handleValidate = () => {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      // Post-correct: advance to the next page in reading order.
      const href = findPostCorrectHref()
      if (href) window.location.href = href
      return
    }
    if (!anyGroupSelected()) return

    // Validate every group that has a selection. The section flips to the
    // post-correct state only when EVERY group is answered AND every selection
    // is correct — partial successes stay in submit so the user can fix wrong
    // picks or fill missing ones.
    let allCorrect = true
    let correctCount = 0
    let unansweredCount = 0
    for (const group of groups) {
      if (!group.selected) {
        allCorrect = false
        unansweredCount++
        continue
      }
      const itemId = getOptionItemId(group.selected)
      if (!itemId) {
        allCorrect = false
        continue
      }
      const isCorrect = Boolean(correctAnswers[itemId])
      applyValidationStyle(group.selected, isCorrect, isStandaloneQuiz)
      showFeedback(group.selected, isCorrect, isStandaloneQuiz)
      group.validated = true
      if (isCorrect) correctCount++
      else allCorrect = false
    }

    playActivitySound(allCorrect ? "success" : "error")

    // Summary toast for multiple-choice. Standalone quiz keeps its
    // per-option text feedback ("Great job!") and skips the toast to avoid
    // duplicating the message.
    if (!isStandaloneQuiz) {
      showActivityProgressToast({
        total: groups.length,
        correct: correctCount,
        unfilled: unansweredCount,
      })
    }

    if (allCorrect) {
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      // Submit becomes "Next" — enabled only when a next page exists.
      store.set(submitEnabledAtom, hasPostCorrectTarget)
    } else {
      store.set(submitStateAtom, "submit")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, anyGroupSelected())
    }
  }

  const handleSkip = () => {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  // WCAG 4.1.2: a list of `role="radio"` options is meaningless to screen
  // readers without a `role="radiogroup"` container that names the group.
  // The section ships with `role="article"` from the template — override it
  // since the section's primary semantic here IS the radio group. For
  // multi-group sections this is best-effort: ideally each <fieldset>/<div>
  // around a single question would carry the radiogroup, but the prompt
  // doesn't currently emit that container.
  section.setAttribute("role", "radiogroup")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr("activity-options-label", "Answer options"),
    )
  }
  applyLocalizedAria()

  const listeners: Array<() => void> = []
  for (const group of groups) {
    group.options.forEach((option) => {
      const onClick = () => handleSelect(option)
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          handleSelect(option)
        }
      }
      const onFocus = () => {
        if (
          option.hasAttribute("aria-invalid") ||
          option.hasAttribute(MC_STYLE_FLAG_ATTR)
        ) {
          return
        }
        option.style.outline = QUIZ_FOCUS_OUTLINE
        option.style.outlineOffset = "2px"
      }
      const onBlur = () => {
        if (
          option.hasAttribute("aria-invalid") ||
          option.hasAttribute(MC_STYLE_FLAG_ATTR)
        ) {
          return
        }
        option.style.outline = ""
        option.style.outlineOffset = ""
      }
      option.addEventListener("click", onClick)
      option.addEventListener("keydown", onKey)
      option.addEventListener("focus", onFocus)
      option.addEventListener("blur", onBlur)
      option.setAttribute("role", "radio")
      option.setAttribute("aria-checked", "false")
      // Focus the label instead of the native radio: Tab can still reach every
      // answer and Enter/Space selects it, while ArrowLeft/ArrowRight remain
      // available to host readers such as Apple Books for page navigation.
      option.setAttribute("tabindex", "0")

      // Arrow-key navigation between native radios fires `change` on the new
      // radio without firing `click` on its label. Listen here too so keyboard
      // users actually see selection state update.
      const innerRadio = option.querySelector<HTMLInputElement>(
        'input[type="radio"]',
      )
      if (innerRadio) {
        // Keep native radios out of the tab order so keyboard focus lands on the
        // option label (which doesn't arrow-navigate), leaving the reader's
        // arrow-key page turn free. Selection is still driven by Enter/Space and
        // the number keys.
        innerRadio.setAttribute("tabindex", "-1")
        const onChange = () => {
          if (innerRadio.checked) handleSelect(option)
        }
        innerRadio.addEventListener("change", onChange)
        listeners.push(() =>
          innerRadio.removeEventListener("change", onChange),
        )
      }

      listeners.push(() => {
        option.removeEventListener("click", onClick)
        option.removeEventListener("keydown", onKey)
        option.removeEventListener("focus", onFocus)
        option.removeEventListener("blur", onBlur)
      })
    })
  }

  // Standalone quiz: pressing a number key picks-and-checks the matching option
  // (1 → first option, 2 → second, …). Scoped to the single-group quiz page;
  // multiple-choice keeps arrow-key radio navigation since its number mapping
  // would be ambiguous across question groups.
  if (immediateValidation) {
    const onNumberKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.altKey || e.ctrlKey || e.metaKey) return
      // Defer to whatever surface owns the keyboard: an open sidebar, dock
      // menu, or modal/popover overlays the quiz, so the digit shouldn't reach
      // it. (Mirrors the guards in useKeyboardPageNav; all no-ops in the WebPub
      // bundle, which ships none of that chrome.)
      if (store.get(sidebarOpenAtom) || store.get(dockMenuValueAtom) !== "") {
        return
      }
      if (isAnyModalOpen()) return
      const active = document.activeElement as HTMLElement | null
      // Don't hijack digits typed into a real text field. A focused quiz radio
      // is fine — that's the reader answering, which is exactly what we want.
      if (
        active &&
        (active.isContentEditable ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT" ||
          (active.tagName === "INPUT" &&
            (active as HTMLInputElement).type !== "radio"))
      ) {
        return
      }
      const index = Number.parseInt(e.key, 10) - 1
      if (!Number.isInteger(index) || index < 0) return
      const option = groups[0]?.options[index]
      if (!option) return
      e.preventDefault()
      handleSelect(option)
    }
    document.addEventListener("keydown", onNumberKey)
    listeners.push(() => document.removeEventListener("keydown", onNumberKey))
  }

  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  resetState()

  // The feedback text and the section's aria-label are written into the DOM
  // imperatively (no `[data-id]`), so `applyTranslationsToDOM` won't touch
  // them on a language switch. Re-render them whenever the translation map
  // changes so the visible result message stays in sync with the chrome.
  const unsubTranslations = store.sub(translationsAtom, () => {
    applyLocalizedAria()
    for (const group of groups) {
      if (!group.validated || !group.selected) continue
      const itemId = getOptionItemId(group.selected)
      if (!itemId) continue
      const isCorrect = Boolean(correctAnswers[itemId])
      showFeedback(group.selected, isCorrect, isStandaloneQuiz)
      // showFeedback is a no-op for MC, so the badge's aria-label would stay
      // in the previous language. Re-attach so the localized label refreshes.
      if (!isStandaloneQuiz) attachMcBadge(group.selected, isCorrect)
    }
  })

  return () => {
    listeners.forEach((off) => off())
    unsubTranslations()
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
    store.set(submitVisibleAtom, true)
  }
}

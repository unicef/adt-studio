/**
 * Open-ended-answer initializer — wires the dock submit button via atoms,
 * validates each text input against the gibberish/profanity filters on
 * submit, and persists user input across reloads.
 *
 * Activity HTML is emitted by `prompts/activity_open_ended_answer.liquid` and
 * `packages/pipeline/src/package-web.ts`:
 *   - <section data-section-type="activity_open_ended_answer">
 *   - Plain <input type="text"> and <textarea> elements outside any data-id
 *     element, each carrying a unique `data-aria-id`
 *
 * Unlike fill-in-the-blank, there are no `correctAnswers` — any non-empty,
 * non-gibberish, non-profane text counts as accepted.
 */
import { getDefaultStore } from "jotai"
import { translationsAtom } from "../../language/state/language.atoms"
import {
  pagesAtom,
  currentSectionIdAtom,
} from "../../navigation/state/nav.atoms"
import {
  skipEnabledAtom,
  skipHandlerAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { playActivitySound } from "./sounds"
import {
  applyFeedback,
  clearInputValidationFeedback,
  clearSectionFeedback,
} from "../lib/feedback"
import { showActivityProgressToast } from "../lib/progress-toast"
import { announceToScreenReader } from "../../../shared/lib/aria-live"
import { containsProfanity } from "../lib/profanity-detector"
import { getSharedTextValidator } from "../lib/text-validator"

// :not([data-activity-variant="stepper"]) — sections converted to the
// step-by-step presentation are rendered by activity-stepper.tsx instead.
const OPEN_ENDED_SELECTOR =
  'section[data-section-type="activity_open_ended_answer"]:not([data-activity-variant="stepper"])'

type TextInput = HTMLInputElement | HTMLTextAreaElement
type InputVerdict = "empty" | "clean" | "gibberish" | "profanity"

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
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

function persistenceKey(input: TextInput): string | null {
  const ariaId = input.getAttribute("data-aria-id")
  if (!ariaId) return null
  const activityId = location.pathname
    .substring(location.pathname.lastIndexOf("/") + 1)
    .split(".")[0]
  return `${activityId}_${ariaId}`
}

function saveInputState(input: TextInput): void {
  const key = persistenceKey(input)
  if (key) localStorage.setItem(key, input.value)
}

function loadInputState(inputs: NodeListOf<TextInput>): void {
  inputs.forEach((input) => {
    const key = persistenceKey(input)
    if (!key) return
    const saved = localStorage.getItem(key)
    if (saved !== null) input.value = saved
  })
}

function getActivityInputs(section: HTMLElement): NodeListOf<TextInput> {
  return section.querySelectorAll<TextInput>(
    'input[type="text"]:not(#filter-input), textarea:not(#filter-input)',
  )
}

async function classifyInput(input: TextInput): Promise<InputVerdict> {
  const value = input.value.trim()
  if (value === "") return "empty"
  if (containsProfanity(value)) return "profanity"
  const validator = getSharedTextValidator()
  const ok = await validator.isValidText(value)
  return ok ? "clean" : "gibberish"
}

function updateSubmitEnabled(section: HTMLElement): void {
  const inputs = getActivityInputs(section)
  let anyFilled = false
  inputs.forEach((i) => {
    if (i.value.trim() !== "") anyFilled = true
  })
  getDefaultStore().set(submitEnabledAtom, anyFilled)
}

interface FullValidationResult {
  total: number
  cleanCount: number
  emptyCount: number
  flaggedCount: number
  firstEmpty: TextInput | null
  firstFlagged: TextInput | null
}

async function validateAll(section: HTMLElement): Promise<FullValidationResult> {
  clearSectionFeedback(section)

  let total = 0
  let cleanCount = 0
  let emptyCount = 0
  let flaggedCount = 0
  let firstEmpty: TextInput | null = null
  let firstFlagged: TextInput | null = null

  const inputs = Array.from(getActivityInputs(section))
  for (const input of inputs) {
    total++
    const verdict = await classifyInput(input)
    if (verdict === "empty") {
      emptyCount++
      if (!firstEmpty) firstEmpty = input
      continue
    }
    if (verdict === "clean") {
      cleanCount++
      continue
    }
    // Gibberish / profanity — apply visible feedback and remember the first
    // so the submit handler can move focus there.
    flaggedCount++
    if (!firstFlagged) firstFlagged = input
    applyFeedback(input, verdict)
  }

  return {
    total,
    cleanCount,
    emptyCount,
    flaggedCount,
    firstEmpty,
    firstFlagged,
  }
}

export function initializeOpenEndedActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const found = document.querySelector<HTMLElement>(OPEN_ENDED_SELECTOR)
  if (!found) return null
  const section: HTMLElement = found

  const store = getDefaultStore()

  // Promote ARIA — the prompt forbids the section from carrying role="activity",
  // but we still want it announced as a form for assistive tech.
  if (!section.getAttribute("role")) section.setAttribute("role", "form")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr("open-ended-activity-label", "Open-ended answer activity"),
    )
  }
  applyLocalizedAria()

  const initialInputs = getActivityInputs(section)
  loadInputState(initialInputs)

  const hasNextPage = findNextPageHref() !== null
  let listenerCleanups: Array<() => void> = []
  // Re-entry guard: validation is async (the text validator awaits per input),
  // so a user double-click could fire two parallel validateAll loops that
  // interleave DOM feedback and play `success`/`error` sounds twice. Block
  // the second click until the first finishes.
  let validationInFlight = false

  function attachInputListeners(): void {
    listenerCleanups.forEach((off) => off())
    listenerCleanups = []

    getActivityInputs(section).forEach((input) => {
      const onInput = () => {
        // Clear any stale validation feedback so the user isn't staring at a
        // red border while they're editing. Re-validation happens on submit.
        clearInputValidationFeedback(input)
        saveInputState(input)
        // Once the user has cleared (a clean) submit, the button is in "next"
        // state (nav). Don't let further editing flip submitEnabled off —
        // that would strand the user with a disabled "Next activity" button.
        if (store.get(submitStateAtom) === "submit") {
          updateSubmitEnabled(section)
        }
      }
      const onFocus = () => {
        input.classList.add("border-blue-500", "ring-2", "ring-blue-200")
      }
      const onBlur = () => {
        input.classList.remove("border-blue-500", "ring-2", "ring-blue-200")
      }
      input.addEventListener("input", onInput)
      input.addEventListener("focus", onFocus)
      input.addEventListener("blur", onBlur)
      listenerCleanups.push(() => {
        input.removeEventListener("input", onInput)
        input.removeEventListener("focus", onFocus)
        input.removeEventListener("blur", onBlur)
      })
    })
  }

  function resetSubmit(): void {
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(skipEnabledAtom, hasNextPage)
    updateSubmitEnabled(section)
  }

  async function runValidation(): Promise<void> {
    const result = await validateAll(section)
    const { total, cleanCount, emptyCount, flaggedCount, firstEmpty, firstFlagged } =
      result

    // "Accepted" = filled and clean. We treat "all accepted" as the success
    // criterion. Open-ended doesn't grade against a correct answer, so the
    // confetti from FITB is deliberately omitted — the celebration is softer.
    const allAccepted = total > 0 && cleanCount === total

    playActivitySound(allAccepted ? "success" : "error")
    // Open-ended doesn't grade for "correct"-ness — there's no answer key. Use
    // "complete" in the progress count and "saved" in the success message.
    showActivityProgressToast(
      { total, correct: cleanCount, unfilled: emptyCount },
      {
        correctLabel: tr("open-ended-progress-complete", "complete"),
        allCorrectMessage: tr(
          "open-ended-all-saved",
          "Your responses have been saved",
        ),
      },
    )

    if (allAccepted) {
      announceToScreenReader(
        tr("open-ended-all-accepted", "All answers accepted."),
        { assertive: true },
      )
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
      return
    }

    // Pick the most-actionable announcement: prefer "empty blanks" guidance
    // when relevant, fall back to "needs attention" for gibberish/profanity.
    if (emptyCount > 0) {
      const msg = tr("open-ended-blanks-remaining", "${count} answers still empty.")
        .replace("${count}", String(emptyCount))
      announceToScreenReader(msg, { assertive: true })
    } else if (flaggedCount > 0) {
      announceToScreenReader(
        tr("open-ended-some-need-attention", "Some answers need attention."),
        { assertive: true },
      )
    }
    ;(firstEmpty ?? firstFlagged)?.focus()
  }

  function handleValidate(): void {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }
    if (validationInFlight) return
    validationInFlight = true
    runValidation().finally(() => {
      validationInFlight = false
    })
  }

  function handleSkip(): void {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  attachInputListeners()
  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  resetSubmit()

  // The section's aria-label is written imperatively, so `applyTranslationsToDOM`
  // won't touch it on a language switch. Re-apply on each translations update so
  // it stays in sync with the active locale.
  const unsubTranslations = store.sub(translationsAtom, () => {
    applyLocalizedAria()
  })

  return () => {
    listenerCleanups.forEach((off) => off())
    unsubTranslations()
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}

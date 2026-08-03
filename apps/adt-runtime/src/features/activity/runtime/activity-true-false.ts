/**
 * True/false initializer — multi-question section. Each question is a
 * `<fieldset>` containing two radio inputs that share the same
 * `data-activity-item`; one radio has `value="true"`, the other `value="false"`.
 * The correct answer per question is a string "true" / "false" in
 * `window.correctAnswers`.
 *
 * Activity HTML is emitted by `prompts/activity_true_false.liquid` and
 * `packages/pipeline/src/package-web.ts`:
 *   - <section data-section-type="activity_true_false">
 *   - <fieldset> per question, with two <input type="radio"> children sharing
 *     a single data-activity-item="item-N"
 *   - <span class="validation-mark hidden"> inside each radio's label —
 *     receives a check/cross icon on submit
 */
import { getDefaultStore } from "jotai"
import { translationsAtom } from "../../language/state/language.atoms"
import {
  pagesAtom,
  currentSectionIdAtom,
} from "../../navigation/state/nav.atoms"
import {
  confettiTriggerAtom,
  skipEnabledAtom,
  skipHandlerAtom,
  submitEnabledAtom,
  submitLabelAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { playActivitySound } from "./sounds"
import { showActivityProgressToast } from "../lib/progress-toast"
import { announceToScreenReader } from "../../../shared/lib/aria-live"

// :not([data-activity-variant="stepper"]) — sections converted to the
// step-by-step presentation are rendered by activity-stepper.tsx instead.
const TF_SELECTOR =
  'section[data-section-type="activity_true_false"]:not([data-activity-variant="stepper"])'

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

function getQuestionItemIds(section: HTMLElement): string[] {
  const ids = new Set<string>()
  section
    .querySelectorAll<HTMLInputElement>("input[type='radio'][data-activity-item]")
    .forEach((r) => {
      const id = r.getAttribute("data-activity-item")
      if (id) ids.add(id)
    })
  return Array.from(ids)
}

function getRadiosForItem(
  section: HTMLElement,
  itemId: string,
): HTMLInputElement[] {
  return Array.from(
    section.querySelectorAll<HTMLInputElement>(
      `input[type='radio'][data-activity-item="${itemId}"]`,
    ),
  )
}

function getCheckedRadio(
  section: HTMLElement,
  itemId: string,
): HTMLInputElement | null {
  return getRadiosForItem(section, itemId).find((r) => r.checked) ?? null
}

function getCorrectAnswer(itemId: string): string | undefined {
  const raw = window.correctAnswers?.[itemId]
  if (typeof raw !== "string") return undefined
  return raw.toLowerCase()
}

/**
 * Set a check or cross icon inside the `.validation-mark` span that lives in
 * the chosen radio's wrapping label. Other radios in the same fieldset have
 * their marks cleared.
 */
function applyValidationMark(
  section: HTMLElement,
  itemId: string,
  verdict: "correct" | "incorrect",
): void {
  const radios = getRadiosForItem(section, itemId)
  radios.forEach((radio) => {
    const mark = radio
      .closest("label")
      ?.querySelector<HTMLElement>(".validation-mark")
    if (!mark) return
    if (!radio.checked) {
      mark.classList.add("hidden")
      mark.innerHTML = ""
      return
    }
    mark.classList.remove("hidden")
    mark.innerHTML =
      verdict === "correct"
        ? '<i class="fas fa-check-circle text-green-500" aria-hidden="true"></i>'
        : '<i class="fas fa-times-circle text-red-500" aria-hidden="true"></i>'
  })
}

function clearValidationMarksForItem(
  section: HTMLElement,
  itemId: string,
): void {
  getRadiosForItem(section, itemId).forEach((radio) => {
    const mark = radio
      .closest("label")
      ?.querySelector<HTMLElement>(".validation-mark")
    if (!mark) return
    mark.classList.add("hidden")
    mark.innerHTML = ""
  })
}

function clearAllValidationMarks(section: HTMLElement): void {
  section
    .querySelectorAll<HTMLElement>(".validation-mark")
    .forEach((mark) => {
      mark.classList.add("hidden")
      mark.innerHTML = ""
    })
}

function updateSubmitEnabled(section: HTMLElement): void {
  const itemIds = getQuestionItemIds(section)
  const anyAnswered = itemIds.some((id) => getCheckedRadio(section, id) !== null)
  getDefaultStore().set(submitEnabledAtom, anyAnswered)
}

interface FullValidationResult {
  total: number
  correctCount: number
  unansweredCount: number
  firstUnanswered: HTMLInputElement | null
  firstWrong: HTMLInputElement | null
}

function validateAll(section: HTMLElement): FullValidationResult {
  const itemIds = getQuestionItemIds(section)
  let total = 0
  let correctCount = 0
  let unansweredCount = 0
  let firstUnanswered: HTMLInputElement | null = null
  let firstWrong: HTMLInputElement | null = null

  for (const itemId of itemIds) {
    total++
    const checked = getCheckedRadio(section, itemId)
    if (!checked) {
      unansweredCount++
      if (!firstUnanswered) {
        firstUnanswered = getRadiosForItem(section, itemId)[0] ?? null
      }
      clearValidationMarksForItem(section, itemId)
      continue
    }
    const correct = getCorrectAnswer(itemId)
    // An empty / missing correct answer is treated as "any non-empty value is
    // fine" — the same convention as fill-in-the-blank handles open-ended.
    const isCorrect =
      correct === "" ||
      correct === undefined ||
      checked.value.toLowerCase() === correct
    if (isCorrect) {
      correctCount++
    } else if (!firstWrong) {
      firstWrong = checked
    }
    applyValidationMark(section, itemId, isCorrect ? "correct" : "incorrect")
  }

  return {
    total,
    correctCount,
    unansweredCount,
    firstUnanswered,
    firstWrong,
  }
}

export function initializeTrueFalseActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const found = document.querySelector<HTMLElement>(TF_SELECTOR)
  if (!found) return null
  const section: HTMLElement = found

  const store = getDefaultStore()

  if (!section.getAttribute("role")) section.setAttribute("role", "form")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr("true-false-activity-label", "True or false activity"),
    )
  }
  applyLocalizedAria()

  const hasNextPage = findNextPageHref() !== null
  let listenerCleanups: Array<() => void> = []

  function attachRadioListeners(): void {
    listenerCleanups.forEach((off) => off())
    listenerCleanups = []

    section
      .querySelectorAll<HTMLInputElement>("input[type='radio'][data-activity-item]")
      .forEach((radio) => {
        const onChange = () => {
          const itemId = radio.getAttribute("data-activity-item")
          if (itemId) clearValidationMarksForItem(section, itemId)
          // After a successful submit the button is in "next" state. Don't let
          // further editing flip submitEnabled off — that would strand the user
          // with a disabled "Next activity" button.
          if (store.get(submitStateAtom) === "submit") {
            updateSubmitEnabled(section)
          }
        }
        radio.addEventListener("change", onChange)
        listenerCleanups.push(() => {
          radio.removeEventListener("change", onChange)
        })
      })
  }

  function resetSubmit(): void {
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(skipEnabledAtom, hasNextPage)
    updateSubmitEnabled(section)
  }

  function handleValidate(): void {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }

    const result = validateAll(section)
    const { total, correctCount, unansweredCount, firstUnanswered, firstWrong } =
      result
    const allCorrect = total > 0 && correctCount === total

    playActivitySound(allCorrect ? "success" : "error")
    showActivityProgressToast({
      total,
      correct: correctCount,
      unfilled: unansweredCount,
    })

    if (allCorrect) {
      announceToScreenReader(
        tr("true-false-all-correct", "All answers are correct!"),
        { assertive: true },
      )
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
      return
    }

    if (unansweredCount > 0) {
      const msg = tr(
        "true-false-questions-remaining",
        "${count} questions still unanswered.",
      ).replace("${count}", String(unansweredCount))
      announceToScreenReader(msg, { assertive: true })
    } else {
      announceToScreenReader(
        tr("true-false-some-incorrect", "Some answers are incorrect."),
        { assertive: true },
      )
    }
    ;(firstUnanswered ?? firstWrong)?.focus()
  }

  function handleSkip(): void {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  attachRadioListeners()
  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  resetSubmit()

  // Language switch: re-apply the imperatively-set aria-label. The validation
  // marks are icons (language-independent) so no need to re-render them.
  const unsubTranslations = store.sub(translationsAtom, () => {
    applyLocalizedAria()
  })

  return () => {
    listenerCleanups.forEach((off) => off())
    unsubTranslations()
    clearAllValidationMarks(section)
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}

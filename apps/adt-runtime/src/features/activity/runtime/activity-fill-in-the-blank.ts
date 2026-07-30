/**
 * Fill-in-the-blank (and fill-in-a-table) initializer — wires up the dock
 * submit/skip buttons via atoms, hydrates `[[blank:item-N]]` markers into
 * <input>s, validates each input on change and on submit, and persists user
 * input across reloads.
 *
 * Activity HTML is emitted by `prompts/activity_fill_in_the_blank.liquid`,
 * `prompts/activity_fill_in_a_table.liquid`, and
 * `packages/pipeline/src/package-web.ts`:
 *   - <section data-section-type="activity_fill_in_the_blank"> OR
 *     <section data-section-type="activity_fill_in_a_table">
 *   - .fitb-sentence containers with [[blank:item-N(:hint)?]] markers inside
 *     elements that carry data-id (FITB pattern 2 only — tables never have
 *     these, so the hydration step is a no-op for tables)
 *   - Standalone <input>/<textarea> with data-activity-item="item-N" outside
 *     any data-id element (FITB pattern 2b + every table input)
 *   - window.correctAnswers map keyed by item id, emitted by renderPageHtml
 *
 * Tables and fill-in-the-blank share the same input-validation model, so they
 * run through the same initializer. The only structural difference is the
 * absence of `[[blank:]]` markers in tables.
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
import {
  applyFeedback,
  clearInputValidationFeedback,
  clearSectionFeedback,
} from "../lib/feedback"
import { showActivityProgressToast } from "../lib/progress-toast"
import { announceToScreenReader } from "../../../shared/lib/aria-live"

// :not([data-activity-variant="stepper"]) — sections converted to the
// step-by-step presentation are rendered by activity-stepper.tsx instead.
const FITB_SELECTOR =
  'section[data-section-type="activity_fill_in_the_blank"]:not([data-activity-variant="stepper"]), section[data-section-type="activity_fill_in_a_table"]:not([data-activity-variant="stepper"])'

// `window.correctAnswers` / `window.interchangeablePairs` are declared once in
// ./activity-globals.d.ts (shared by every activity initializer).

type TextInput = HTMLInputElement | HTMLTextAreaElement

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

function getCorrectAnswer(itemId: string): string | undefined {
  // The injected map is typed `unknown` per entry (activities disagree on what
  // a value means — see activity-globals.d.ts). Blanks compare text, so coerce
  // non-null primitives: a numeric answer arrives as `100`, not `"100"`. An
  // empty string is meaningful here (open-ended blank: accept any input), so it
  // must survive rather than collapse to undefined.
  const raw = window.correctAnswers?.[itemId]
  if (raw === undefined || raw === null) return undefined
  return typeof raw === "string" ? raw : String(raw)
}

function getInterchangeable(itemId: string): string[] | undefined {
  return window.interchangeablePairs?.[itemId]
}

/**
 * Local-storage key for per-input persistence. Mirrors the legacy convention so
 * existing books keep their saved values:
 *   `${activityId}_${data-aria-id}` where activityId = current page filename.
 */
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

function countTotalBlanks(section: HTMLElement): number {
  let total = 0
  section.querySelectorAll<HTMLElement>(".fitb-sentence").forEach((sentence) => {
    const targets = sentence.querySelectorAll<HTMLElement>("[data-id]")
    const elements = targets.length > 0 ? Array.from(targets) : [sentence]
    elements.forEach((el) => {
      const matches = el.innerHTML.match(/\[\[blank:item-\d+(?::[^\]]+)?\]\]/g)
      if (matches) total += matches.length
    })
  })
  return total
}

function blankLabel(index: number, total: number): string {
  if (total > 1) {
    const tpl = tr("fitb-blank-label-n-of-m", "Blank ${n} of ${m}")
    return tpl
      .replace("${n}", String(index))
      .replace("${m}", String(total))
  }
  return tr("fitb-blank-label", "Blank")
}

/**
 * Hydrate `[[blank:item-N(:hint)?]]` markers into <input> elements. Walks each
 * `.fitb-sentence` and replaces markers inside `data-id`-carrying descendants
 * (or the sentence itself, when it has no children with data-id).
 */
function hydrateFitbSentences(section: HTMLElement): void {
  const total = countTotalBlanks(section)
  let counter = 0

  section.querySelectorAll<HTMLElement>(".fitb-sentence").forEach((sentence) => {
    const targets = sentence.querySelectorAll<HTMLElement>("[data-id]")
    const elements = targets.length > 0 ? Array.from(targets) : [sentence]

    elements.forEach((el) => {
      const html = el.innerHTML
      if (!html.includes("[[blank:")) return

      const hydrated = html.replace(
        /\[\[blank:item-(\d+)(?::([^\]]+))?\]\]/g,
        (match, itemNum, hint, offsetVal, source) => {
          counter++
          const offset = offsetVal as number
          const src = source as string
          const label = blankLabel(counter, total)

          // Word-internal blanks: marker sits inside a word (missing-letter
          // exercises like "en_ro" → "en[[blank:item-1]]ro"). Tighter spacing,
          // narrower default width.
          const prev = src[offset - 1] ?? ""
          const next = src[offset + match.length] ?? ""
          const isWordInternal =
            !hint && (/\p{L}/u.test(prev) || /\p{L}/u.test(next))

          // Width priority: explicit hint > known answer > word-internal > default.
          const answer = getCorrectAnswer(`item-${itemNum}`)
          const answerLength =
            typeof answer === "string" && answer.length > 0
              ? answer
                  .split("|")
                  .reduce((max, a) => Math.max(max, a.length), 0)
              : 0

          let charWidth: number
          let minWidth: string
          if (hint) {
            charWidth = Math.max(String(hint).length + 2, 6)
            minWidth = "4ch"
          } else if (answerLength > 0) {
            charWidth = Math.max(answerLength + 1, 2)
            minWidth = answerLength <= 2 ? "1.5ch" : "4ch"
          } else if (isWordInternal) {
            charWidth = 2
            minWidth = "1.5ch"
          } else {
            charWidth = 8
            minWidth = "4ch"
          }

          const spacing = isWordInternal ? "mx-px" : "mx-1"
          return (
            `<input type="text" ` +
            `id="fitb-input-${itemNum}" ` +
            `class="fitb-inline-input inline-block ${spacing} px-1 py-0.5 border-b-2 border-gray-400 bg-transparent text-center focus:border-blue-500 focus:outline-none" ` +
            `style="width: ${charWidth}ch; min-width: ${minWidth}; max-width: 100%;" ` +
            `aria-label="${escapeAttr(label)}" ` +
            `aria-invalid="false" ` +
            `autocomplete="off" ` +
            `data-aria-id="aria-${counter}-0-0" ` +
            `data-activity-item="item-${itemNum}" ` +
            `tabindex="0" />`
          )
        },
      )

      if (hydrated !== html) el.innerHTML = hydrated
    })
  })
}

function escapeAttr(value: string): string {
  return String(value).replace(/"/g, "&quot;")
}

function getActivityInputs(section: HTMLElement): NodeListOf<TextInput> {
  return section.querySelectorAll<TextInput>(
    'input[type="text"]:not(#filter-input), textarea:not(#filter-input)',
  )
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

interface ValidationResult {
  isCorrect: boolean
  isFilled: boolean
}

function validateValue(
  input: TextInput,
  options: { showDuplicateFeedback?: boolean } = {},
): ValidationResult {
  const itemId = input.getAttribute("data-activity-item") ?? ""
  const value = normalize(input.value)
  const isFilled = value !== ""
  if (!isFilled) return { isCorrect: false, isFilled: false }

  const correct = getCorrectAnswer(itemId)
  // Open-ended fields: the LLM emits an empty answer string for items that
  // accept any input. Treat any non-empty value as acceptable.
  if (correct === "" || correct === undefined) {
    return { isCorrect: true, isFilled: true }
  }

  // Pipe-separated alternatives ("madre|mamá").
  if (correct.includes("|")) {
    const acceptable = correct.split("|").map((a) => a.trim().toLowerCase())
    return { isCorrect: acceptable.includes(value), isFilled: true }
  }

  // Interchangeable pairs (legacy feature): same word may belong to multiple
  // item slots, and we reject duplicate values across the pair.
  const pair = getInterchangeable(itemId)
  if (pair && pair.length > 0) {
    const alternates = pair.map((id) => getCorrectAnswer(id))
    const matchesAny =
      value === correct.toLowerCase() ||
      alternates.some((a) => a != null && value === a.toLowerCase())
    if (!matchesAny) return { isCorrect: false, isFilled: true }

    // Reject duplicates across the pair.
    for (const altId of pair) {
      const altInput = document.querySelector<TextInput>(
        `[data-activity-item="${altId}"]`,
      )
      if (altInput && normalize(altInput.value) === value) {
        if (options.showDuplicateFeedback) {
          applyFeedback(input, "incorrect")
        }
        return { isCorrect: false, isFilled: true }
      }
    }
    return { isCorrect: true, isFilled: true }
  }

  return { isCorrect: correct.toLowerCase() === value, isFilled: true }
}

function liveValidate(input: TextInput): void {
  const value = input.value.trim()
  if (value === "") {
    input.classList.remove("border-green-500", "border-red-500")
    input.setAttribute("aria-invalid", "false")
    return
  }
  const { isCorrect } = validateValue(input)
  const wasValid = input.dataset.wasValid === "true"
  input.classList.remove("border-green-500", "border-red-500")
  input.classList.add(isCorrect ? "border-green-500" : "border-red-500")
  input.setAttribute("aria-invalid", isCorrect ? "false" : "true")

  // Only chirp when validity flips so a user typing a wrong letter doesn't get
  // hammered by the error sound every keystroke.
  if (isCorrect && !wasValid) playActivitySound("validate_success")
  else if (!isCorrect && wasValid) playActivitySound("validate_error")

  input.dataset.wasValid = isCorrect ? "true" : "false"
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
  allCorrect: boolean
  total: number
  correctCount: number
  unfilledCount: number
  firstUnfilled: TextInput | null
  firstIncorrect: TextInput | null
}

function validateAll(section: HTMLElement): FullValidationResult {
  clearSectionFeedback(section)

  let total = 0
  let correctCount = 0
  let unfilledCount = 0
  let firstUnfilled: TextInput | null = null
  let firstIncorrect: TextInput | null = null

  getActivityInputs(section).forEach((input) => {
    total++
    const { isCorrect, isFilled } = validateValue(input, {
      showDuplicateFeedback: true,
    })
    if (isCorrect) correctCount++
    if (!isFilled) {
      unfilledCount++
      if (!firstUnfilled) firstUnfilled = input
    } else if (!isCorrect && !firstIncorrect) {
      firstIncorrect = input
    }
    applyFeedback(input, isCorrect ? "correct" : "incorrect")
  })

  return {
    allCorrect: total > 0 && correctCount === total,
    total,
    correctCount,
    unfilledCount,
    firstUnfilled,
    firstIncorrect,
  }
}

export function initializeFillInTheBlankActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const found = document.querySelector<HTMLElement>(FITB_SELECTOR)
  if (!found) return null
  // Bind to a non-nullable local so inner closures (declared with `function`,
  // not arrow) carry the narrowing.
  const section: HTMLElement = found

  const store = getDefaultStore()

  // Promote ARIA — the prompt forbids the section from carrying role="activity",
  // but we still want it announced as a form for assistive tech.
  if (!section.getAttribute("role")) section.setAttribute("role", "form")
  if (!section.getAttribute("aria-label")) {
    const isTable =
      section.getAttribute("data-section-type") === "activity_fill_in_a_table"
    section.setAttribute(
      "aria-label",
      isTable
        ? tr("fitb-table-activity-label", "Fill in the table activity")
        : tr("fitb-activity-label", "Fill in the blank activity"),
    )
  }

  hydrateFitbSentences(section)
  const initialInputs = getActivityInputs(section)
  loadInputState(initialInputs)

  const hasNextPage = findNextPageHref() !== null
  let listenerCleanups: Array<() => void> = []

  function attachInputListeners(): void {
    listenerCleanups.forEach((off) => off())
    listenerCleanups = []

    getActivityInputs(section).forEach((input) => {
      const onInput = () => {
        clearInputValidationFeedback(input)
        liveValidate(input)
        saveInputState(input)
        // Revalidate any paired interchangeable inputs in case removing the
        // duplicate now lets the partner validate.
        const itemId = input.getAttribute("data-activity-item")
        if (itemId) {
          getInterchangeable(itemId)?.forEach((altId) => {
            const alt = document.querySelector<TextInput>(
              `[data-activity-item="${altId}"]`,
            )
            if (alt) liveValidate(alt)
          })
        }
        // After a successful submit the button is in "next" state (nav). Don't
        // let further editing regress submitEnabled — otherwise clearing an
        // input strands the user with a disabled "Next activity" button.
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

  function handleValidate(): void {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }

    const result = validateAll(section)
    const { allCorrect, total, correctCount, unfilledCount, firstUnfilled, firstIncorrect } =
      result

    playActivitySound(allCorrect ? "success" : "error")
    showActivityProgressToast({
      total,
      correct: correctCount,
      unfilled: unfilledCount,
    })

    if (allCorrect) {
      announceToScreenReader(
        tr("fitb-all-correct", "All answers are correct!"),
        { assertive: true },
      )
      store.set(
        confettiTriggerAtom,
        store.get(confettiTriggerAtom) + 1,
      )
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
      return
    }

    // Screen-reader announcement keeps a single sentence (matches the legacy
    // a11y behavior); the visible toast carries the per-bucket breakdown.
    if (unfilledCount > 0) {
      const msg = tr("fitb-blanks-remaining", "${count} blanks still empty.")
        .replace("${count}", String(unfilledCount))
      announceToScreenReader(msg, { assertive: true })
    } else {
      announceToScreenReader(
        tr("fitb-some-incorrect", "Some answers are incorrect."),
        { assertive: true },
      )
    }
    ;(firstUnfilled ?? firstIncorrect)?.focus()
  }

  function handleSkip(): void {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  attachInputListeners()
  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  resetSubmit()

  // Re-hydrate on language changes — translations overwrite innerHTML on each
  // [data-id] element, which destroys the live <input>s we hydrated in. Walk
  // the section again to restore them and re-attach listeners.
  const unsubTranslations = store.sub(translationsAtom, () => {
    const focused = document.activeElement as HTMLElement | null
    const focusedItem = focused?.getAttribute?.("data-activity-item") ?? null
    hydrateFitbSentences(section)
    const inputs = getActivityInputs(section)
    loadInputState(inputs)
    attachInputListeners()
    updateSubmitEnabled(section)
    if (focusedItem) {
      const restored = document.querySelector<HTMLElement>(
        `[data-activity-item="${focusedItem}"]`,
      )
      restored?.focus()
    }
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

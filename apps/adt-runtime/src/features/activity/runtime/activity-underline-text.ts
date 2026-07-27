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
import { announceToScreenReader } from "@/shared/lib/aria-live"

const UNDERLINE_SELECTOR = 'section[data-section-type="activity_underline_text"]'
const DEFAULT_GROUP_KEY = "__default__"
const STYLE_ATTR = "data-underline-style-state"

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

declare global {
  interface Window {
    correctAnswers?: Record<string, unknown>
  }
}

interface UnderlineGroup {
  key: string
  options: HTMLElement[]
  selected: Set<HTMLElement>
  validated: boolean
  /**
   * The element carrying `role="group"` + a localized "Question N" label —
   * usually the `data-id` text wrapper that contains this group's options.
   * Screen readers announce the group name when focus enters it, which is what
   * tells the user which sentence/question a token belongs to.
   */
  container: HTMLElement | null
}

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

function findOptions(section: HTMLElement): HTMLElement[] {
  return Array.from(
    section.querySelectorAll<HTMLElement>(".activity-underline-option[data-activity-item]"),
  )
}

function groupKeyForOption(option: HTMLElement): string {
  return option.getAttribute("data-question-group") || DEFAULT_GROUP_KEY
}

function getItemId(option: HTMLElement): string | null {
  return option.getAttribute("data-activity-item")
}

/**
 * Smallest ancestor (inside the section) containing every option of a group.
 * Prefers the `data-id` text wrapper when one wraps them all — that is the
 * sentence element the question semantically lives in.
 */
function findGroupContainer(
  section: HTMLElement,
  options: HTMLElement[],
): HTMLElement | null {
  if (options.length === 0) return null
  let candidate: HTMLElement | null = options[0].parentElement
  while (candidate && candidate !== section) {
    if (options.every((opt) => candidate!.contains(opt))) break
    candidate = candidate.parentElement
  }
  if (!candidate || candidate === section) {
    candidate = options[0].closest<HTMLElement>("[data-id]")
    if (!candidate || !options.every((opt) => candidate!.contains(opt))) {
      return null
    }
  }
  return candidate
}

function buildGroups(section: HTMLElement): UnderlineGroup[] {
  const byKey = new Map<string, HTMLElement[]>()
  findOptions(section).forEach((opt) => {
    const key = groupKeyForOption(opt)
    const list = byKey.get(key) ?? []
    list.push(opt)
    byKey.set(key, list)
  })
  return Array.from(byKey.entries()).map(([key, options]) => ({
    key,
    options,
    selected: new Set(),
    validated: false,
    container: findGroupContainer(section, options),
  }))
}

function findGroup(groups: UnderlineGroup[], option: HTMLElement): UnderlineGroup | null {
  const key = groupKeyForOption(option)
  return groups.find((g) => g.key === key) ?? null
}

function applyOptionStyle(option: HTMLElement, state: "selected" | "correct" | "incorrect"): void {
  option.style.textDecorationLine = "underline"
  option.style.textDecorationThickness = "3px"
  option.style.textUnderlineOffset = "0.18em"
  option.style.borderRadius = "0.25rem"
  option.style.paddingInline = "0.05rem"
  if (state === "selected") {
    option.style.textDecorationColor = "rgb(37, 99, 235)"
    option.style.backgroundColor = "transparent"
  } else if (state === "correct") {
    option.style.textDecorationColor = "rgb(22, 163, 74)"
    option.style.backgroundColor = "rgba(240, 253, 244, 0.2)"
  } else {
    option.style.textDecorationColor = "rgb(220, 38, 38)"
    option.style.backgroundColor = "rgba(254, 242, 242, 0.2)"
  }
  option.setAttribute(STYLE_ATTR, state)
}

function clearOptionStyle(option: HTMLElement): void {
  if (!option.hasAttribute(STYLE_ATTR)) return
  option.style.textDecorationLine = ""
  option.style.textDecorationThickness = ""
  option.style.textUnderlineOffset = ""
  option.style.textDecorationColor = ""
  option.style.backgroundColor = ""
  option.style.borderRadius = ""
  option.style.paddingInline = ""
  option.removeAttribute(STYLE_ATTR)
}

function clearGroupVerdict(group: UnderlineGroup): void {
  for (const option of group.options) {
    option.removeAttribute("aria-invalid")
    clearOptionStyle(option)
  }
  for (const option of group.selected) {
    applyOptionStyle(option, "selected")
  }
  group.validated = false
}

function toggleSelection(option: HTMLElement, group: UnderlineGroup): void {
  if (group.validated) clearGroupVerdict(group)
  const willSelect = !group.selected.has(option)
  if (willSelect) {
    group.selected.add(option)
    applyOptionStyle(option, "selected")
    option.setAttribute("aria-checked", "true")
  } else {
    group.selected.delete(option)
    clearOptionStyle(option)
    option.setAttribute("aria-checked", "false")
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

export function initializeUnderlineTextActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(UNDERLINE_SELECTOR)
  if (!section) return null

  const store = getDefaultStore()
  const correctAnswers = readCorrectAnswers(section)
  const groups = buildGroups(section)
  const hasNextPage = findNextPageHref() !== null

  function anySelected(): boolean {
    return groups.some((g) => g.selected.size > 0)
  }

  function resetState(): void {
    for (const group of groups) {
      group.selected.clear()
      group.validated = false
    }
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, hasNextPage)
  }

  function handleToggle(option: HTMLElement): void {
    const group = findGroup(groups, option)
    if (!group) return
    toggleSelection(option, group)
    playActivitySound("drop")
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, anySelected())
  }

  function handleValidate(): void {
    const state = store.get(submitStateAtom)
    if (state === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }
    if (!anySelected()) return

    let allCorrect = true
    let correctPicks = 0
    let wrongPicks = 0
    let missedCorrect = 0
    let firstWrong: HTMLElement | null = null
    let firstUnansweredGroup: HTMLElement | null = null

    for (const group of groups) {
      if (group.selected.size === 0) {
        allCorrect = false
        for (const option of group.options) {
          const itemId = getItemId(option)
          if (itemId && correctAnswers[itemId]) missedCorrect++
        }
        if (!firstUnansweredGroup) firstUnansweredGroup = group.options[0] ?? null
        continue
      }

      let groupCorrect = true
      for (const option of group.options) {
        const itemId = getItemId(option)
        if (!itemId) continue
        const shouldBeSelected = Boolean(correctAnswers[itemId])
        const wasSelected = group.selected.has(option)
        if (wasSelected && shouldBeSelected) {
          applyOptionStyle(option, "correct")
          correctPicks++
        } else if (wasSelected && !shouldBeSelected) {
          applyOptionStyle(option, "incorrect")
          wrongPicks++
          groupCorrect = false
          if (!firstWrong) firstWrong = option
        } else {
          clearOptionStyle(option)
          if (shouldBeSelected) {
            missedCorrect++
            groupCorrect = false
          }
        }
        option.setAttribute(
          "aria-invalid",
          wasSelected && !shouldBeSelected ? "true" : "false",
        )
      }
      group.validated = true
      if (!groupCorrect) allCorrect = false
    }

    playActivitySound(allCorrect ? "success" : "error")
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
      announceToScreenReader(
        tr("underline-all-correct", "All answers are correct!"),
        { assertive: true },
      )
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
    } else {
      const summary = tr(
        "underline-progress-summary",
        "${correct} correct, ${wrong} incorrect, ${missing} still to find.",
      )
        .replace("${correct}", String(correctPicks))
        .replace("${wrong}", String(wrongPicks))
        .replace("${missing}", String(missedCorrect))
      announceToScreenReader(summary, { assertive: true })
      // Move focus to the first problem so a keyboard/SR user lands where the
      // work is, mirroring the true/false activity's behavior.
      ;(firstWrong ?? firstUnansweredGroup)?.focus()
      store.set(submitStateAtom, "submit")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, anySelected())
    }
  }

  function handleSkip(): void {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  section.setAttribute("role", "group")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr("underline-text-options-label", "Underline the correct text"),
    )
    // Group each question's tokens so AT announces which sentence a token
    // belongs to when focus enters it. A container shared by several groups is
    // ambiguous — label it only for the first group that claims it.
    const labeled = new Set<HTMLElement>()
    const questionLabel = tr("underline-question-label", "Question ${n}")
    groups.forEach((group, index) => {
      const container = group.container
      if (!container || labeled.has(container)) return
      labeled.add(container)
      container.setAttribute("role", "group")
      container.setAttribute(
        "aria-label",
        questionLabel.replace("${n}", String(index + 1)),
      )
    })
  }
  applyLocalizedAria()

  const listeners: Array<() => void> = []
  for (const group of groups) {
    for (const option of group.options) {
      const onClick = (e: Event) => {
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
      option.setAttribute("role", "checkbox")
      option.setAttribute("aria-checked", "false")
      option.setAttribute("tabindex", "0")
      // No aria-label: role="checkbox" takes its accessible name from the
      // element's text content, so the name follows the visible word — even
      // after a language switch swaps the token text in place. A stale
      // aria-label set at init would keep announcing the old language.
      option.removeAttribute("aria-label")
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
  })

  return () => {
    listeners.forEach((off) => off())
    unsubTranslations()
  }
}

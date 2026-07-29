import { getDefaultStore } from "jotai"
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine"
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
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

const ORDERING_SELECTOR = 'section[data-section-type="activity_ordering"]'
const ITEM_SELECTOR = "[data-activity-order-list] > [data-activity-item]"
const CORRECT_BORDER = "rgb(22, 163, 74)"
const INCORRECT_BORDER = "rgb(220, 38, 38)"
const BASE_BORDER = "rgb(148, 163, 184)"

function tr(key: string, fallback: string): string {
  return getDefaultStore().get(translationsAtom)[key] || fallback
}

function findNextPageHref(): string | null {
  const store = getDefaultStore()
  const pages = store.get(pagesAtom)
  const currentId = store.get(currentSectionIdAtom)
  if (!currentId) return null
  const index = pages.findIndex((page) => page.section_id === currentId)
  return index >= 0 && index < pages.length - 1 ? pages[index + 1]?.href ?? null : null
}

function readCorrectOrder(section: HTMLElement, itemIds: string[]): string[] {
  const encoded = section.getAttribute("data-correct-order")
  if (encoded) {
    const values = encoded.trim().startsWith("[")
      ? safelyParseOrder(encoded)
      : encoded.split(",").map((value) => value.trim()).filter(Boolean)
    if (values.length > 0) return values
  }

  const answers = window.correctAnswers ?? {}
  const ranked = itemIds
    .map((itemId) => ({ itemId, rank: Number(answers[itemId]) }))
    .filter((entry) => Number.isFinite(entry.rank))
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.itemId)
  return ranked.length === itemIds.length ? ranked : []
}

function safelyParseOrder(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function itemLabel(item: HTMLElement): string {
  return (
    item.getAttribute("aria-label") ||
    item.textContent?.replace(/\s+/g, " ").trim() ||
    item.getAttribute("data-activity-item") ||
    ""
  )
}

export function initializeOrderingActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(ORDERING_SELECTOR)
  const list = section?.querySelector<HTMLElement>("[data-activity-order-list]")
  if (!section || !list) return null

  const initialItems = Array.from(list.querySelectorAll<HTMLElement>(ITEM_SELECTOR.replace("[data-activity-order-list] > ", ":scope > ")))
  const itemIds = initialItems.map((item) => item.getAttribute("data-activity-item") ?? "")
  if (itemIds.length < 2 || itemIds.some((itemId) => !itemId)) return null
  const correctOrder = readCorrectOrder(section, itemIds)
  if (correctOrder.length !== itemIds.length || new Set(correctOrder).size !== itemIds.length) return null

  const store = getDefaultStore()
  const hasNextPage = findNextPageHref() !== null
  let validated = false
  const cleanups: Array<() => void> = []

  const currentItems = () => Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-activity-item]"))
  const currentOrder = () => currentItems().map((item) => item.getAttribute("data-activity-item") ?? "")

  const clearVerdicts = () => {
    for (const item of currentItems()) {
      item.style.borderColor = BASE_BORDER
      item.setAttribute("aria-invalid", "false")
      item.querySelector("[data-order-verdict]")?.remove()
    }
    validated = false
  }

  const refreshControls = () => {
    const items = currentItems()
    items.forEach((item, index) => {
      const up = item.querySelector<HTMLButtonElement>('[data-order-move="up"]')
      const down = item.querySelector<HTMLButtonElement>('[data-order-move="down"]')
      if (up) up.disabled = index === 0
      if (down) down.disabled = index === items.length - 1
      item.setAttribute("aria-posinset", String(index + 1))
      item.setAttribute("aria-setsize", String(items.length))
    })
  }

  const announceMove = (item: HTMLElement) => {
    const position = currentItems().indexOf(item) + 1
    announceToScreenReader(
      `${itemLabel(item)}. ${tr("ordering-position", "Position")} ${position} ${tr("ordering-of", "of")} ${itemIds.length}.`,
    )
  }

  const moveToIndex = (item: HTMLElement, targetIndex: number) => {
    const items = currentItems()
    const fromIndex = items.indexOf(item)
    const bounded = Math.max(0, Math.min(targetIndex, items.length - 1))
    if (fromIndex < 0 || fromIndex === bounded) return
    if (validated) clearVerdicts()
    const withoutItem = items.filter((candidate) => candidate !== item)
    const reference = withoutItem[bounded] ?? null
    list.insertBefore(item, reference)
    refreshControls()
    playActivitySound("drop")
    announceMove(item)
    item.focus()
  }

  const moveBy = (item: HTMLElement, delta: number) => {
    moveToIndex(item, currentItems().indexOf(item) + delta)
  }

  const resetOrder = () => {
    if (validated) clearVerdicts()
    for (const item of initialItems) list.appendChild(item)
    refreshControls()
    playActivitySound("reset")
    announceToScreenReader(tr("ordering-reset-announcement", "The original order has been restored."))
    initialItems[0]?.focus()
  }

  for (const item of initialItems) {
    item.classList.add("order-card")
    item.setAttribute("draggable", "true")
    item.setAttribute("tabindex", item.getAttribute("tabindex") ?? "0")
    item.setAttribute("role", "listitem")
    item.style.border = `2px solid ${BASE_BORDER}`
    item.style.borderRadius = "0.75rem"
    item.style.cursor = "grab"

    const controls = document.createElement("span")
    controls.className = "order-controls ml-auto inline-flex gap-2"
    controls.setAttribute("data-order-controls", "")
    for (const [direction, symbol] of [["up", "↑"], ["down", "↓"]] as const) {
      const button = document.createElement("button")
      button.type = "button"
      button.textContent = symbol
      button.className = "rounded-md border border-slate-400 bg-white px-3 py-1 text-lg disabled:opacity-40"
      button.setAttribute("data-order-move", direction)
      button.setAttribute("aria-label", direction === "up" ? tr("ordering-move-up", "Move up") : tr("ordering-move-down", "Move down"))
      const onClick = (event: Event) => {
        event.stopPropagation()
        moveBy(item, direction === "up" ? -1 : 1)
      }
      button.addEventListener("click", onClick)
      cleanups.push(() => button.removeEventListener("click", onClick))
      controls.appendChild(button)
    }
    item.appendChild(controls)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
      event.preventDefault()
      moveBy(item, event.key === "ArrowUp" ? -1 : 1)
    }
    item.addEventListener("keydown", onKeyDown)
    cleanups.push(() => item.removeEventListener("keydown", onKeyDown))

    cleanups.push(draggable({
      element: item,
      getInitialData: () => ({ itemId: item.getAttribute("data-activity-item") }),
    }))
    cleanups.push(dropTargetForElements({
      element: item,
      getData: () => ({ targetId: item.getAttribute("data-activity-item") }),
      onDrop: ({ source }) => {
        const sourceId = source.data.itemId
        if (typeof sourceId !== "string") return
        const sourceItem = currentItems().find(
          (candidate) => candidate.getAttribute("data-activity-item") === sourceId,
        )
        if (!sourceItem || sourceItem === item) return
        moveToIndex(sourceItem, currentItems().indexOf(item))
      },
    }))
  }

  const resetButton = document.createElement("button")
  resetButton.type = "button"
  resetButton.textContent = tr("ordering-reset", "Reset order")
  resetButton.className = "mt-4 rounded-md border border-slate-400 bg-transparent px-4 py-2 font-medium"
  resetButton.setAttribute("data-order-reset", "")
  resetButton.addEventListener("click", resetOrder)
  list.insertAdjacentElement("afterend", resetButton)
  cleanups.push(() => {
    resetButton.removeEventListener("click", resetOrder)
    resetButton.remove()
  })

  const handleValidate = () => {
    if (store.get(submitStateAtom) === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }
    clearVerdicts()
    const order = currentOrder()
    let correct = 0
    currentItems().forEach((item, index) => {
      const isCorrect = order[index] === correctOrder[index]
      if (isCorrect) correct++
      item.style.borderColor = isCorrect ? CORRECT_BORDER : INCORRECT_BORDER
      item.setAttribute("aria-invalid", isCorrect ? "false" : "true")
      const mark = document.createElement("span")
      mark.setAttribute("data-order-verdict", "")
      mark.setAttribute("aria-hidden", "true")
      mark.className = "ml-2 font-bold"
      mark.textContent = isCorrect ? "✓" : "✗"
      item.appendChild(mark)
    })
    const allCorrect = correct === itemIds.length
    validated = true
    playActivitySound(allCorrect ? "success" : "error")
    showActivityProgressToast({ total: itemIds.length, correct, unfilled: 0 })
    announceToScreenReader(
      allCorrect
        ? tr("ordering-correct", "Great job! The order is correct.")
        : tr("ordering-try-again", "Some items are in the wrong position. Try again."),
    )
    if (allCorrect) {
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitEnabledAtom, hasNextPage)
    }
  }

  const handleSkip = () => {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  section.setAttribute("role", "group")
  section.setAttribute("aria-label", tr("ordering-label", "Put the items in the correct order"))
  list.setAttribute("role", "list")
  refreshControls()
  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  store.set(submitStateAtom, "submit")
  store.set(submitLabelAtom, null)
  store.set(submitEnabledAtom, true)
  store.set(skipEnabledAtom, hasNextPage)

  return () => {
    combine(...cleanups)()
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}

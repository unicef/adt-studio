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

/**
 * `activity_matching` — learners match draggable `.activity-item` cards to
 * image drop zones. Ported from the legacy `matching.js`.
 *
 * Each drop zone (`.dropzone`) wraps an image plus an inner slot
 * (`.dropzone-slot`, `id="dropzone-N"`). The answer key maps each item id
 * (`data-activity-item`) to the slot id it belongs in. Matching is 1:1 — a slot
 * holds a single card; dropping a card onto an occupied slot returns the
 * displaced card to the bank.
 *
 * Two interaction paths, mirroring the legacy module and `activity-sorting`:
 *   1. Pointer drag — drag a card onto a drop zone (pragmatic-drag-and-drop).
 *   2. Click / keyboard — click a card to select it (zones highlight), then
 *      click a zone (or focus it + Enter/Space) to place it. Clicking a placed
 *      card returns it to the bank.
 *
 * As in the sorting port, the single card element is MOVED between the bank and
 * the slot rather than cloned, so placement state lives in `item.slotId`.
 *
 * NOTE: the current `activity_matching` prompt emits `.dropzone-slot` inner
 * containers; older generated books used `div[role="region"]`. We resolve the
 * slot by either selector for backward compatibility.
 */
const MATCHING_SELECTOR = 'section[data-section-type="activity_matching"]'
const SLOT_SELECTOR = ".dropzone-slot, div[role='region']"

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

// `window.correctAnswers` is declared once in ./activity-globals.d.ts.
// For matching, it maps each item id to the slot id (`dropzone-N`) it belongs in.

function readCorrectAnswers(section: HTMLElement): Record<string, string> {
  const attr = section.getAttribute("data-correct-answers")
  if (attr) {
    try {
      return mapToStrings(JSON.parse(attr) as Record<string, unknown>)
    } catch {
      // fall through
    }
  }
  if (typeof window !== "undefined" && window.correctAnswers) {
    return mapToStrings(window.correctAnswers)
  }
  return {}
}

function mapToStrings(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) out[k] = String(v)
  return out
}

// ---------------------------------------------------------------------------
// Visual styling. Selection border + verdict marks mirror the legacy classes.
// ---------------------------------------------------------------------------
const SELECTED_CLASSES = ["border-4", "border-blue-500"] as const
const ZONE_HIGHLIGHT_CLASSES = ["bg-blue-100", "border-blue-400"] as const
const PLACED_CLASS = "placed-in-dropzone"
const CORRECT_CLASSES = ["border", "border-green-300"] as const
const INCORRECT_CLASSES = ["border", "border-red-300"] as const
const VERDICT_MARK_CLASS = "validation-mark"

interface Item {
  el: HTMLElement
  itemId: string
  /**
   * The card's accessible name, captured once at init from the pristine
   * aria-label/text. `place()` rewrites the element's aria-label into a
   * composite ("X — placed. Press Enter to remove."), so we can't re-derive
   * the bare label from the DOM later — keep the original here.
   */
  label: string
  /** Where the card lives in the bank, so removal restores original order. */
  home: { parent: HTMLElement; index: number }
  /** Slot id the card currently occupies, or null when in the bank. */
  slotId: string | null
}

function getItemId(el: HTMLElement): string | null {
  return el.getAttribute("data-activity-item")
}

function itemLabel(el: HTMLElement): string {
  return (
    el.getAttribute("aria-label")?.split(" - ")[0]?.trim() ||
    (el.textContent ?? "").replace(/\s+/g, " ").trim()
  )
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

export function initializeMatchingActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(MATCHING_SELECTOR)
  if (!section) return null

  const store = getDefaultStore()
  const correctAnswers = readCorrectAnswers(section)
  const hasNextPage = findNextPageHref() !== null

  const items = new Map<string, Item>()
  section.querySelectorAll<HTMLElement>(".activity-item").forEach((el) => {
    const itemId = getItemId(el)
    if (!itemId || items.has(itemId)) return
    const parent = el.parentElement
    if (!parent) return
    const index = Array.from(parent.children).indexOf(el)
    items.set(itemId, {
      el,
      itemId,
      label: itemLabel(el),
      home: { parent, index },
      slotId: null,
    })
  })

  const dropzones = Array.from(section.querySelectorAll<HTMLElement>(".dropzone"))

  if (items.size === 0 || dropzones.length === 0) return null

  // Map each slot id (`dropzone-N`) → its slot element + outer drop zone.
  const slotById = new Map<string, { slot: HTMLElement; zone: HTMLElement }>()
  for (const zone of dropzones) {
    const slot = zone.querySelector<HTMLElement>(SLOT_SELECTOR)
    if (slot?.id) slotById.set(slot.id, { slot, zone })
  }

  if (slotById.size === 0) return null

  let selectedId: string | null = null
  let validated = false

  const anyPlaced = () => [...items.values()].some((i) => i.slotId !== null)

  const itemFromEl = (el: HTMLElement): Item | null => {
    const id = getItemId(el)
    return id ? (items.get(id) ?? null) : null
  }

  const highlightZones = (on: boolean) => {
    for (const { slot } of slotById.values()) {
      const zone = slot.closest<HTMLElement>(".dropzone") ?? slot
      zone.classList.toggle(ZONE_HIGHLIGHT_CLASSES[0], on)
      zone.classList.toggle(ZONE_HIGHLIGHT_CLASSES[1], on)
    }
  }

  const clearSelection = () => {
    if (selectedId) items.get(selectedId)?.el.classList.remove(...SELECTED_CLASSES)
    selectedId = null
    highlightZones(false)
  }

  const select = (item: Item) => {
    if (item.slotId !== null) return
    clearSelection()
    selectedId = item.itemId
    item.el.classList.add(...SELECTED_CLASSES)
    highlightZones(true)
    announceToScreenReader(
      `${tr("matching-selected", "Selected")}: ${item.label}. ` +
        tr("matching-choose-zone", "Choose a drop zone to place it in."),
    )
  }

  const clearItemVerdict = (item: Item) => {
    item.el.classList.remove(...CORRECT_CLASSES, ...INCORRECT_CLASSES)
    item.el.querySelectorAll(`.${VERDICT_MARK_CLASS}`).forEach((m) => m.remove())
    item.el.setAttribute("aria-invalid", "false")
  }

  const clearAllVerdicts = () => {
    for (const item of items.values()) clearItemVerdict(item)
    validated = false
  }

  const refreshSubmit = () => {
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, anyPlaced())
  }

  const returnHome = (item: Item) => {
    clearItemVerdict(item)
    const { parent, index } = item.home
    const ref = parent.children[index] ?? null
    parent.insertBefore(item.el, ref)
    item.slotId = null
    item.el.classList.remove(PLACED_CLASS, ...SELECTED_CLASSES)
    item.el.removeAttribute("title")
    item.el.setAttribute("aria-label", item.label)
  }

  const place = (item: Item, slotId: string) => {
    const entry = slotById.get(slotId)
    if (!entry) return
    if (validated) clearAllVerdicts()

    // 1:1 matching — if the slot already holds a different card, send it home.
    const existing = entry.slot.querySelector<HTMLElement>(".activity-item")
    if (existing && existing !== item.el) {
      const existingItem = itemFromEl(existing)
      if (existingItem) returnHome(existingItem)
    }

    entry.slot.appendChild(item.el)
    item.slotId = slotId
    item.el.classList.remove(...SELECTED_CLASSES)
    item.el.classList.add(PLACED_CLASS)
    item.el.setAttribute("title", tr("click-to-remove", "Click to remove"))
    item.el.setAttribute(
      "aria-label",
      `${item.label} — ${tr("matching-placed", "placed")}. ${tr(
        "matching-press-to-remove",
        "Press Enter to remove.",
      )}`,
    )

    if (selectedId === item.itemId) selectedId = null
    highlightZones(false)
    playActivitySound("drop")
    refreshSubmit()
    announceToScreenReader(`${item.label} ${tr("matching-placed", "placed")}.`)
  }

  const remove = (item: Item) => {
    if (item.slotId === null) return
    if (validated) clearAllVerdicts()
    returnHome(item)
    playActivitySound("reset")
    refreshSubmit()
    announceToScreenReader(
      `${item.label} ${tr("matching-returned", "returned to available options.")}`,
    )
    item.el.focus()
  }

  const onItemClick = (item: Item) => {
    if (item.slotId !== null) remove(item)
    else if (selectedId === item.itemId) clearSelection()
    else select(item)
  }

  const onZoneClick = (slotId: string) => {
    if (!selectedId) return
    const item = items.get(selectedId)
    if (item) place(item, slotId)
  }

  // ---- wire listeners + drag-and-drop ------------------------------------
  const cleanups: Array<() => void> = []

  for (const item of items.values()) {
    const onClick = (e: Event) => {
      e.preventDefault()
      onItemClick(item)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onItemClick(item)
      }
    }
    item.el.addEventListener("click", onClick)
    item.el.addEventListener("keydown", onKey)
    if (!item.el.hasAttribute("tabindex")) item.el.setAttribute("tabindex", "0")
    if (!item.el.hasAttribute("role")) item.el.setAttribute("role", "button")
    item.el.style.cursor = "pointer"

    const dndCleanup = draggable({
      element: item.el,
      getInitialData: () => ({ itemId: item.itemId }),
      onDragStart: () => highlightZones(true),
      onDrop: () => highlightZones(false),
    })

    cleanups.push(() => {
      item.el.removeEventListener("click", onClick)
      item.el.removeEventListener("keydown", onKey)
      dndCleanup()
    })
  }

  for (const { slot, zone } of slotById.values()) {
    const slotId = slot.id
    const onClick = (e: Event) => {
      // Clicking a placed card removes it (its own handler runs) — don't also
      // treat the bubbled zone click as a placement.
      if ((e.target as HTMLElement | null)?.closest(".activity-item")) return
      onZoneClick(slotId)
    }
    const onKey = (e: KeyboardEvent) => {
      if (selectedId && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault()
        onZoneClick(slotId)
      }
    }
    zone.addEventListener("click", onClick)
    zone.addEventListener("keydown", onKey)
    if (!zone.hasAttribute("tabindex")) zone.setAttribute("tabindex", "0")
    if (!zone.hasAttribute("role")) zone.setAttribute("role", "button")
    zone.style.cursor = "pointer"

    const dropCleanup = dropTargetForElements({
      element: zone,
      getData: () => ({ slotId }),
      onDragEnter: () => zone.classList.add(...ZONE_HIGHLIGHT_CLASSES),
      onDragLeave: () => zone.classList.remove(...ZONE_HIGHLIGHT_CLASSES),
      onDrop: ({ source }) => {
        zone.classList.remove(...ZONE_HIGHLIGHT_CLASSES)
        const itemId = source.data.itemId
        if (typeof itemId !== "string") return
        const item = items.get(itemId)
        if (item) place(item, slotId)
      },
    })

    cleanups.push(() => {
      zone.removeEventListener("click", onClick)
      zone.removeEventListener("keydown", onKey)
      dropCleanup()
    })
  }

  const markItem = (item: Item, isCorrect: boolean) => {
    clearItemVerdict(item)
    item.el.classList.add(...(isCorrect ? CORRECT_CLASSES : INCORRECT_CLASSES))
    item.el.setAttribute("aria-invalid", isCorrect ? "false" : "true")
    const mark = document.createElement("span")
    mark.className = `${VERDICT_MARK_CLASS} ml-2 inline-flex align-middle font-bold ${
      isCorrect ? "text-green-700" : "text-red-700"
    }`
    mark.textContent = isCorrect ? "✓" : "✗"
    mark.setAttribute("aria-hidden", "true")
    item.el.appendChild(mark)
  }

  const handleValidate = () => {
    if (store.get(submitStateAtom) === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }

    const placed = [...items.values()].filter((i) => i.slotId !== null)
    if (placed.length === 0) return

    clearAllVerdicts()

    let correct = 0
    for (const item of placed) {
      const isCorrect = item.slotId === correctAnswers[item.itemId]
      markItem(item, isCorrect)
      if (isCorrect) correct++
    }

    const total = items.size
    const unplaced = total - placed.length
    const allCorrect = correct === total
    validated = true

    playActivitySound(allCorrect ? "success" : "error")

    showActivityProgressToast(
      { total, correct, unfilled: unplaced },
      { emptyLabel: tr("activity-progress-remaining", "remaining") },
    )

    if (allCorrect) {
      announceToScreenReader(
        tr("matching-correct-answers", "Great job! Everything is matched correctly."),
      )
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
    } else {
      announceToScreenReader(
        unplaced > 0
          ? tr("matching-not-complete", "Please match every item before submitting.")
          : tr("matching-try-again", "Some items are matched incorrectly. Try again."),
      )
      refreshSubmit()
    }
  }

  const handleSkip = () => {
    const href = findNextPageHref()
    if (href) window.location.href = href
  }

  section.setAttribute("role", "group")
  const applyLocalizedAria = () => {
    section.setAttribute(
      "aria-label",
      tr("matching-options-label", "Match each item to the correct image"),
    )
  }
  applyLocalizedAria()

  store.set(validateHandlerAtom, () => handleValidate)
  store.set(skipHandlerAtom, () => handleSkip)
  store.set(submitStateAtom, "submit")
  store.set(submitLabelAtom, null)
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, hasNextPage)

  const unsubTranslations = store.sub(translationsAtom, applyLocalizedAria)

  const dndCleanup = combine(...cleanups)

  return () => {
    dndCleanup()
    unsubTranslations()
    store.set(validateHandlerAtom, () => null)
    store.set(skipHandlerAtom, () => null)
    store.set(submitEnabledAtom, false)
    store.set(skipEnabledAtom, false)
  }
}

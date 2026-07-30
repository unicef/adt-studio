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
 * `activity_sorting` — learners place draggable word cards into labelled
 * category buckets. Ported from the legacy `sorting.js`.
 *
 * Two interaction paths, mirroring the legacy module:
 *   1. Pointer drag — drag a `.word-card` onto a `.category` drop zone
 *      (powered by pragmatic-drag-and-drop so it also works on touch).
 *   2. Click / keyboard — click a card to SELECT it (categories highlight),
 *      then click a category (or focus it and press Enter/Space) to PLACE the
 *      selected card there. Clicking a placed card returns it to the bank.
 *
 * Unlike the legacy module, which CLONED the card into the category and
 * disabled the original, this port MOVES the single card element between the
 * word bank and the category's `<ul class="word-list">`. There is therefore
 * never a "disabled original" to keep in sync — placement state lives entirely
 * in `card.category`.
 *
 * Validation compares each placed card's category against
 * `window.correctAnswers` (an item-id → category-id map injected by
 * `packages/pipeline/src/package-web.ts:renderPageHtml`). The activity passes
 * only when every card is placed AND every placement is correct.
 */
const SORTING_SELECTOR = 'section[data-section-type="activity_sorting"]'

function tr(key: string, fallback: string): string {
  const dict = getDefaultStore().get(translationsAtom)
  return dict[key] || fallback
}

// `window.correctAnswers` is declared once in ./activity-globals.d.ts. For
// sorting, it maps each item id (`data-activity-item`) to the id of the
// category (`data-activity-category`) it belongs in.

function readCorrectAnswers(section: HTMLElement): Record<string, string> {
  const attr = section.getAttribute("data-correct-answers")
  if (attr) {
    try {
      const parsed = JSON.parse(attr) as Record<string, unknown>
      return mapToStrings(parsed)
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
// Visual styling. Selection + drag-highlight mirror the legacy classes so the
// look matches existing books; verdict styling reuses the legacy green/red
// wash plus a ✓/✗ mark span.
// ---------------------------------------------------------------------------
// The renderer emits varying card borders (often a near-invisible
// `border-gray-200` on a white card) which makes a draggable card hard to
// recognize. The runtime enforces a clear, consistent look via INLINE styles —
// inline styles win over Tailwind classes regardless of CSS source order, so
// the affordance is guaranteed for every book without re-rendering.
const CARD_RADIUS = "0.75rem" // rounded-xl
const CARD_BORDER_WIDTH = "2px"
const CARD_BORDER_BASE = "rgb(100, 116, 139)" // slate-500 — clearly visible on white
const CARD_BORDER_PLACED = "rgb(37, 99, 235)" // blue-600 — signals "placed"
const CARD_BORDER_CORRECT = "rgb(22, 163, 74)" // green-600
const CARD_BORDER_INCORRECT = "rgb(220, 38, 38)" // red-600
const SELECT_OUTLINE = "rgb(37, 99, 235)" // blue-600
const CARD_SHADOW = "0 1px 3px rgba(0, 0, 0, 0.12)"
const CARD_SHADOW_PLACED = "0 2px 8px rgba(0, 0, 0, 0.18)"
const CATEGORY_HIGHLIGHT_CLASSES = ["bg-blue-100", "border-blue-400"] as const
const PLACED_FLAG_CLASS = "placed-word" // selector hook + external CSS contract
const VERDICT_MARK_CLASS = "validation-mark"

function setCardBorder(el: HTMLElement, color: string): void {
  el.style.border = `${CARD_BORDER_WIDTH} solid ${color}`
}

function setSelectedOutline(el: HTMLElement, on: boolean): void {
  el.style.outline = on ? `3px solid ${SELECT_OUTLINE}` : ""
  el.style.outlineOffset = on ? "2px" : ""
}

/**
 * Reset a card to its non-verdict look for its current placement state: a
 * slate-bordered "draggable" card in the bank, or a blue-bordered "placed" card
 * in a category. Also strips any verdict mark + aria-invalid so the same call
 * doubles as "clear verdict". The border radius is set once at init and left
 * untouched here.
 */
function applyPlacementStyle(el: HTMLElement, placed: boolean): void {
  el.querySelectorAll(`.${VERDICT_MARK_CLASS}`).forEach((m) => m.remove())
  el.setAttribute("aria-invalid", "false")
  setCardBorder(el, placed ? CARD_BORDER_PLACED : CARD_BORDER_BASE)
  el.style.boxShadow = placed ? CARD_SHADOW_PLACED : CARD_SHADOW
  el.style.cursor = placed ? "pointer" : "grab"
  el.classList.toggle(PLACED_FLAG_CLASS, placed)
}

interface Card {
  el: HTMLElement
  itemId: string
  /**
   * The card's accessible name, captured once at init. `place()` rewrites the
   * element's aria-label into a composite ("X — placed in Y. Press Enter to
   * remove."), so it can't be re-derived from the DOM later. Image-only cards
   * carry their name in aria-label rather than visible text, so we fall back
   * to it here.
   */
  label: string
  /** Where the card lives in the bank, so removal restores original order. */
  home: { parent: HTMLElement; index: number }
  /** Currently-assigned category id, or null when sitting in the bank. */
  category: string | null
}

function getItemId(el: HTMLElement): string | null {
  return el.getAttribute("data-activity-item")
}

function cardLabel(el: HTMLElement): string {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim()
  // Image-only cards have no text leaf — their name lives in aria-label.
  return text || el.getAttribute("aria-label")?.trim() || ""
}

function categoryName(category: HTMLElement): string {
  return (
    category.getAttribute("aria-label") ||
    category.querySelector(".font-semibold, label")?.textContent?.replace(/\s+/g, " ").trim() ||
    category.getAttribute("data-activity-category") ||
    ""
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

export function initializeSortingActivity(): (() => void) | null {
  if (typeof document === "undefined") return null
  const section = document.querySelector<HTMLElement>(SORTING_SELECTOR)
  if (!section) return null

  const store = getDefaultStore()
  const correctAnswers = readCorrectAnswers(section)
  const hasNextPage = findNextPageHref() !== null

  // Snapshot every word card and remember its home position so a removed card
  // can return to its original slot in the bank.
  const cards = new Map<string, Card>()
  section.querySelectorAll<HTMLElement>(".word-card").forEach((el) => {
    const itemId = getItemId(el)
    if (!itemId || cards.has(itemId)) return
    const parent = el.parentElement
    if (!parent) return
    const index = Array.from(parent.children).indexOf(el)
    cards.set(itemId, {
      el,
      itemId,
      label: cardLabel(el),
      home: { parent, index },
      category: null,
    })
  })

  const categories = Array.from(
    section.querySelectorAll<HTMLElement>(".category[data-activity-category]"),
  )

  if (cards.size === 0 || categories.length === 0) return null

  const categoryById = new Map<string, HTMLElement>()
  for (const cat of categories) {
    const id = cat.getAttribute("data-activity-category")
    if (id) categoryById.set(id, cat)
  }

  let selectedId: string | null = null
  let validated = false

  const anyPlaced = () => [...cards.values()].some((c) => c.category !== null)

  const highlightCategories = (on: boolean) => {
    for (const cat of categories) {
      cat.classList.toggle(CATEGORY_HIGHLIGHT_CLASSES[0], on)
      cat.classList.toggle(CATEGORY_HIGHLIGHT_CLASSES[1], on)
    }
  }

  const clearSelection = () => {
    if (selectedId) {
      const card = cards.get(selectedId)
      if (card) setSelectedOutline(card.el, false)
    }
    selectedId = null
    highlightCategories(false)
  }

  const select = (card: Card) => {
    if (card.category !== null) return
    clearSelection()
    selectedId = card.itemId
    setSelectedOutline(card.el, true)
    highlightCategories(true)
    const first = categories[0]
    announceToScreenReader(
      tr("sorting-selected-word", "Selected") +
        `: ${card.label}. ` +
        tr(
          "sorting-choose-category",
          "Choose a category to place it in, or press Enter on a category.",
        ),
    )
    first?.focus()
  }

  // Drop verdict styling and restore the card to its placement look (blue if
  // still placed, slate if back in the bank).
  const clearCardVerdict = (card: Card) => {
    applyPlacementStyle(card.el, card.category !== null)
  }

  const clearAllVerdicts = () => {
    for (const card of cards.values()) clearCardVerdict(card)
    validated = false
  }

  const refreshSubmit = () => {
    store.set(submitStateAtom, "submit")
    store.set(submitLabelAtom, null)
    store.set(submitEnabledAtom, anyPlaced())
  }

  const place = (card: Card, catId: string) => {
    const category = categoryById.get(catId)
    if (!category) return
    const list = category.querySelector<HTMLElement>(".word-list") ?? category

    if (validated) clearAllVerdicts()

    list.appendChild(card.el)
    card.category = catId
    setSelectedOutline(card.el, false)
    applyPlacementStyle(card.el, true)
    card.el.setAttribute("draggable", "false")
    card.el.setAttribute("role", "button")
    card.el.setAttribute(
      "aria-label",
      `${card.label} — ${tr("sorting-placed-in", "placed in")} ${categoryName(
        category,
      )}. ${tr("sorting-press-to-remove", "Press Enter to remove.")}`,
    )

    if (selectedId === card.itemId) selectedId = null
    highlightCategories(false)
    playActivitySound("drop")
    refreshSubmit()

    announceToScreenReader(
      `${card.label} ${tr("sorting-placed-in", "placed in")} ${categoryName(category)}.`,
    )
  }

  const remove = (card: Card) => {
    if (card.category === null) return
    if (validated) clearAllVerdicts()

    // Restore the card to its home slot, preserving original bank order.
    const { parent, index } = card.home
    const ref = parent.children[index] ?? null
    parent.insertBefore(card.el, ref)

    card.category = null
    setSelectedOutline(card.el, false)
    applyPlacementStyle(card.el, false)
    card.el.setAttribute("draggable", "true")
    card.el.setAttribute("role", "option")
    card.el.setAttribute("aria-label", card.label)

    playActivitySound("reset")
    refreshSubmit()
    announceToScreenReader(
      `${card.label} ${tr(
        "sorting-returned",
        "returned to available options.",
      )}`,
    )
    card.el.focus()
  }

  // Click toggles between select (bank) and remove (placed).
  const onCardClick = (card: Card) => {
    if (card.category !== null) remove(card)
    else if (selectedId === card.itemId) clearSelection()
    else select(card)
  }

  const onCategoryClick = (catId: string) => {
    if (!selectedId) return
    const card = cards.get(selectedId)
    if (card) place(card, catId)
  }

  // ---- wire listeners + drag-and-drop ------------------------------------
  const cleanups: Array<() => void> = []

  for (const card of cards.values()) {
    const onClick = (e: Event) => {
      e.preventDefault()
      onCardClick(card)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        onCardClick(card)
      }
    }
    card.el.addEventListener("click", onClick)
    card.el.addEventListener("keydown", onKey)
    if (!card.el.hasAttribute("tabindex")) card.el.setAttribute("tabindex", "0")
    if (!card.el.hasAttribute("role")) card.el.setAttribute("role", "option")

    // Images inside cards must not start their own native drag.
    card.el.querySelectorAll("img").forEach((img) => {
      img.setAttribute("draggable", "false")
      ;(img as HTMLElement).style.pointerEvents = "none"
    })

    // Enforce a clear, consistent draggable-card look. Inline styles override
    // the renderer's faint border classes, so text, image, and image+text
    // cards all read as a single rounded, bordered, liftable card.
    card.el.style.borderRadius = CARD_RADIUS
    applyPlacementStyle(card.el, false)

    const dndCleanup = draggable({
      element: card.el,
      canDrag: () => card.category === null,
      getInitialData: () => ({ itemId: card.itemId }),
      onDragStart: () => highlightCategories(true),
      onDrop: () => highlightCategories(false),
    })

    cleanups.push(() => {
      card.el.removeEventListener("click", onClick)
      card.el.removeEventListener("keydown", onKey)
      dndCleanup()
    })
  }

  for (const category of categories) {
    const catId = category.getAttribute("data-activity-category")
    if (!catId) continue

    const onClick = (e: Event) => {
      // Clicking a placed card inside the category should remove it, not place
      // a new one — that card's own click handler runs first; bail here.
      if ((e.target as HTMLElement | null)?.closest(".placed-word")) return
      onCategoryClick(catId)
    }
    const onKey = (e: KeyboardEvent) => {
      if (selectedId && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault()
        onCategoryClick(catId)
      }
    }
    category.addEventListener("click", onClick)
    category.addEventListener("keydown", onKey)
    if (!category.hasAttribute("tabindex")) category.setAttribute("tabindex", "0")
    if (!category.hasAttribute("role")) category.setAttribute("role", "listbox")

    const dropCleanup = dropTargetForElements({
      element: category,
      getData: () => ({ catId }),
      onDragEnter: () => {
        category.classList.add(...CATEGORY_HIGHLIGHT_CLASSES)
      },
      onDragLeave: () => {
        category.classList.remove(...CATEGORY_HIGHLIGHT_CLASSES)
      },
      onDrop: ({ source }) => {
        category.classList.remove(...CATEGORY_HIGHLIGHT_CLASSES)
        const itemId = source.data.itemId
        if (typeof itemId !== "string") return
        const card = cards.get(itemId)
        if (card) place(card, catId)
      },
    })

    cleanups.push(() => {
      category.removeEventListener("click", onClick)
      category.removeEventListener("keydown", onKey)
      dropCleanup()
    })
  }

  const markCard = (card: Card, isCorrect: boolean) => {
    card.el.querySelectorAll(`.${VERDICT_MARK_CLASS}`).forEach((m) => m.remove())
    setCardBorder(card.el, isCorrect ? CARD_BORDER_CORRECT : CARD_BORDER_INCORRECT)
    card.el.setAttribute("aria-invalid", isCorrect ? "false" : "true")
    const mark = document.createElement("span")
    mark.className = `${VERDICT_MARK_CLASS} ml-2 inline-flex items-center text-lg ${
      isCorrect ? "text-green-700" : "text-red-700"
    }`
    mark.textContent = isCorrect ? "✓" : "✗"
    mark.setAttribute("aria-hidden", "true")
    card.el.appendChild(mark)
  }

  const handleValidate = () => {
    if (store.get(submitStateAtom) === "next") {
      const href = findNextPageHref()
      if (href) window.location.href = href
      return
    }

    const placed = [...cards.values()].filter((c) => c.category !== null)
    if (placed.length === 0) return

    clearAllVerdicts()

    let correct = 0
    for (const card of placed) {
      const isCorrect = card.category === correctAnswers[card.itemId]
      markCard(card, isCorrect)
      if (isCorrect) correct++
    }

    const total = cards.size
    const unplaced = total - placed.length
    const allCorrect = correct === total
    validated = true

    playActivitySound(allCorrect ? "success" : "error")

    // total / correct / unfilled feed the shared toast, whose internal
    // identity wrong = total − correct − unfilled then recovers the incorrect
    // count. "remaining" relabels the empty bucket for unplaced cards.
    showActivityProgressToast(
      { total, correct, unfilled: unplaced },
      { emptyLabel: tr("activity-progress-remaining", "remaining") },
    )

    if (allCorrect) {
      announceToScreenReader(
        tr("sorting-correct-answer", "Great job! Your answer is correct."),
      )
      store.set(confettiTriggerAtom, store.get(confettiTriggerAtom) + 1)
      store.set(submitStateAtom, "next")
      store.set(submitLabelAtom, null)
      store.set(submitEnabledAtom, hasNextPage)
    } else {
      announceToScreenReader(
        unplaced > 0
          ? tr("sorting-not-complete", "Please place every word before submitting.")
          : tr("sorting-try-again", "Some words are in the wrong category. Try again."),
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
      tr("sorting-options-label", "Sort each word into the correct category"),
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

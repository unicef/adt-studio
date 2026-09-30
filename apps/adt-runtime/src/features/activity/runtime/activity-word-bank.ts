import { getDefaultStore } from "jotai"
import { translationsAtom } from "@/features/language/state/language.atoms"
import { announceToScreenReader } from "@/shared/lib/aria-live"

const CHIP_SELECTOR = "[data-word-bank-chip]"
const TARGET_SELECTOR = "[data-word-bank-target]"
const STATUS_SELECTOR = "[data-word-bank-status]"
const PLACED_CLASSES = ["bg-emerald-50", "border-emerald-600"] as const

type WordBankTarget = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

function tr(key: string, fallback: string): string {
  return getDefaultStore().get(translationsAtom)[key] || fallback
}

function closestElement<T extends Element>(target: EventTarget | null, selector: string): T | null {
  return target instanceof Element ? target.closest<T>(selector) : null
}

/**
 * Enable word-bank cloze controls on any page that declares the data contract.
 * These can live inside mixed-content sections, so this initializer is not
 * restricted to `activity_*` section types.
 */
export function initializeWordBankActivity(): (() => void) | null {
  if (typeof document === "undefined") return null

  const chips = Array.from(document.querySelectorAll<HTMLElement>(CHIP_SELECTOR))
  const targets = Array.from(document.querySelectorAll<WordBankTarget>(TARGET_SELECTOR))
  if (chips.length === 0 || targets.length === 0) return null

  const status = document.querySelector<HTMLElement>(STATUS_SELECTOR)
  let selectedValue = ""

  const announce = (message: string) => {
    if (status) status.textContent = message
    else announceToScreenReader(message)
  }

  const selectChip = (chip: HTMLElement) => {
    selectedValue = chip.getAttribute("data-word-bank-chip") ?? ""
    for (const item of chips) item.setAttribute("aria-pressed", String(item === chip))
    if (!selectedValue) return
    announce(
      `${tr("matching-selected", "Selected")}: ${selectedValue}. ${tr(
        "word-bank-choose-blank",
        "Move to a blank and press Enter.",
      )}`,
    )
  }

  const place = (target: WordBankTarget, value: string) => {
    if (!value) return
    target.value = value
    target.dispatchEvent(new Event("input", { bubbles: true }))
    target.dispatchEvent(new Event("change", { bubbles: true }))
    target.classList.add(...PLACED_CLASSES)
    const label = target.getAttribute("aria-label") || tr("word-bank-blank", "blank")
    announce(`${value} ${tr("matching-placed", "placed")} ${tr("word-bank-in", "in")} ${label}.`)
  }

  const onClick = (event: MouseEvent) => {
    const chip = closestElement<HTMLElement>(event.target, CHIP_SELECTOR)
    if (chip) selectChip(chip)
  }
  const onDragStart = (event: DragEvent) => {
    const chip = closestElement<HTMLElement>(event.target, CHIP_SELECTOR)
    if (!chip) return
    selectChip(chip)
    event.dataTransfer?.setData("text/plain", selectedValue)
  }
  const onDragOver = (event: DragEvent) => {
    if (closestElement<WordBankTarget>(event.target, TARGET_SELECTOR)) event.preventDefault()
  }
  const onDrop = (event: DragEvent) => {
    const target = closestElement<WordBankTarget>(event.target, TARGET_SELECTOR)
    if (!target) return
    event.preventDefault()
    place(target, event.dataTransfer?.getData("text/plain") || selectedValue)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !selectedValue) return
    const target = closestElement<WordBankTarget>(event.target, TARGET_SELECTOR)
    if (!target) return
    event.preventDefault()
    place(target, selectedValue)
  }

  document.addEventListener("click", onClick)
  document.addEventListener("dragstart", onDragStart)
  document.addEventListener("dragover", onDragOver)
  document.addEventListener("drop", onDrop)
  document.addEventListener("keydown", onKeyDown)

  return () => {
    document.removeEventListener("click", onClick)
    document.removeEventListener("dragstart", onDragStart)
    document.removeEventListener("dragover", onDragOver)
    document.removeEventListener("drop", onDrop)
    document.removeEventListener("keydown", onKeyDown)
  }
}

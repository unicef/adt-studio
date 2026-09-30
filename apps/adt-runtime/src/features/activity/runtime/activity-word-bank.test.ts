// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { initializeWordBankActivity } from "./activity-word-bank"

function setupWordBank(): void {
  document.body.innerHTML = `
    <section data-section-type="text_and_images">
      <button type="button" draggable="true" data-word-bank-chip="I" aria-pressed="false">I</button>
      <button type="button" draggable="true" data-word-bank-chip="we" aria-pressed="false">we</button>
      <input data-word-bank-target="true" aria-label="Conversation blank 1">
      <input data-word-bank-target="true" aria-label="Conversation blank 2">
      <p data-word-bank-status role="status" aria-live="polite"></p>
    </section>
  `
}

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("initializeWordBankActivity", () => {
  it("supports chip selection followed by keyboard placement on mixed-content pages", () => {
    setupWordBank()
    const cleanup = initializeWordBankActivity()
    const chip = document.querySelector<HTMLButtonElement>('[data-word-bank-chip="I"]')!
    const target = document.querySelector<HTMLInputElement>("[data-word-bank-target]")!

    chip.click()
    expect(chip.getAttribute("aria-pressed")).toBe("true")
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    expect(target.value).toBe("I")
    expect(target.classList.contains("border-emerald-600")).toBe(true)
    expect(document.querySelector("[data-word-bank-status]")?.textContent).toContain(
      "placed in Conversation blank 1",
    )
    cleanup?.()
  })

  it("supports drag-and-drop placement", () => {
    setupWordBank()
    const cleanup = initializeWordBankActivity()
    const chip = document.querySelector<HTMLElement>('[data-word-bank-chip="we"]')!
    const target = document.querySelectorAll<HTMLInputElement>("[data-word-bank-target]")[1]
    const transfer = {
      value: "",
      setData: (_type: string, value: string) => { transfer.value = value },
      getData: () => transfer.value,
    }

    const dragStart = new Event("dragstart", { bubbles: true }) as DragEvent
    Object.defineProperty(dragStart, "dataTransfer", { value: transfer })
    chip.dispatchEvent(dragStart)
    const drop = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent
    Object.defineProperty(drop, "dataTransfer", { value: transfer })
    target.dispatchEvent(drop)

    expect(target.value).toBe("we")
    cleanup?.()
  })

  it("does nothing without both chips and targets", () => {
    document.body.innerHTML = '<button data-word-bank-chip="I">I</button>'
    expect(initializeWordBankActivity()).toBeNull()
  })
})

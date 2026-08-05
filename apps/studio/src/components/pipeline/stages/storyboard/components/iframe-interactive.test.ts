import { JSDOM } from "jsdom"
import { describe, expect, it } from "vitest"
import { INTERACTIVE_SCRIPT } from "./iframe-interactive"

describe("storyboard word-bank interaction", () => {
  function documentWithWordBank() {
    return new JSDOM(`<!doctype html><html><body data-editable="false" data-link-mode="false">
      <button type="button" draggable="true" data-word-bank-chip="I" aria-pressed="false">I</button>
      <button type="button" draggable="true" data-word-bank-chip="we" aria-pressed="false">we</button>
      <input data-word-bank-target="true" aria-label="Conversation blank 1">
      <input data-word-bank-target="true" aria-label="Conversation blank 2">
      <p data-word-bank-status role="status" aria-live="polite"></p>
      ${INTERACTIVE_SCRIPT}
    </body></html>`, { runScripts: "dangerously" }).window.document
  }

  it("supports chip selection followed by keyboard placement", () => {
    const document = documentWithWordBank()
    const chip = document.querySelector<HTMLButtonElement>('[data-word-bank-chip="I"]')!
    const target = document.querySelector<HTMLInputElement>('[data-word-bank-target]')!

    chip.click()
    expect(chip.getAttribute("aria-pressed")).toBe("true")
    target.dispatchEvent(new document.defaultView!.KeyboardEvent("keydown", { key: "Enter", bubbles: true }))

    expect(target.value).toBe("I")
    expect(document.querySelector("[data-word-bank-status]")?.textContent).toContain("placed in Conversation blank 1")
  })

  it("supports pointer drag-and-drop placement", () => {
    const document = documentWithWordBank()
    const chip = document.querySelector<HTMLElement>('[data-word-bank-chip="we"]')!
    const target = document.querySelectorAll<HTMLInputElement>('[data-word-bank-target]')[1]
    const transfer = {
      value: "",
      setData: (_type: string, value: string) => { transfer.value = value },
      getData: () => transfer.value,
    }
    const drag = new document.defaultView!.Event("dragstart", { bubbles: true })
    Object.defineProperty(drag, "dataTransfer", { value: transfer })
    chip.dispatchEvent(drag)
    const drop = new document.defaultView!.Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(drop, "dataTransfer", { value: transfer })
    target.dispatchEvent(drop)

    expect(target.value).toBe("we")
    expect(drop.defaultPrevented).toBe(true)
  })
})

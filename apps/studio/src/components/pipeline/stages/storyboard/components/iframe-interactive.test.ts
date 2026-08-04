// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"
import { INTERACTIVE_SCRIPT } from "./iframe-interactive"

function installInteractiveEditor() {
  const source = INTERACTIVE_SCRIPT.replace(/^<script>/, "").replace(/<\/script>$/, "")
  window.eval(source)
}

describe("storyboard canvas editing", () => {
  it("groups, moves, rotates, and deletes selected components", () => {
    document.body.innerHTML = '<div id="content"><img data-id="one"><img data-id="two"></div>'
    document.body.dataset.editable = "true"
    const postMessage = vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    installInteractiveEditor()

    const one = document.querySelector<HTMLElement>('[data-id="one"]')!
    const two = document.querySelector<HTMLElement>('[data-id="two"]')!
    one.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }))
    two.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, metaKey: true }))

    expect(document.querySelectorAll("[data-adt-selected]")).toHaveLength(2)

    const handle = document.querySelector<HTMLElement>('[data-adt-drag-handle="true"]')!
    expect(handle).not.toBeNull()
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 20 }))
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 42, clientY: 68 }))
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 42, clientY: 68 }))

    expect(one.style.translate).toBe("32px 48px")
    expect(two.style.translate).toBe("32px 48px")
    expect(postMessage).toHaveBeenCalledWith(
      { type: "element-moved", dataId: "two" },
      "*",
    )

    handle.focus()
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(one.style.translate).toBe("33px 48px")
    expect(two.style.translate).toBe("33px 48px")

    const rotateHandle = document.querySelector<HTMLElement>('[data-adt-rotate-handle="true"]')!
    rotateHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    expect(one.style.rotate).toBe("1deg")
    expect(two.style.rotate).toBe("1deg")

    rotateHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }))
    expect(document.querySelectorAll("[data-id]")).toHaveLength(0)
    expect(postMessage).toHaveBeenCalledWith(
      { type: "elements-changed", dataId: "two" },
      "*",
    )
  })

  it("keeps positions separate by device and supports undo", async () => {
    document.body.innerHTML = '<div id="content"><div data-id="one">Card</div></div>'
    document.body.dataset.editable = "true"
    document.body.dataset.deviceView = "desktop"
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    installInteractiveEditor()

    const one = document.querySelector<HTMLElement>('[data-id="one"]')!
    one.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    const handle = document.querySelector<HTMLElement>('[data-adt-drag-handle]')!
    handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 0, clientY: 0 }))
    document.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 10 }))
    document.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 20, clientY: 10 }))
    expect(one.getAttribute("data-adt-x-desktop")).toBe("20")

    document.body.dataset.deviceView = "mobile"
    await Promise.resolve()
    expect(one.style.translate).toBe("0px 0px")
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true }))
    expect(document.querySelector<HTMLElement>('[data-id="one"]')!.getAttribute("data-adt-x-desktop")).toBeNull()
  })

  it("does not delete a component while its text is being edited", () => {
    document.body.innerHTML = '<div id="content"><p data-id="text">Editable</p></div>'
    document.body.dataset.editable = "true"
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined)
    installInteractiveEditor()
    const text = document.querySelector<HTMLElement>('[data-id="text"]')!
    text.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    text.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }))
    expect(document.querySelector('[data-id="text"]')).not.toBeNull()
  })
})

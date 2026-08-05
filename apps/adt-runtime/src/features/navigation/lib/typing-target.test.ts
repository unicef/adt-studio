// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { isTypingTarget } from "./typing-target"

function makeEl(tag: string, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe("isTypingTarget", () => {
  it("returns true for text-entry form elements", () => {
    expect(isTypingTarget(makeEl("input"))).toBe(true)
    expect(isTypingTarget(makeEl("textarea"))).toBe(true)
    expect(isTypingTarget(makeEl("select"))).toBe(true)
  })

  it("returns false for buttons — they do not capture typing", () => {
    expect(isTypingTarget(makeEl("button"))).toBe(false)
  })

  it("returns true for contenteditable targets", () => {
    const el = makeEl("div")
    // jsdom does not implement isContentEditable; force-set the getter so
    // the production check (which reads the DOM property, not the attribute)
    // matches what a real browser exposes.
    Object.defineProperty(el, "isContentEditable", { value: true, configurable: true })
    expect(isTypingTarget(el)).toBe(true)
  })

  it("returns true when target is inside a [data-activity-item] subtree", () => {
    const wrapper = makeEl("div", { "data-activity-item": "" })
    const inner = makeEl("span")
    wrapper.appendChild(inner)
    document.body.appendChild(wrapper)
    expect(isTypingTarget(inner)).toBe(true)
    document.body.removeChild(wrapper)
  })

  it("returns false for focused quiz labels so arrows keep turning pages", () => {
    const option = makeEl("label", {
      class: "activity-option",
      role: "radio",
      "data-activity-item": "item-1",
    })
    const inner = makeEl("span")
    option.appendChild(inner)
    document.body.appendChild(option)

    expect(isTypingTarget(option)).toBe(false)
    expect(isTypingTarget(inner)).toBe(false)

    option.remove()
  })

  it("returns false for plain non-interactive elements", () => {
    expect(isTypingTarget(makeEl("div"))).toBe(false)
    expect(isTypingTarget(makeEl("p"))).toBe(false)
  })

  it("returns false for null or non-HTMLElement targets", () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(new EventTarget())).toBe(false)
  })
})

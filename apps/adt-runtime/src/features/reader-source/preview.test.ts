// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { RELOAD_STYLES_MESSAGE, reloadStylesheets, sourceOfComponentStack, subscribeReaderSourcePreview } from "./preview"

afterEach(() => {
  document.head.innerHTML = ""
  globalThis.__adtSources = undefined
  vi.restoreAllMocks()
})

describe("reader source preview", () => {
  it("AC-27: a css-only update swaps the stylesheet without reloading the page", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="./content/tailwind_output.css"><link rel="stylesheet" href="./other.css">'
    const [tailwind, other] = [...document.querySelectorAll("link")]
    const before = tailwind.href

    expect(reloadStylesheets()).toBe(1)
    expect(tailwind.href).not.toBe(before)
    expect(new URL(tailwind.href).pathname).toBe(new URL(before).pathname)
    expect(new URL(tailwind.href).searchParams.get("v")).toMatch(/^\d+$/)
    expect(other.getAttribute("href")).toBe("./other.css")
  })

  it("only listens inside a frame", () => {
    const listen = vi.spyOn(window, "addEventListener")
    subscribeReaderSourcePreview()
    expect(listen).not.toHaveBeenCalledWith("message", expect.anything())
    expect(RELOAD_STYLES_MESSAGE).toBe("adt-studio/reload-styles")
  })

  it("maps a component stack to the innermost tagged component", () => {
    globalThis.__adtSources = { Dock: { path: "features/dock/components/Dock.tsx", line: 12 } }
    expect(sourceOfComponentStack("\n    at Broken (x.js:1:1)\n    at Dock (x.js:2:2)\n    at ChromeRoot (x.js:3:3)")).toEqual({
      component: "Dock",
      path: "features/dock/components/Dock.tsx",
      line: 12,
    })
    expect(sourceOfComponentStack("\n    at Unknown (x.js:1:1)")).toBeNull()
  })
})

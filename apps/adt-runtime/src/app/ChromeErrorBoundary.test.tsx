// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { ChromeErrorBoundary } from "./ChromeErrorBoundary"

function Broken(): never {
  throw new Error("dock exploded")
}

afterEach(() => {
  document.body.innerHTML = ""
  globalThis.__adtSources = undefined
  vi.restoreAllMocks()
})

it("AC-28: a throwing chrome keeps the page content and reports the path to Studio", () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.__adtSources = { Broken: { path: "features/dock/components/Broken.tsx", line: 3 } }
  const parent = { postMessage: vi.fn() }
  vi.spyOn(window, "parent", "get").mockReturnValue(parent as unknown as Window)
  vi.spyOn(console, "error").mockImplementation(() => {})

  document.body.innerHTML = '<main id="content">Page text</main><div id="chrome"></div>'
  const root = createRoot(document.getElementById("chrome")!)
  act(() => {
    root.render(
      <ChromeErrorBoundary>
        <Broken />
      </ChromeErrorBoundary>,
    )
  })

  expect(document.getElementById("content")?.textContent).toBe("Page text")
  expect(document.getElementById("chrome")?.innerHTML).toBe("")
  expect(parent.postMessage).toHaveBeenCalledWith(
    { type: "adt-runtime/error", message: "dock exploded", path: "features/dock/components/Broken.tsx", line: 3, component: "Broken" },
    "*",
  )
  act(() => root.unmount())
})

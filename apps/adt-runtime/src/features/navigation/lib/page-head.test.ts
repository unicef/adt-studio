// @vitest-environment jsdom
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

const ATTR = "data-adt-page-head"

describe("page-head", () => {
  it("claims the styles present when it evaluates and none added afterwards", async () => {
    document.head.innerHTML = `<style id="page">body { font-family: serif }</style>`
    vi.resetModules()
    await import("@/features/navigation/lib/page-head")

    const library = document.createElement("style")
    library.id = "library"
    library.textContent = "[data-sonner-toaster] { position: fixed }"
    document.head.appendChild(library)

    expect(document.getElementById("page")?.hasAttribute(ATTR)).toBe(true)
    expect(document.getElementById("library")?.hasAttribute(ATTR)).toBe(false)
  })

  /**
   * The claim is only correct if nothing has had a chance to inject a style
   * before it runs, and that comes down to import order in the bundle entries.
   */
  it.each(["boot.tsx", "activities-entry.tsx"])("is the first import of %s", (entry) => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../..", entry), "utf8")
    const firstImport = source.match(/^import\b.*$/m)?.[0]
    expect(firstImport).toBe('import "@/features/navigation/lib/page-head"')
  })
})

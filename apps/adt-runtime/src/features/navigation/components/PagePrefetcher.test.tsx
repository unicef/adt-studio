// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { getDefaultStore } from "jotai"
import { currentSectionIdAtom, pagesAtom } from "@/features/navigation/state/nav.atoms"
import { PagePrefetcher } from "./PagePrefetcher"

const pages = [
  { section_id: "pg001_sec001", href: "pg001_sec001.html" },
  { section_id: "pg002_sec001", href: "pg002_sec001.html" },
  { section_id: "pg003_sec001", href: "pg003_sec001.html" },
]

function setLocation(href: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(href) as unknown as Location,
  })
}

function prefetchHrefs(): Array<string | null> {
  return Array.from(document.head.querySelectorAll('link[rel="prefetch"]')).map((el) =>
    el.getAttribute("href"),
  )
}

beforeEach(() => {
  getDefaultStore().set(pagesAtom, pages)
  getDefaultStore().set(currentSectionIdAtom, "pg002_sec001")
})

afterEach(() => {
  getDefaultStore().set(pagesAtom, [])
  getDefaultStore().set(currentSectionIdAtom, null)
})

describe("PagePrefetcher", () => {
  it("prefetches both neighbours but does not prerender when pages swap in place", () => {
    setLocation("http://localhost/book/pg002_sec001.html")

    const view = render(<PagePrefetcher />)

    expect(prefetchHrefs()).toEqual(["pg001_sec001.html", "pg003_sec001.html"])
    expect(document.head.querySelector('script[type="speculationrules"]')).toBeNull()

    view.unmount()
    expect(prefetchHrefs()).toEqual([])
  })

  it("keeps prerendering the next page on the hard-navigation path", () => {
    setLocation("file:///Users/someone/book/pg002_sec001.html")

    const view = render(<PagePrefetcher />)

    const rules = document.head.querySelector('script[type="speculationrules"]')
    expect(rules?.textContent).toBe(
      JSON.stringify({ prerender: [{ urls: ["pg003_sec001.html"] }] }),
    )

    view.unmount()
    expect(document.head.querySelector('script[type="speculationrules"]')).toBeNull()
  })
})

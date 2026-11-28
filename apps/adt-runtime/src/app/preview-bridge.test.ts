// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const navigateToPage = vi.fn()
vi.mock("@/features/navigation/lib/page-swap", () => ({ navigateToPage }))

const { parseStudioMessage, resolvePreviewNavigation, subscribePreviewBridge } = await import("@/app/preview-bridge")
const { previewBridgeStudioMessageSchema } = await import("@adt/types")

const PREVIEW_URL = "http://127.0.0.1:4100/api/books/demo/adt/v-1/pg002_sec001.html"

let parentWindow: { postMessage: ReturnType<typeof vi.fn> }
let unsubscribe: () => void = () => {}

function setLocation(href: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(href) as unknown as Location,
  })
}

function embedInStudio(): void {
  parentWindow = { postMessage: vi.fn() }
  Object.defineProperty(window, "parent", { configurable: true, value: parentWindow })
}

function postFromStudio(data: unknown, source: unknown = parentWindow): void {
  window.dispatchEvent(new MessageEvent("message", { data, source: source as Window }))
}

function lastAnnouncedPage(): unknown {
  return parentWindow.postMessage.mock.calls.at(-1)?.[0]
}

beforeEach(() => {
  document.head.innerHTML = '<title>Page two</title><meta name="title-id" content="pg002_sec001">'
  document.body.innerHTML = `
    <main>
      <img id="figure" src="a.png" alt="">
      <p class="caption">Caption</p>
      <section data-section-type="activity_multiple_choice"></section>
    </main>
  `
  setLocation(PREVIEW_URL)
  embedInStudio()
  navigateToPage.mockClear()
})

afterEach(() => {
  unsubscribe()
  unsubscribe = () => {}
  Object.defineProperty(window, "parent", { configurable: true, value: window })
})

describe("subscribePreviewBridge", () => {
  it("announces the open page to Studio on boot", () => {
    unsubscribe = subscribePreviewBridge()

    expect(parentWindow.postMessage).toHaveBeenCalledWith(
      {
        type: "adt-preview/page",
        page: {
          sectionId: "pg002_sec001",
          href: "/api/books/demo/adt/v-1/pg002_sec001.html",
          title: "Page two",
          hasImages: true,
          hasActivity: true,
          signLanguageEnabled: false,
        },
      },
      "*",
    )
  })

  it("announces again after every in-place page turn", () => {
    unsubscribe = subscribePreviewBridge()
    document.head.innerHTML = '<title>Page three</title><meta name="title-id" content="pg003_sec001">'
    document.body.innerHTML = "<main><p>Text only</p></main>"

    document.dispatchEvent(new CustomEvent("adt:page-changed", { detail: { sectionId: "pg003_sec001" } }))

    expect(lastAnnouncedPage()).toMatchObject({
      page: { sectionId: "pg003_sec001", title: "Page three", hasImages: false, hasActivity: false },
    })
  })

  it("stays silent outside a Studio preview", () => {
    Object.defineProperty(window, "parent", { configurable: true, value: window })
    const postMessage = vi.spyOn(window, "postMessage")
    unsubscribe = subscribePreviewBridge()
    expect(postMessage).not.toHaveBeenCalled()

    embedInStudio()
    setLocation("https://books.example.org/my-book/pg002_sec001.html")
    unsubscribe = subscribePreviewBridge()
    expect(parentWindow.postMessage).not.toHaveBeenCalled()
  })

  it("outlines a finding's targets and clears them", () => {
    unsubscribe = subscribePreviewBridge()

    postFromStudio({ type: "adt-preview/highlight", targets: ["#figure", "p.caption"], severity: "serious" })
    const figure = document.getElementById("figure")!
    expect(figure.getAttribute("data-adt-a11y-hover")).toBe("true")
    expect(figure.getAttribute("data-adt-a11y-hover-severity")).toBe("serious")
    expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(2)
    expect(document.getElementById("adt-preview-a11y-highlights")).not.toBeNull()

    postFromStudio({ type: "adt-preview/highlight", targets: [], severity: "unknown" })
    expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(0)
  })

  it("outlines the whole page for a document-level finding", () => {
    unsubscribe = subscribePreviewBridge()
    postFromStudio({ type: "adt-preview/highlight", targets: ["html"], severity: "critical" })
    expect(document.body.getAttribute("data-adt-a11y-hover-page")).toBe("critical")
  })

  it("survives a selector the document cannot parse", () => {
    unsubscribe = subscribePreviewBridge()
    postFromStudio({ type: "adt-preview/highlight", targets: ["::not a selector", "#figure"], severity: "minor" })
    expect(document.getElementById("figure")!.getAttribute("data-adt-a11y-hover")).toBe("true")
  })

  it("drops an outline when the page turns", () => {
    unsubscribe = subscribePreviewBridge()
    postFromStudio({ type: "adt-preview/highlight", targets: ["#figure"], severity: "minor" })
    document.dispatchEvent(new CustomEvent("adt:page-changed", { detail: {} }))
    expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(0)
  })

  it("drops an outline once the pointer moves inside the reader", () => {
    unsubscribe = subscribePreviewBridge()

    for (let entry = 0; entry < 2; entry++) {
      postFromStudio({ type: "adt-preview/highlight", targets: ["#figure"], severity: "minor" })
      expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(1)

      parentWindow.postMessage.mockClear()
      document.getElementById("figure")!.dispatchEvent(new Event("pointermove", { bubbles: true }))
      expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(0)
      expect(parentWindow.postMessage).toHaveBeenCalledWith({ type: "adt-preview/highlight-cleared" }, "*")
    }

    parentWindow.postMessage.mockClear()
    document.body.dispatchEvent(new Event("pointermove", { bubbles: true }))
    expect(parentWindow.postMessage).not.toHaveBeenCalled()
  })

  it("opens the requested page through the reader's own navigation", () => {
    unsubscribe = subscribePreviewBridge()
    postFromStudio({ type: "adt-preview/navigate", href: "pg005_sec001.html" })
    expect(navigateToPage).toHaveBeenCalledWith(
      "http://127.0.0.1:4100/api/books/demo/adt/v-1/pg005_sec001.html",
    )
  })

  it("ignores requests from any window but its parent", () => {
    unsubscribe = subscribePreviewBridge()
    const stranger = { postMessage: vi.fn() }

    postFromStudio({ type: "adt-preview/navigate", href: "pg005_sec001.html" }, stranger)
    postFromStudio({ type: "adt-preview/highlight", targets: ["#figure"], severity: "minor" }, stranger)

    expect(navigateToPage).not.toHaveBeenCalled()
    expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(0)
  })

  it("ignores malformed requests", () => {
    unsubscribe = subscribePreviewBridge()
    postFromStudio({ type: "adt-preview/highlight", targets: "#figure", severity: "minor" })
    postFromStudio({ type: "adt-preview/highlight", targets: ["#figure"], severity: "toString" })
    postFromStudio({ type: "adt-preview/navigate", href: "" })
    postFromStudio({ type: "adt-preview/navigate" })
    postFromStudio("adt-preview/navigate")

    expect(navigateToPage).not.toHaveBeenCalled()
    expect(document.querySelectorAll("[data-adt-a11y-hover]")).toHaveLength(0)
  })

  it("stops listening once unsubscribed", () => {
    subscribePreviewBridge()()
    parentWindow.postMessage.mockClear()

    document.dispatchEvent(new CustomEvent("adt:page-changed", { detail: {} }))
    postFromStudio({ type: "adt-preview/navigate", href: "pg005_sec001.html" })

    expect(parentWindow.postMessage).not.toHaveBeenCalled()
    expect(navigateToPage).not.toHaveBeenCalled()
  })
})

describe("resolvePreviewNavigation", () => {
  it("resolves book-relative and root-relative hrefs inside the bundle", () => {
    expect(resolvePreviewNavigation("pg003_sec001.html")).toBe(
      "http://127.0.0.1:4100/api/books/demo/adt/v-1/pg003_sec001.html",
    )
    expect(resolvePreviewNavigation("/pg003_sec001.html")).toBe(
      "http://127.0.0.1:4100/api/books/demo/adt/v-1/pg003_sec001.html",
    )
  })

  it("keeps every request on the reader's origin", () => {
    expect(resolvePreviewNavigation("https://evil.example/pg001.html")).toBeNull()
    expect(resolvePreviewNavigation("//evil.example/pg001.html")).toBe(
      "http://127.0.0.1:4100/api/books/demo/adt/v-1/evil.example/pg001.html",
    )
    expect(resolvePreviewNavigation("javascript:alert(1)")).toBeNull()
    expect(resolvePreviewNavigation("data:text/html,<script>alert(1)</script>")).toBeNull()
  })
})

describe("parseStudioMessage", () => {
  // The runtime checks requests by hand to keep Zod out of the reader bundle;
  // this keeps that check and the `@adt/types` schema Studio sends against in step.
  const fixtures: unknown[] = [
    { type: "adt-preview/highlight", targets: ["#a", "p.b"], severity: "serious" },
    { type: "adt-preview/highlight", targets: [], severity: "unknown" },
    { type: "adt-preview/navigate", href: "pg002_sec001.html" },
    { type: "adt-preview/highlight", targets: "#a", severity: "minor" },
    { type: "adt-preview/highlight", targets: ["#a", 3], severity: "minor" },
    { type: "adt-preview/highlight", targets: ["#a"], severity: "toString" },
    { type: "adt-preview/highlight", targets: ["#a"] },
    { type: "adt-preview/navigate", href: "" },
    { type: "adt-preview/navigate", href: 5 },
    { type: "adt-preview/page", page: {} },
    { type: "adt-runtime/preview-settings", bookLabel: "demo", settings: {} },
    null,
    "adt-preview/navigate",
    42,
  ]

  it.each(fixtures.map((fixture) => [JSON.stringify(fixture), fixture]))(
    "agrees with the shared schema on %s",
    (_label, fixture) => {
      const schema = previewBridgeStudioMessageSchema.safeParse(fixture)
      expect(parseStudioMessage(fixture)).toEqual(schema.success ? schema.data : null)
    },
  )
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const initializePageContent = vi.fn()
const announceToScreenReader = vi.fn()

vi.mock("@/app/lifecycle", () => ({ initializePageContent }))
vi.mock("@/shared/lib/aria-live", () => ({ announceToScreenReader }))
vi.mock("@/shared/lib/analytics", () => ({
  trackNavigation: vi.fn(),
  trackSpaPageView: vi.fn(),
}))

const { canSoftNavigate, claimPageHeadNodes, prefetchPage, subscribeSoftNavHistory, swapToPage } =
  await import("@/features/navigation/lib/page-swap")

/** A page as `renderPageHtml` emits one: shared stylesheets, page-scoped head
 *  nodes, and the inline scripts a swap has to re-execute. */
function pageHtml(opts: {
  sectionId: string
  title: string
  heading?: string
  bodyClass?: string
  bodyStyle?: string
  headStyle?: string
  bodyScript?: string
  contentScript?: string
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <meta name="title-id" content="${opts.sectionId}" />
  <meta name="page-section-id" content="7" />
  <link href="./content/tailwind_output.css" rel="stylesheet">
  <link href="./assets/fonts.css" rel="stylesheet">
  ${opts.headStyle ?? ""}
</head>
<body class="${opts.bodyClass ?? "min-h-screen"}"${opts.bodyStyle ? ` style="${opts.bodyStyle}"` : ""}>
  <main class="w-full">
    <h1>${opts.heading ?? opts.title}</h1>
    <div id="content" class="opacity-0">
      <p data-id="p1">body of ${opts.sectionId}</p>
      ${opts.contentScript ?? ""}
    </div>
  </main>
  ${opts.bodyScript ?? ""}
  <div id="interface-container"></div>
  <div id="nav-container"></div>
  <script src="./assets/base.bundle.local.js"></script>
</body>
</html>`
}

function installDocument(html: string): void {
  const parsed = new DOMParser().parseFromString(html, "text/html")
  document.documentElement.replaceWith(parsed.documentElement.cloneNode(true) as HTMLElement)
  claimPageHeadNodes()
}

function mockFetchOnce(html: string, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, text: async () => html }) as unknown as Response),
  )
}

function setLocation(href: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(href) as unknown as Location,
  })
}

beforeEach(() => {
  installDocument(pageHtml({ sectionId: "pg001_sec001", title: "Page one" }))
  setLocation("http://localhost/book/pg001_sec001.html")
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })))
  initializePageContent.mockClear()
  announceToScreenReader.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { __adtPendingCustomActivities?: unknown }).__adtPendingCustomActivities
  delete (window as { adtRegisterCustomActivity?: unknown }).adtRegisterCustomActivity
})

describe("canSoftNavigate", () => {
  it("is enabled for a bundle served over HTTP", () => {
    expect(canSoftNavigate()).toBe(true)
  })

  it("is disabled under file:// so double-clicked bundles keep hard navigation", () => {
    setLocation("file:///Users/someone/book/pg001_sec001.html")
    expect(canSoftNavigate()).toBe(false)
  })

  it("is disabled in the single-section embed preview", () => {
    setLocation("http://localhost/book/pg001_sec001.html?embed=1")
    expect(canSoftNavigate()).toBe(false)
  })
})

describe("swapToPage", () => {
  it("replaces the content and the metas the runtime reads", async () => {
    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))

    expect(await swapToPage("http://localhost/book/pg002_sec001.html")).toBe("ok")

    expect(
      document.querySelector('meta[name="title-id"]')?.getAttribute("content"),
    ).toBe("pg002_sec001")
    expect(document.getElementById("content")?.textContent).toContain("body of pg002_sec001")
    expect(document.title).toBe("Page two")
    expect(initializePageContent).toHaveBeenCalledOnce()
  })

  it("keeps the chrome containers and their DOM identity", async () => {
    const nav = document.getElementById("nav-container")!
    nav.setAttribute("data-mounted", "yes")
    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.getElementById("nav-container")).toBe(nav)
    expect(nav.getAttribute("data-mounted")).toBe("yes")
  })

  it("swaps page-scoped head nodes but leaves the shared stylesheets alone", async () => {
    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        headStyle: '<style id="page-font">body { font-family: Inter; }</style>',
      }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.getElementById("page-font")).not.toBeNull()
    expect(
      document.querySelectorAll('link[href$="tailwind_output.css"]'),
    ).toHaveLength(1)
    expect(document.querySelectorAll('link[href$="fonts.css"]')).toHaveLength(1)
  })

  it("does not remove head nodes owned by the runtime", async () => {
    const prefetch = document.createElement("link")
    prefetch.rel = "prefetch"
    prefetch.href = "./pg003_sec001.html"
    document.head.appendChild(prefetch)
    const favicon = document.createElement("link")
    favicon.rel = "icon"
    document.head.appendChild(favicon)

    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))
    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.querySelector('link[rel="prefetch"]')).toBe(prefetch)
    expect(document.querySelector('link[rel="icon"]')).toBe(favicon)
  })

  // Base UI's ScrollArea hides the native scrollbars through a <style> it
  // appends to <head> after mount; Sonner ships its toast CSS the same way.
  // Removing those with the page's own styles brings the native scrollbars
  // back on the first page turn.
  it("keeps styles the runtime injected after boot while replacing the page's own", async () => {
    installDocument(
      pageHtml({
        sectionId: "pg001_sec001",
        title: "Page one",
        headStyle: '<style id="page-one-font">body { font-family: Lora; }</style>',
      }),
    )
    const runtimeStyle = document.createElement("style")
    runtimeStyle.id = "scroll-area-rules"
    runtimeStyle.textContent = "[data-viewport]::-webkit-scrollbar { display: none }"
    document.head.appendChild(runtimeStyle)

    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        headStyle: '<style id="page-two-font">body { font-family: Inter; }</style>',
      }),
    )
    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.getElementById("scroll-area-rules")).toBe(runtimeStyle)
    expect(document.getElementById("page-one-font")).toBeNull()
    expect(document.getElementById("page-two-font")).not.toBeNull()
  })

  it("treats a swapped-in page style as page-scoped on the following swap", async () => {
    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        headStyle: '<style id="page-two-font">body { font-family: Inter; }</style>',
      }),
    )
    await swapToPage("http://localhost/book/pg002_sec001.html")
    mockFetchOnce(pageHtml({ sectionId: "pg003_sec001", title: "Page three" }))
    await swapToPage("http://localhost/book/pg003_sec001.html")

    expect(document.getElementById("page-two-font")).toBeNull()
  })

  it("carries the body presentation attributes over", async () => {
    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        bodyClass: "fixed-layout",
        bodyStyle: "background-color: rgb(255, 0, 0);",
      }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.body.className).toBe("fixed-layout")
    expect(document.body.getAttribute("style")).toContain("rgb(255, 0, 0)")
  })

  // These assert that the swap hands every inline script to the engine exactly
  // once, in its authored position. Whether the engine has *finished* running
  // it is jsdom's async resource queue talking, not this module — the
  // end-to-end behaviour is covered by the Playwright run.
  it("revives every inline script the generated pages depend on", async () => {
    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        bodyScript: '<script>window.correctAnswers = { q1: "b" }</script>',
        contentScript: "<script>/* custom activity */</script>",
      }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.querySelectorAll("script[type]")).toHaveLength(0)
    const live = [...document.querySelectorAll("script:not([src])")]
    expect(live).toHaveLength(2)
    expect(live.map((s) => s.textContent)).toEqual([
      "/* custom activity */",
      'window.correctAnswers = { q1: "b" }',
    ])
  })

  it("leaves a content script inside its own section so currentScript.closest resolves", async () => {
    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
        contentScript: "<script>/* custom activity */</script>",
      }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    const script = document.querySelector("#content script")
    expect(script).not.toBeNull()
    expect(script?.textContent).toBe("/* custom activity */")
  })

  it("buffers custom-activity registrations instead of leaking them to the previous page", async () => {
    const stalePage: unknown[] = []
    const staleRegistrar = ((section: HTMLElement, handlers: unknown) => {
      stalePage.push({ section, handlers })
    }) as typeof window.adtRegisterCustomActivity
    window.adtRegisterCustomActivity = staleRegistrar

    mockFetchOnce(
      pageHtml({
        sectionId: "pg002_sec001",
        title: "Page two",
      }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(window.adtRegisterCustomActivity).not.toBe(staleRegistrar)
    window.adtRegisterCustomActivity!(document.createElement("section"), {
      validate: () => true,
    })
    expect(stalePage).toHaveLength(0)
    expect(window.__adtPendingCustomActivities).toHaveLength(1)
  })

  it("moves the reading position and announces the new page", async () => {
    mockFetchOnce(
      pageHtml({ sectionId: "pg002_sec001", title: "Page two", heading: "Chapter two" }),
    )

    await swapToPage("http://localhost/book/pg002_sec001.html")

    expect(document.activeElement).toBe(document.querySelector("main"))
    expect(announceToScreenReader).toHaveBeenCalledWith("Chapter two")
  })

  it("clears the previous page's appended scripts instead of stacking them", async () => {
    for (const id of ["pg002_sec001", "pg003_sec001", "pg004_sec001"]) {
      mockFetchOnce(
        pageHtml({
          sectionId: id,
          title: id,
          bodyScript: '<script>window.correctAnswers = {}</script>',
        }),
      )
      await swapToPage(`http://localhost/book/${id}.html`)
    }

    expect(document.body.querySelectorAll("script[data-adt-page-script]")).toHaveLength(1)
  })

  it("reports an abort rather than a failure when a later navigation supersedes it", async () => {
    // A slow first fetch, so the second call aborts it mid-flight. Reporting
    // this as "failed" would send navigateToPage back to the superseded page
    // with a full document load.
    let releaseFirst: () => void = () => {}
    const firstBody = new Promise<string>((resolve) => {
      releaseFirst = () => resolve(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => ({
        ok: true,
        text: async () => {
          const body = await firstBody
          if (init?.signal?.aborted) return body
          return body
        },
      }) as unknown as Response),
    )

    const first = swapToPage("http://localhost/book/pg002_sec001.html")
    const second = swapToPage("http://localhost/book/pg003_sec001.html")
    releaseFirst()

    expect(await first).toBe("aborted")
    expect(await second).toBe("ok")
  })

  // `adt:page-changed` is a published contract, not an internal detail: the
  // generated SCORM adapter re-reports `cmi.core.lesson_location` from it, and
  // Studio's preview re-reads the current page from it (an iframe `load` event
  // no longer fires once navigation happens in place).
  it("announces the new section id so out-of-runtime consumers can follow along", async () => {
    const seen: Array<string | null> = []
    const onPageChanged = (event: Event) => {
      seen.push((event as CustomEvent<{ sectionId: string | null }>).detail.sectionId)
    }
    document.addEventListener("adt:page-changed", onPageChanged)

    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))
    await swapToPage("http://localhost/book/pg002_sec001.html")

    document.removeEventListener("adt:page-changed", onPageChanged)
    expect(seen).toEqual(["pg002_sec001"])
  })

  it("lands at the offset it was asked to restore instead of the top", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))

    await swapToPage("http://localhost/book/pg002_sec001.html", { scrollY: 240 })

    expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "instant" })
    scrollTo.mockRestore()
  })

  it("records the departing scroll offset on the history entry being left", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {})
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => {})
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    Object.defineProperty(window, "scrollY", { configurable: true, value: 240 })
    mockFetchOnce(pageHtml({ sectionId: "pg002_sec001", title: "Page two" }))

    await swapToPage("http://localhost/book/pg002_sec001.html", { pushUrl: true })

    expect(replaceState).toHaveBeenCalledWith(expect.objectContaining({ adtScrollY: 240 }), "")
    expect(pushState).toHaveBeenCalledWith(
      { adtSoftNav: true },
      "",
      "http://localhost/book/pg002_sec001.html",
    )
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" })
    replaceState.mockRestore()
    pushState.mockRestore()
    scrollTo.mockRestore()
  })

  it("does not announce a page change when the swap fails", async () => {
    const seen: string[] = []
    const onPageChanged = () => seen.push("fired")
    document.addEventListener("adt:page-changed", onPageChanged)

    mockFetchOnce("", false)
    await swapToPage("http://localhost/book/missing.html")

    document.removeEventListener("adt:page-changed", onPageChanged)
    expect(seen).toEqual([])
  })

  it("reports failure without touching the DOM when the response is not ok", async () => {
    mockFetchOnce("", false)

    expect(await swapToPage("http://localhost/book/missing.html")).toBe("failed")
    expect(
      document.querySelector('meta[name="title-id"]')?.getAttribute("content"),
    ).toBe("pg001_sec001")
    expect(initializePageContent).not.toHaveBeenCalled()
  })

  it("reports failure when the response is not a book page", async () => {
    mockFetchOnce("<!DOCTYPE html><html><body><p>an error page</p></body></html>")

    expect(await swapToPage("http://localhost/book/pg002_sec001.html")).toBe("failed")
    expect(document.getElementById("content")?.textContent).toContain("body of pg001_sec001")
  })
})

describe("subscribeSoftNavHistory", () => {
  it("takes over scroll restoration and re-applies the recorded offset on back/forward", async () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
    mockFetchOnce(pageHtml({ sectionId: "pg001_sec001", title: "Page one" }))

    const unsubscribe = subscribeSoftNavHistory()
    expect(window.history.scrollRestoration).toBe("manual")

    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { adtSoftNav: true, adtScrollY: 240 } }),
    )
    await vi.waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith({ top: 240, behavior: "instant" })
    })
    expect(initializePageContent).toHaveBeenCalledTimes(1)

    unsubscribe()
    scrollTo.mockRestore()
  })
})

describe("prefetchPage", () => {
  it("adds one prefetch hint per page and never for the page already open", () => {
    prefetchPage("pg002_sec001.html")
    prefetchPage("./pg002_sec001.html#glossary=term")
    prefetchPage("pg001_sec001.html")

    const hrefs = Array.from(document.head.querySelectorAll('link[rel="prefetch"]')).map((el) =>
      el.getAttribute("href"),
    )
    expect(hrefs).toEqual(["http://localhost/book/pg002_sec001.html"])
  })

  it("is a no-op where soft navigation is unavailable", () => {
    setLocation("file:///Users/someone/book/pg001_sec001.html")

    prefetchPage("pg009_sec001.html")

    expect(document.head.querySelector('link[rel="prefetch"]')).toBeNull()
  })
})

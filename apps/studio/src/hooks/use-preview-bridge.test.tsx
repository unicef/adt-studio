// @vitest-environment jsdom
import { useImperativeHandle, useRef, type Ref } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import type { PreviewBridgePage } from "@adt/types"
import { usePreviewBridge } from "@/hooks/use-preview-bridge"

afterEach(cleanup)

const PREVIEW_SRC = "http://127.0.0.1:4100/api/books/demo/adt/v-1/"
const PREVIEW_ORIGIN = "http://127.0.0.1:4100"

const PAGE: PreviewBridgePage = {
  sectionId: "pg002_sec001",
  href: "/api/books/demo/adt/v-1/pg002_sec001.html",
  title: "Page two",
  hasImages: true,
  hasActivity: false,
  signLanguageEnabled: false,
}

type Bridge = ReturnType<typeof usePreviewBridge>

/** Renders an iframe wired to the bridge the way PreviewView wires it. */
function Harness({ onPage, bridgeRef }: { onPage: (page: PreviewBridgePage) => void; bridgeRef: Ref<Bridge> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bridge = usePreviewBridge(iframeRef, PREVIEW_SRC, onPage)
  useImperativeHandle(bridgeRef, () => bridge, [bridge])
  return <iframe ref={iframeRef} title="preview" />
}

function renderBridge() {
  const onPage = vi.fn()
  const bridgeRef: { current: Bridge | null } = { current: null }
  const view = render(<Harness onPage={onPage} bridgeRef={bridgeRef} />)
  const frameWindow = view.container.querySelector("iframe")!.contentWindow!
  return { onPage, bridge: () => bridgeRef.current!, frameWindow, ...view }
}

function postToStudio(data: unknown, source: unknown, origin = PREVIEW_ORIGIN): void {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, source: source as Window, origin }))
  })
}

describe("usePreviewBridge", () => {
  it("passes on every page the reader announces", () => {
    const { onPage, frameWindow } = renderBridge()

    postToStudio({ type: "adt-preview/page", page: PAGE }, frameWindow)
    postToStudio({ type: "adt-preview/page", page: { ...PAGE, sectionId: "pg003_sec001" } }, frameWindow)

    expect(onPage).toHaveBeenNthCalledWith(1, PAGE)
    expect(onPage).toHaveBeenNthCalledWith(2, { ...PAGE, sectionId: "pg003_sec001" })
  })

  it("posts an outline only when it would change", () => {
    const { bridge, frameWindow } = renderBridge()
    const postMessage = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => {})
    const outlines = () => postMessage.mock.calls.map(([message]) => (message as { targets: string[] }).targets)

    bridge().highlight(["#figure"], "serious")
    bridge().highlight(["#figure"], "serious")
    bridge().highlight(["#caption"], "minor")
    bridge().highlight([], "unknown")
    bridge().highlight([], "unknown")

    expect(outlines()).toEqual([["#figure"], ["#caption"], [], []])
  })

  it("outlines the same finding again once the reader has dropped it", () => {
    const { bridge, frameWindow } = renderBridge()
    const postMessage = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => {})

    bridge().highlight(["#figure"], "serious")
    postToStudio({ type: "adt-preview/highlight-cleared" }, frameWindow)
    bridge().highlight(["#figure"], "serious")
    postToStudio({ type: "adt-preview/page", page: PAGE }, frameWindow)
    bridge().highlight(["#figure"], "serious")
    postToStudio({ type: "adt-preview/highlight-cleared" }, window)
    bridge().highlight(["#figure"], "serious")

    expect(postMessage).toHaveBeenCalledTimes(3)
  })

  it("ignores messages from other windows or other origins", () => {
    const { onPage, frameWindow } = renderBridge()

    postToStudio({ type: "adt-preview/page", page: PAGE }, window)
    postToStudio({ type: "adt-preview/page", page: PAGE }, frameWindow, "https://evil.example")

    expect(onPage).not.toHaveBeenCalled()
  })

  it("ignores malformed announcements", () => {
    const { onPage, frameWindow } = renderBridge()

    postToStudio({ type: "adt-preview/page", page: { ...PAGE, href: 42 } }, frameWindow)
    postToStudio({ type: "adt-runtime/preview-settings", bookLabel: "demo", settings: {} }, frameWindow)

    expect(onPage).not.toHaveBeenCalled()
  })

  it("posts highlight and navigate requests to the preview's origin only", () => {
    const { bridge, frameWindow } = renderBridge()
    const postMessage = vi.spyOn(frameWindow, "postMessage").mockImplementation(() => {})

    bridge().highlight(["#figure"], "serious")
    bridge().navigate("pg005_sec001.html")

    expect(postMessage).toHaveBeenNthCalledWith(
      1,
      { type: "adt-preview/highlight", targets: ["#figure"], severity: "serious" },
      PREVIEW_ORIGIN,
    )
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      { type: "adt-preview/navigate", href: "pg005_sec001.html" },
      PREVIEW_ORIGIN,
    )
  })

  it("stops listening once unmounted", () => {
    const { onPage, frameWindow, unmount } = renderBridge()
    unmount()
    postToStudio({ type: "adt-preview/page", page: PAGE }, frameWindow)
    expect(onPage).not.toHaveBeenCalled()
  })
})

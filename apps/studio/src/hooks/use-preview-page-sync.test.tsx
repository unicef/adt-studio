// @vitest-environment jsdom
import { useRef } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { usePreviewPageSync } from "@/hooks/use-preview-page-sync"

afterEach(cleanup)

/** Renders an iframe wired exactly as PreviewView wires it. */
function Harness({ sync }: { sync: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onLoad = usePreviewPageSync(iframeRef, sync)
  return <iframe ref={iframeRef} title="preview" onLoad={onLoad} data-testid="frame" />
}

function frameDocument(container: HTMLElement): Document {
  const frame = container.querySelector("iframe") as HTMLIFrameElement
  // jsdom gives a same-origin about:blank document; that is all this needs.
  return frame.contentDocument as Document
}

describe("usePreviewPageSync", () => {
  it("syncs on the initial iframe load", () => {
    const sync = vi.fn()
    const { container } = render(<Harness sync={sync} />)
    const frame = container.querySelector("iframe")!
    frame.dispatchEvent(new Event("load"))
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it("syncs again on every in-place page turn", () => {
    const sync = vi.fn()
    const { container } = render(<Harness sync={sync} />)
    const frame = container.querySelector("iframe")!
    frame.dispatchEvent(new Event("load"))
    sync.mockClear()

    const doc = frameDocument(container)
    doc.dispatchEvent(new CustomEvent("adt:page-changed", { detail: { sectionId: "pg002" } }))
    doc.dispatchEvent(new CustomEvent("adt:page-changed", { detail: { sectionId: "pg003" } }))

    // Without this subscription the count would stay at 0 — the exact defect
    // that left the accessibility card and reviewer records on the entry page.
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it("does not double-subscribe when the iframe loads again", () => {
    const sync = vi.fn()
    const { container } = render(<Harness sync={sync} />)
    const frame = container.querySelector("iframe")!
    frame.dispatchEvent(new Event("load"))
    frame.dispatchEvent(new Event("load"))
    sync.mockClear()

    frameDocument(container).dispatchEvent(new CustomEvent("adt:page-changed", { detail: {} }))
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it("stops listening once unmounted", () => {
    const sync = vi.fn()
    const { container, unmount } = render(<Harness sync={sync} />)
    const frame = container.querySelector("iframe")!
    frame.dispatchEvent(new Event("load"))
    const doc = frameDocument(container)
    sync.mockClear()

    unmount()
    doc.dispatchEvent(new CustomEvent("adt:page-changed", { detail: {} }))
    expect(sync).not.toHaveBeenCalled()
  })
})

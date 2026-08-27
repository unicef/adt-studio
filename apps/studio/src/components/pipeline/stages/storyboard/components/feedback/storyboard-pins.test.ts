// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import type { PublishComment } from "@/api/client"
import { buildThreads } from "@/components/publication-feedback/lib/threads"
import { placePins, sectionIdFor } from "./storyboard-pins"

function comment(overrides: Partial<PublishComment> = {}): PublishComment {
  return {
    id: "c1",
    token: "abcdefghijklmnopqrstuvwxyz012345",
    version: 3,
    page_section_id: "pg001_sec001",
    parent_id: null,
    session_id: "s1",
    author_name: "Ana",
    author_color: "#0091ff",
    body: "the table overflows",
    anchor: { selector: '#content [data-id="pg001_gp001_tx001"]', xOffsetPct: 50, yOffsetPct: 50 },
    resolved_at: null,
    edited_at: null,
    deleted_at: null,
    created_at: "2026-08-04T10:00:00.000Z",
    ...overrides,
  }
}

/** A stand-in for the storyboard preview: the same `#content` root and `data-id` hooks the
 *  packaging pipeline stamps, which is exactly why the published book's anchors resolve here. */
function previewDoc(): Document {
  const doc = document.implementation.createHTMLDocument("preview")
  doc.body.innerHTML = `
    <main class="w-full">
      <div id="content">
        <section data-section-id="pg001_sec001">
          <p data-id="pg001_gp001_tx001">Some text</p>
        </section>
      </div>
    </main>`
  const target = doc.querySelector('[data-id="pg001_gp001_tx001"]') as HTMLElement
  target.getBoundingClientRect = () =>
    ({ left: 20, top: 40, width: 200, height: 50, right: 220, bottom: 90, x: 20, y: 40 }) as DOMRect
  return doc
}

const IFRAME = { left: 100, top: 60, width: 800, height: 600 } as DOMRect
const CONTAINER = { left: 80, top: 50, width: 900, height: 700 } as DOMRect

describe("placePins", () => {
  /** The preview is CSS-scaled to fit its column, so an unscaled offset drifts further from its
   *  element the further down the page it is — and eventually falls outside the frame. */
  it("scales anchor offsets by the preview's own zoom", () => {
    const doc = previewDoc()
    Object.defineProperty(doc.documentElement, "clientWidth", { value: 1600, configurable: true })
    const threads = buildThreads([comment()])
    const { placed } = placePins(threads, {
      doc,
      /** Half the layout width: the preview is drawn at 50%. */
      iframeRect: { ...IFRAME, width: 800 } as DOMRect,
      containerRect: CONTAINER,
      liveVersion: 3,
    })
    /** 20 + (20 + 100) × 0.5 = 80; 10 + (40 + 25) × 0.5 = 42.5. */
    expect(placed[0]?.x).toBeCloseTo(80)
    expect(placed[0]?.y).toBeCloseTo(42.5)
  })

  it("puts a pin where its anchor resolves, in the container's coordinates", () => {
    const threads = buildThreads([comment()])
    const { placed, unplaced } = placePins(threads, {
      doc: previewDoc(),
      iframeRect: IFRAME,
      containerRect: CONTAINER,
      liveVersion: 3,
    })

    expect(unplaced).toHaveLength(0)
    expect(placed).toHaveLength(1)
    /** 20 (iframe→container) + 20 + 50% of 200 = 140; 10 + 40 + 50% of 50 = 75. */
    expect(placed[0]).toMatchObject({ x: 140, y: 75, number: 1, stale: false })
  })

  /**
   * The invariant that matters most. A comment whose element has been edited away is precisely
   * the one an author needs to see, and dropping it would also make the count in the toolbar
   * disagree with what is on the page.
   */
  it("returns pins it cannot place instead of losing them", () => {
    const threads = buildThreads([
      comment({ id: "gone", anchor: { selector: '#content [data-id="deleted"]', xOffsetPct: 10, yOffsetPct: 10 } }),
      comment({ id: "whole-page", anchor: null }),
    ])
    const { placed, unplaced } = placePins(threads, {
      doc: previewDoc(),
      iframeRect: IFRAME,
      containerRect: CONTAINER,
      liveVersion: 3,
    })

    expect(placed).toHaveLength(0)
    expect(unplaced.map((pin) => [pin.thread.root.id, pin.reason])).toEqual([
      ["gone", "unresolvable"],
      ["whole-page", "page-level"],
    ])
  })

  it("marks a comment written against an older published version", () => {
    const threads = buildThreads([comment({ version: 2 })])
    const { placed } = placePins(threads, {
      doc: previewDoc(),
      iframeRect: IFRAME,
      containerRect: CONTAINER,
      liveVersion: 7,
    })
    expect(placed[0]?.stale).toBe(true)
  })

  /** Nothing is drawn before the iframe exists, and nothing throws either. */
  it("survives being asked before the preview has mounted", () => {
    const threads = buildThreads([comment()])
    const { placed, unplaced } = placePins(threads, {
      doc: null,
      iframeRect: null,
      containerRect: null,
      liveVersion: null,
    })
    expect(placed).toHaveLength(0)
    expect(unplaced).toHaveLength(1)
  })
})

describe("sectionIdFor", () => {
  it("builds the id the packaging pipeline stamps and comments are keyed by", () => {
    expect(sectionIdFor("pg001", 0)).toBe("pg001_sec001")
    expect(sectionIdFor("pg012", 2)).toBe("pg012_sec003")
  })
})

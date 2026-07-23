import { describe, it, expect } from "vitest"
import type { Storage } from "@adt/storage"
import {
  deriveQuizPalette,
  resolveQuizPalette,
  colorCandidatesFromHtml,
  DEFAULT_QUIZ_PALETTE,
} from "../quiz-palette.js"

const fakeStorage = (
  pageIds: string[],
  nodes: Record<string, Record<string, unknown>>,
) =>
  ({
    getPages: () => pageIds.map((pageId) => ({ pageId, pageNumber: 1, text: "" })),
    getLatestNodeData: (node: string, itemId: string) => {
      const d = nodes[node]?.[itemId]
      return d !== undefined ? { data: d, version: 1 } : null
    },
  }) as unknown as Storage

describe("deriveQuizPalette", () => {
  it("falls back to defaults when there are no usable colors", () => {
    expect(deriveQuizPalette([])).toEqual(DEFAULT_QUIZ_PALETTE)
    expect(deriveQuizPalette([{ backgroundColor: "transparent", textColor: "" }])).toEqual(
      DEFAULT_QUIZ_PALETTE,
    )
  })

  it("derives surface/ink from dominant colors and accent from the dominant colorful color", () => {
    const p = deriveQuizPalette([
      { backgroundColor: "#FFFFFF", textColor: "#111111" },
      { backgroundColor: "#FFFFFF", textColor: "#111111" },
      { backgroundColor: "#0A8F5A", textColor: "#FFFFFF" }, // green callout
      { backgroundColor: "#0A8F5A", textColor: "#FFFFFF" },
    ])
    expect(p.surface).toBe("#FFFFFF")
    expect(p.ink).toBe("#111111")
    expect(p.accent).toBe("#0A8F5A")
    expect(p.accentSoft).toBe("rgba(10, 143, 90, 0.16)")
    // Callout tints derived from the (dark green) accent.
    expect(p.headerText).toBe("#FFFFFF") // white on dark green
    expect(p.body).toMatch(/^#[0-9A-F]{6}$/) // pale body tint
    expect(p.body).not.toBe(p.accent)
    expect(p.optionFill).not.toBe(p.body)
  })

  it("normalizes short hex and ignores non-hex values", () => {
    const p = deriveQuizPalette([
      { backgroundColor: "#fff", textColor: "#000" },
      { backgroundColor: "cornflowerblue" },
    ])
    expect(p.surface).toBe("#FFFFFF")
    expect(p.ink).toBe("#000000")
  })
})

describe("colorCandidatesFromHtml", () => {
  it("reads the brand color from Tailwind color classes (where it actually lives)", () => {
    // Mirrors the weather book: emerald is dominant, neutrals excluded.
    const html =
      '<h1 class="bg-emerald-700 text-white">Q</h1><p class="text-emerald-700">a</p>' +
      '<div class="bg-white text-gray-900 border-emerald-700">b</div>'
    const candidates = colorCandidatesFromHtml(html)
    // emerald-700 → #047857, white/gray-900 excluded (neutral / not a color family).
    expect(candidates).toEqual(["#047857", "#047857", "#047857"])
  })

  it("also reads arbitrary hex and rgb(), filtering out neutrals", () => {
    const html = '<div style="color: #0A8F5A; background: rgb(255,255,255)"></div><span class="text-[#111111]">x</span>'
    expect(colorCandidatesFromHtml(html)).toEqual(["#0A8F5A"])
  })
})

describe("resolveQuizPalette", () => {
  it("returns null when the book has no accent color (keep the clean white quiz)", () => {
    const storage = fakeStorage(["pg001"], {
      "page-sectioning": { pg001: { sections: [{ backgroundColor: "#ffffff", textColor: "#000000" }] } },
      "web-rendering": { pg001: { sections: [{ html: '<p class="bg-white text-gray-900">plain</p>' }] } },
    })
    expect(resolveQuizPalette(storage)).toBeNull()
  })

  it("derives the accent from the rendered pages when one exists", () => {
    const storage = fakeStorage(["pg001"], {
      "page-sectioning": { pg001: { sections: [{ backgroundColor: "#ffffff", textColor: "#000000" }] } },
      "web-rendering": { pg001: { sections: [{ html: '<h1 class="bg-emerald-700 text-emerald-700">Q</h1>' }] } },
    })
    const p = resolveQuizPalette(storage)
    expect(p).not.toBeNull()
    expect(p!.accent).toBe("#047857")
    expect(p!.surface).toBe("#FFFFFF")
  })
})

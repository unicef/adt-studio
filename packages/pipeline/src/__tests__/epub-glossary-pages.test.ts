import { describe, it, expect } from "vitest"
import { JSDOM } from "jsdom"
import {
  buildGlossaryPages,
  estimateCardHeightRem,
  glossaryPageHrefPlaceholder,
  packEntriesForFixedViewport,
  planGlossaryBoundaries,
  resolveGlossaryPageHrefs,
  windowIndexForPage,
  type GlossaryPageEntry,
} from "../epub-glossary-pages.js"
import type { GlossaryEntry } from "../epub-glossary.js"

/**
 * Parse a string as strict XML. Returns the `<parsererror>` text if the
 * document is not well-formed, else null — a glossary page that fails this
 * would be rejected by strict EPUB readers.
 */
function xmlParseError(src: string): string | null {
  const win = new JSDOM("").window
  const parsed = new win.DOMParser().parseFromString(src, "application/xml")
  const err = parsed.querySelector("parsererror")
  return err ? err.textContent : null
}

function entry(overrides: Partial<GlossaryEntry> & { id: string; word: string }): GlossaryEntry {
  return {
    sourceId: overrides.id.replace("gl_", "gl0").slice(0, 5),
    definition: `${overrides.word} definition`,
    variations: [],
    emoji: "",
    ...overrides,
  }
}

function pageEntry(e: GlossaryEntry, pages: number[] = [3]): GlossaryPageEntry {
  return {
    entry: e,
    backlinks: pages.map((n) => ({
      href: `pg${String(n).padStart(3, "0")}_sec001.xhtml#w${n}`,
      label: `Page ${n}`,
    })),
  }
}

// ---------------------------------------------------------------------------
// Placement planning
// ---------------------------------------------------------------------------

describe("planGlossaryBoundaries", () => {
  const pages = [
    { page_number: 1 }, // 0 (cover / index)
    { page_number: 2 }, // 1
    { page_number: 2 }, // 2 — second section of page 2
    { page_number: undefined }, // 3 — quiz after page 2
    { page_number: 3 }, // 4
    { page_number: 4 }, // 5
  ]

  it("resolves 'end' to the last page index", () => {
    expect(planGlossaryBoundaries(pages, ["end"])).toEqual([5])
  })

  it("defaults to a single end placement when none are given", () => {
    expect(planGlossaryBoundaries(pages, [])).toEqual([5])
  })

  it("lands after the last section of the physical page, carrying trailing quiz pages", () => {
    // Page 2 has two sections (idx 1,2) followed by an unnumbered quiz (idx 3):
    // the glossary page goes after the quiz.
    expect(planGlossaryBoundaries(pages, [2])).toEqual([3])
  })

  it("sorts and dedupes placements", () => {
    expect(planGlossaryBoundaries(pages, ["end", 2, 3, "end"])).toEqual([3, 4, 5])
  })

  it("clamps placements past the last numbered page to the end", () => {
    expect(planGlossaryBoundaries(pages, [99])).toEqual([5])
  })

  it("returns empty for an empty book", () => {
    expect(planGlossaryBoundaries([], ["end"])).toEqual([])
  })
})

describe("windowIndexForPage", () => {
  it("assigns each page to the first boundary at or after it", () => {
    const boundaries = [2, 5]
    expect(windowIndexForPage(boundaries, 0)).toBe(0)
    expect(windowIndexForPage(boundaries, 2)).toBe(0)
    expect(windowIndexForPage(boundaries, 3)).toBe(1)
    expect(windowIndexForPage(boundaries, 5)).toBe(1)
  })

  it("folds pages after the last boundary into the last window", () => {
    expect(windowIndexForPage([2, 5], 9)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Page building
// ---------------------------------------------------------------------------

describe("buildGlossaryPages", () => {
  const volcano = entry({ id: "gl_001", sourceId: "gl001", word: "volcano", emoji: "🌋" })
  const lava = entry({ id: "gl_002", sourceId: "gl002", word: "lava" })
  const ash = entry({ id: "gl_003", sourceId: "gl003", word: "ash" })

  it("emits one reflowable file per non-empty window and maps entry hrefs", () => {
    const result = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [[pageEntry(volcano), pageEntry(lava)], [], [pageEntry(ash, [9])]],
    })

    expect(result.files.map((f) => f.filename)).toEqual(["glp001.xhtml", "glp002.xhtml"])
    expect(result.files.map((f) => f.windowIndex)).toEqual([0, 2])
    expect(result.files.every((f) => f.isWindowStart)).toBe(true)
    expect(result.hrefByWindowEntry.get("0:gl_001")).toBe("glp001.xhtml#gl_001")
    expect(result.hrefByWindowEntry.get("2:gl_003")).toBe("glp002.xhtml#gl_003")
    // The empty window produced no file and no hrefs.
    expect([...result.hrefByWindowEntry.keys()].some((k) => k.startsWith("1:"))).toBe(false)
  })

  it("produces well-formed XHTML with doc-glossary semantics, sorted entries, and backlinks", () => {
    const { files } = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [[pageEntry(volcano, [3, 7]), pageEntry(lava), pageEntry(ash)]],
    })
    const xhtml = files[0].xhtml

    expect(xmlParseError(xhtml)).toBeNull()
    expect(xhtml).toContain(`epub:type="glossary"`)
    expect(xhtml).toContain(`role="doc-glossary"`)
    expect(xhtml).toContain(`<h1 class="glp-heading">Glossary</h1>`)
    // Alphabetical: ash before lava before volcano.
    const order = ["gl_003", "gl_002", "gl_001"].map((id) => xhtml.indexOf(`id="${id}"`))
    expect(order[0]).toBeGreaterThan(-1)
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[2])
    // Word, emoji, definition, backlinks.
    expect(xhtml).toContain(`<dfn>volcano</dfn>`)
    expect(xhtml).toContain(`🌋`)
    expect(xhtml).toContain(`volcano definition`)
    expect(xhtml).toContain(`epub:type="backlink"`)
    expect(xhtml).toContain(`pg003_sec001.xhtml#w3`)
    expect(xhtml).toContain(`Page 7`)
  })

  it("floats the picture right of the term and hides the video behind a hands toggle", () => {
    const pictured = entry({
      id: "gl_001",
      sourceId: "gl001",
      word: "volcano",
      image: "images/img_042.png",
    })
    const { files } = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [[pageEntry(pictured)]],
      videoHrefBySourceId: new Map([["gl001", "content/video/glossary/sl_gl001.mp4"]]),
      signLanguageLabel: "Lengua de señas",
    })
    const xhtml = files[0].xhtml
    expect(xmlParseError(xhtml)).toBeNull()
    // The picture is emitted at the start of the dt so the float anchors at
    // the headword line; it scales inside a fixed chip (CSS), not the card.
    expect(xhtml).toContain(
      `<dt class="glp-term"><img class="glp-image" src="images/img_042.png" alt=""/><dfn>volcano</dfn>`,
    )
    // Sign-language video sits behind a <details> disclosure whose summary is
    // the hands button (FontAwesome signing-hands glyph), with the localised
    // label. The FA stylesheet ships with every bundle.
    expect(xhtml).toContain(`<details class="glp-sl">`)
    expect(xhtml).toContain(`<i class="fa fa-sign-language glp-sl-hands" aria-hidden="true"></i>`)
    expect(xhtml).toContain(`assets/libs/fontawesome/css/all.min.css`)
    expect(xhtml).toContain(`Lengua de señas</summary>`)
    // `controls` is only the no-script fallback; the page script removes it
    // and drives play/stop from the toggle.
    expect(xhtml).toContain(`<video class="glp-video" controls="controls"`)
    expect(xhtml).toContain(`src="content/video/glossary/sl_gl001.mp4"`)
    expect(xhtml).toContain(`removeAttribute("controls")`)
    expect(files[0].hasScript).toBe(true)
  })

  it("omits the toggle and the script for text-only entries", () => {
    const { files } = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [[pageEntry(lava)]],
    })
    expect(files[0].xhtml).not.toContain(`<details`)
    expect(files[0].xhtml).not.toContain(`<script>`)
    expect(files[0].hasScript).toBe(false)
  })

  it("escapes markup-significant characters in words and definitions", () => {
    const tricky = entry({
      id: "gl_001",
      sourceId: "gl001",
      word: `<b>&"bold"`,
    })
    tricky.definition = `less < more & "quotes"`
    const { files } = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [[pageEntry(tricky)]],
    })
    expect(xmlParseError(files[0].xhtml)).toBeNull()
    expect(files[0].xhtml).toContain("&lt;b&gt;&amp;&quot;bold&quot;")
  })

  it("chunks fixed-layout windows by predicted card height, not a flat count", () => {
    // Every entry carries a sign-language video, budgeted with its toggle
    // OPEN so expanding it can never cross the page boundary — only one such
    // card fits a 800×600 page.
    const videos = new Map([
      ["gl001", "content/video/glossary/sl_gl001.mp4"],
      ["gl002", "content/video/glossary/sl_gl002.mp4"],
      ["gl003", "content/video/glossary/sl_gl003.mp4"],
    ])
    const entries = [volcano, lava, ash].map((e) => pageEntry(e))
    const result = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [entries],
      fixedViewport: { width: 800, height: 600 },
      videoHrefBySourceId: videos,
    })

    expect(result.files.map((f) => f.filename)).toEqual([
      "glp001.xhtml",
      "glp002.xhtml",
      "glp003.xhtml",
    ])
    expect(result.files.map((f) => f.isWindowStart)).toEqual([true, false, false])
    // Alphabetical order: ash, lava, volcano — one per page.
    expect(result.hrefByWindowEntry.get("0:gl_003")).toBe("glp001.xhtml#gl_003")
    expect(result.hrefByWindowEntry.get("0:gl_002")).toBe("glp002.xhtml#gl_002")
    expect(result.hrefByWindowEntry.get("0:gl_001")).toBe("glp003.xhtml#gl_001")
    // Every chunk carries the book viewport.
    for (const f of result.files) {
      expect(f.xhtml).toContain(`content="width=800, height=600"`)
      expect(xmlParseError(f.xhtml)).toBeNull()
    }
  })

  it("keeps text-only cards together where a flat media count would split them", () => {
    const entries = [volcano, lava, ash].map((e) => pageEntry(e))
    const result = buildGlossaryPages({
      language: "en",
      heading: "Glossary",
      windows: [entries],
      fixedViewport: { width: 800, height: 600 },
    })
    // No media rows → all three fit one page.
    expect(result.files.map((f) => f.filename)).toEqual(["glp001.xhtml"])
  })
})

// ---------------------------------------------------------------------------
// Fixed-layout packing
// ---------------------------------------------------------------------------

describe("packEntriesForFixedViewport", () => {
  const words = ["ash", "basalt", "crater", "dome", "eruption", "fissure", "geyser", "lahar"]
  const manyEntries = words.map((word, i) =>
    pageEntry(entry({ id: `gl_${String(i + 1).padStart(3, "0")}`, sourceId: `gl${String(i + 1).padStart(3, "0")}`, word })),
  )

  it("preserves order and drops nothing", () => {
    const chunks = packEntriesForFixedViewport(manyEntries, { width: 800, height: 600 })
    expect(chunks.flat()).toEqual(manyEntries)
    expect(chunks.every((c) => c.length > 0)).toBe(true)
  })

  it("never packs a page beyond one card when cards are huge", () => {
    // A tiny viewport can't fit two media cards — every card gets its own
    // page instead of spilling over the boundary.
    const videos = new Map(manyEntries.map((e) => [e.entry.sourceId, "v.mp4"]))
    const chunks = packEntriesForFixedViewport(
      manyEntries.slice(0, 3),
      { width: 400, height: 300 },
      videos,
    )
    expect(chunks.map((c) => c.length)).toEqual([1, 1, 1])
  })

  it("media increases a card's predicted height", () => {
    const textOnly = estimateCardHeightRem(manyEntries[0], 50, false)
    // Video budgeted open: button row + 9rem video.
    const withVideo = estimateCardHeightRem(manyEntries[0], 50, true)
    // Floated picture sets a floor (chip height + paddings).
    const withImage = estimateCardHeightRem(
      { ...manyEntries[0], entry: { ...manyEntries[0].entry, image: "images/x.png" } },
      50,
      false,
    )
    expect(withVideo).toBeGreaterThan(textOnly + 9)
    expect(withImage).toBeGreaterThan(textOnly)
    expect(withVideo).toBeGreaterThan(withImage)
  })

  it("long definitions consume more of the page budget", () => {
    const short = estimateCardHeightRem(manyEntries[0], 50, false)
    const long = estimateCardHeightRem(
      {
        ...manyEntries[0],
        entry: { ...manyEntries[0].entry, definition: "x".repeat(600) },
      },
      50,
      false,
    )
    expect(long).toBeGreaterThan(short + 5)
  })
})

// ---------------------------------------------------------------------------
// Placeholder resolution
// ---------------------------------------------------------------------------

describe("resolveGlossaryPageHrefs", () => {
  it("rewrites placeholders to their final file#fragment target", () => {
    const placeholder = glossaryPageHrefPlaceholder(0, "gl_001")
    const xhtml = `<a epub:type="glossref" href="${placeholder}">volcano</a>`
    const resolved = resolveGlossaryPageHrefs(
      xhtml,
      new Map([["0:gl_001", "glp001.xhtml#gl_001"]]),
    )
    expect(resolved).toBe(`<a epub:type="glossref" href="glp001.xhtml#gl_001">volcano</a>`)
  })

  it("leaves unknown placeholders untouched", () => {
    const xhtml = `<a href="${glossaryPageHrefPlaceholder(3, "gl_009")}">x</a>`
    expect(resolveGlossaryPageHrefs(xhtml, new Map())).toBe(xhtml)
  })
})

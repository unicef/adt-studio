import { describe, it, expect } from "vitest"
import { JSDOM } from "jsdom"
import {
  buildGlossaryDocument,
  loadGlossaryEntries,
  wrapGlossaryTerms,
  type GlossaryBacklink,
} from "../epub-glossary.js"

// Minimal XHTML scaffold so JSDOM can parse with contentType:
// application/xhtml+xml. Keep this tight — we only care about the body
// payload in the assertions.
function xhtml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta charset="UTF-8"/><title>t</title></head>
<body>
${body}
</body>
</html>`
}

/**
 * Parse a string as strict XML. Returns the `<parsererror>` text if the
 * document is not well-formed, else null — mirroring how a strict EPUB
 * reader (e.g. BookFusion) rejects a malformed page.
 */
function xmlParseError(src: string): string | null {
  const win = new JSDOM("").window
  const parsed = new win.DOMParser().parseFromString(src, "application/xml")
  const err = parsed.querySelector("parsererror")
  return err ? err.textContent : null
}

/** Build the backlinksByEntry map the document builder expects. */
function backlinks(
  pairs: Record<string, GlossaryBacklink[]>,
): Map<string, GlossaryBacklink[]> {
  return new Map(Object.entries(pairs))
}

const VOLCANO_JSON = {
  volcano: {
    word: "volcano",
    definition: "A mountain that erupts molten rock.",
    variations: ["volcanoes"],
    emoji: "🌋",
  },
  lava: {
    word: "lava",
    definition: "Molten rock that has reached the surface.",
    variations: [],
    emoji: "",
  },
  "data set": {
    word: "data set",
    definition: "A collection of related data.",
    variations: [],
    emoji: "",
  },
  data: {
    word: "data",
    definition: "Facts and statistics.",
    variations: [],
    emoji: "",
  },
}

describe("loadGlossaryEntries", () => {
  it("assigns stable, padded ids in declaration order", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    expect(entries.map((e) => e.id)).toEqual([
      "gl_001",
      "gl_002",
      "gl_003",
      "gl_004",
    ])
    expect(entries[0].word).toBe("volcano")
  })

  it("returns [] for undefined / empty input", () => {
    expect(loadGlossaryEntries(undefined)).toEqual([])
    expect(loadGlossaryEntries({})).toEqual([])
  })
})

describe("wrapGlossaryTerms", () => {
  it("wraps the first matching term in <a epub:type=\"glossref\">", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<p data-id="p1"><span id="p1_w001">A</span> <span id="p1_w002">volcano</span> <span id="p1_w003">erupts</span>.</p>`,
    )
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences).toEqual([{ entryId: "gl_001", fragment: "p1_w002" }])
    expect(out).toContain(`epub:type="glossref"`)
    expect(out).toContain(`href="glossary.xhtml#gl_001"`)
    // Styling hook for the dotted-underline affordance (CSS ships separately).
    expect(out).toContain(`class="glossref"`)
    // The word-span stays untouched inside the anchor so SMIL fragment refs
    // (page.xhtml#p1_w002) still resolve.
    expect(out).toMatch(
      /<a[^>]*epub:type="glossref"[^>]*><span id="p1_w002">volcano<\/span><\/a>/,
    )
  })

  it("reports the inner word-span id as the backlink fragment", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<p data-id="p1"><span id="p1_w001">A</span> <span id="p1_w002">volcano</span>.</p>`,
    )
    const { occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences[0].fragment).toBe("p1_w002")
  })

  it("stamps the anchor with a fallback id when no inner id exists", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(`<p data-id="p1">a volcano erupts.</p>`)
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences[0].fragment).toBe("glref_gl_001")
    expect(out).toContain(`id="glref_gl_001"`)
  })

  it("matches variations and resolves them to the parent entry", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<p data-id="p1"><span id="p1_w001">Two</span> <span id="p1_w002">volcanoes</span>.</p>`,
    )
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences[0].entryId).toBe("gl_001")
    expect(out).toContain(`href="glossary.xhtml#gl_001"`)
    expect(out).toContain(`<span id="p1_w002">volcanoes</span>`)
  })

  it("emits only first occurrence per page across paragraphs", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<p data-id="p1"><span id="p1_w001">A</span> <span id="p1_w002">volcano</span>.</p>
       <p data-id="p2"><span id="p2_w001">Another</span> <span id="p2_w002">volcano</span>.</p>`,
    )
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences.filter((o) => o.entryId === "gl_001")).toHaveLength(1)
    expect((out.match(/href="glossary\.xhtml#gl_001"/g) ?? []).length).toBe(1)
  })

  it("prefers the longer multi-word term over a substring match", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<p data-id="p1"><span id="p1_w001">The</span> <span id="p1_w002">data</span> <span id="p1_w003">set</span>.</p>`,
    )
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    const ids = occurrences.map((o) => o.entryId)
    expect(ids).toContain("gl_003") // "data set"
    expect(ids).not.toContain("gl_004") // "data"
    expect(out).toContain(`href="glossary.xhtml#gl_003"`)
    expect(out).not.toContain(`href="glossary.xhtml#gl_004"`)
    expect(out).toMatch(
      /<a[^>]*gl_003[^>]*><span id="p1_w002">data<\/span> <span id="p1_w003">set<\/span><\/a>/,
    )
  })

  it("skips headings and activity items", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(
      `<h1 data-id="h1"><span id="h1_w001">volcano</span></h1>
       <div class="activity-text" data-id="a1"><span id="a1_w001">volcano</span></div>
       <p data-id="p1"><span id="p1_w001">volcano</span></p>`,
    )
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences).toHaveLength(1)
    expect(out).toMatch(/<h1[^>]*><span id="h1_w001">volcano<\/span><\/h1>/)
    expect(out).toMatch(
      /<div class="activity-text"[^>]*><span id="a1_w001">volcano<\/span><\/div>/,
    )
    expect(out).toMatch(
      /<p[^>]*><a[^>]*gl_001[^>]*><span id="p1_w001">volcano<\/span><\/a><\/p>/,
    )
  })

  it("returns input untouched when there are no entries", () => {
    const input = xhtml(`<p data-id="p1"><span id="p1_w001">volcano</span></p>`)
    const { xhtml: out, occurrences } = wrapGlossaryTerms(input, [])
    expect(out).toBe(input)
    expect(occurrences).toHaveLength(0)
  })

  it("declares xmlns:epub on <html> only when a glossref is emitted", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const matching = xhtml(`<p data-id="p1"><span id="p1_w001">volcano</span></p>`)
    const empty = xhtml(`<p data-id="p1"><span id="p1_w001">unrelated</span></p>`)
    expect(wrapGlossaryTerms(matching, entries).xhtml).toContain(
      `xmlns:epub="http://www.idpf.org/2007/ops"`,
    )
    expect(wrapGlossaryTerms(empty, entries).xhtml).not.toContain(`xmlns:epub=`)
  })

  it("respects \\b — does not match a term inside a longer word", () => {
    const entries = loadGlossaryEntries({
      cat: { word: "cat", definition: "feline", variations: [], emoji: "" },
    })
    const input = xhtml(`<p data-id="p1"><span id="p1_w001">concatenate</span></p>`)
    const { occurrences } = wrapGlossaryTerms(input, entries)
    expect(occurrences).toHaveLength(0)
  })

  it("emits a single well-formed prologue (no duplicate DOCTYPE)", () => {
    // Regression: JSDOM serialize() emits the DOCTYPE but not the XML
    // declaration. A naive re-attach stacked a second <!DOCTYPE>, which is a
    // fatal XML parse error and broke loading in strict EPUB readers.
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(`<p data-id="p1"><span id="p1_w001">volcano</span></p>`)
    const { xhtml: out } = wrapGlossaryTerms(input, entries)
    expect(out.match(/<!DOCTYPE/gi)?.length).toBe(1)
    expect(out.match(/<\?xml/gi)?.length).toBe(1)
    expect(out.indexOf("<?xml")).toBe(0)
    expect(xmlParseError(out)).toBeNull()
  })

  it("stays well-formed when no term matches (round-trip prologue)", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const input = xhtml(`<p data-id="p1"><span id="p1_w001">unrelated</span></p>`)
    const { xhtml: out } = wrapGlossaryTerms(input, entries)
    expect(out.match(/<!DOCTYPE/gi)?.length).toBe(1)
    expect(xmlParseError(out)).toBeNull()
  })
})

describe("buildGlossaryDocument", () => {
  it("emits a doc-glossary dl with one dt/dd per referenced entry", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const xml = buildGlossaryDocument({
      language: "en",
      heading: "Glossary",
      entries,
      backlinksByEntry: backlinks({
        gl_001: [{ href: "pg002_sec001.xhtml#pg002_p3_w006", label: "Page 3" }],
        gl_002: [],
      }),
    })
    expect(xml).toContain(`<title>Glossary</title>`)
    expect(xml).toContain(`xmlns:epub="http://www.idpf.org/2007/ops"`)
    expect(xml).toContain(`epub:type="glossary"`)
    expect(xml).toContain(`role="doc-glossary"`)
    expect(xml).toContain(`<dt id="gl_001"><dfn>volcano</dfn></dt>`)
    expect(xml).toContain(`<dt id="gl_002"><dfn>lava</dfn></dt>`)
    expect(xml).not.toContain(`id="gl_003"`)
    // Backlink nav with epub:type="backlink" so the reader extracts "Used in".
    expect(xml).toContain(
      `<a epub:type="backlink" href="pg002_sec001.xhtml#pg002_p3_w006">Page 3</a>`,
    )
    // Alphabetised: "lava" before "volcano" regardless of declaration order.
    expect(xml.indexOf(">lava<")).toBeLessThan(xml.indexOf(">volcano<"))
  })

  it("is parseable by the reader's glossary contract (dl/dt[id]/dfn/dd)", () => {
    // Mirror app/services/glossary-parser.ts in the web-reader: find a
    // glossary container, then dt(id)+dfn / dd pairs inside its <dl>.
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const xml = buildGlossaryDocument({
      language: "en",
      heading: "Glossary",
      entries,
      backlinksByEntry: backlinks({
        gl_001: [{ href: "pg002_sec001.xhtml#x", label: "Page 3" }],
      }),
    })
    const doc = new (new JSDOM("").window.DOMParser)().parseFromString(
      xml,
      "application/xml",
    )
    const container = doc.querySelector('[role="doc-glossary"]')
    expect(container).not.toBeNull()
    const dt = container!.querySelector("dl > dt")
    expect(dt?.getAttribute("id")).toBe("gl_001")
    expect(dt?.querySelector("dfn")?.textContent).toBe("volcano")
    expect(container!.querySelector("dl > dd")).not.toBeNull()
  })

  it("escapes special characters in the heading + definition", () => {
    const entries = loadGlossaryEntries({
      ampersand: {
        word: "&fun",
        definition: `quotes "ok" & angles <>`,
        variations: [],
        emoji: "",
      },
    })
    const xml = buildGlossaryDocument({
      language: "en",
      heading: "Glossary <test>",
      entries,
      backlinksByEntry: backlinks({ gl_001: [] }),
    })
    expect(xml).toContain(`<title>Glossary &lt;test&gt;</title>`)
    expect(xml).toContain(`&amp;fun`)
    expect(xml).toContain(`quotes &quot;ok&quot; &amp; angles &lt;&gt;`)
    expect(xmlParseError(xml)).toBeNull()
  })

  it("omits entries that weren't referenced", () => {
    const entries = loadGlossaryEntries(VOLCANO_JSON)
    const xml = buildGlossaryDocument({
      language: "en",
      heading: "Glossary",
      entries,
      backlinksByEntry: backlinks({}),
    })
    expect(xml).not.toContain(`<dt`)
  })
})

import { describe, it, expect } from "vitest"
import type { PageSectioningSection } from "@adt/types"
import { projectImportedFixedLayoutPage } from "../adt-round-trip/fixed-layout.js"
import { renderFixedLayoutPage } from "../fixed-layout-rendering.js"
import { projectImportedHtmlSection } from "../adt-round-trip/html.js"

/** A page in the exact shape Studio's fixed-layout exporter emits. */
function exportedFixedLayoutPage(body: string, options: {
  referenceWidth?: number
  contentStyle?: string
  viewportMeta?: string
} = {}): string {
  const referenceWidth = options.referenceWidth ?? 1145
  const contentStyle = options.contentStyle
    ?? "position:relative;width:1145px;height:692px;margin:0 auto;overflow:hidden"
  const viewportMeta = options.viewportMeta ?? "width=1145, height=692"
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="${viewportMeta}" />
  <title>Volcanoes</title>
  <link href="./content/tailwind_output.css" rel="stylesheet">
  <style>#content { visibility: hidden; }</style>
</head>
<body style="margin:0;overflow:hidden">
  <main>
    <div id="content" data-fl-reference-width="${referenceWidth}" style="${contentStyle}">
${body}
<script src="./assets/auto-fit.js"></script>
</div>
  </main>
  <script>window.alert("runtime")</script>
  <script src="./assets/base.bundle.local.js"></script>
</body>
</html>`
}

const SEGMENTS = [
  { text: "COPE", style: { "font-family": "Chokle,serif", "font-size": "18.97px", color: "#000000" } },
  { text: " will teach you", style: { "font-family": "Chokle,serif", "font-size": "20px", color: "#000000" } },
]

function segmentsAttribute(): string {
  return JSON.stringify(SEGMENTS).replaceAll("&", "&amp;").replaceAll('"', "&quot;")
}

const IMAGE = '  <img src="images/pg002003_im001.png" alt="A volcano" data-id="pg002003_im001"'
  + ' style="position:absolute;top:-1px;left:-1px;width:575px;height:694px">'

const PARAGRAPH = `  <p data-id="pg002003_p000" data-segments="${segmentsAttribute()}" data-adt-fit="1"`
  + ' style="position:absolute;top:597px;left:121px;line-height:20px;width:290px;height:20px">'
  + '<span style="font-family:Chokle,Merriweather,serif;font-size:18.97px;color:#000000">COPE</span>'
  + '<span style="font-family:Chokle,Merriweather,serif;font-size:20px;color:#000000"> will teach you</span>'
  + "</p>"

const CLIPPED_IMAGE = '  <svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
  + '<clipPath id="clip-pg004005_im003" clipPathUnits="userSpaceOnUse">'
  + '<path d="M223.07 558.51L381.27 558.51L381.27 518.6L223.07 518.6Z" transform="translate(-222,-518)"/>'
  + "</clipPath></defs></svg>\n"
  + '  <img src="images/pg004005_im003.png" alt="A logo" data-id="pg004005_im003"'
  + ' style="position:absolute;top:518px;left:222px;width:160px;height:42px;'
  + 'clip-path:url(#clip-pg004005_im003);mix-blend-mode:multiply;opacity:0.5">'

/** Wrap a projection back into the section shape `renderFixedLayoutPage` takes. */
function asSection(
  projection: NonNullable<ReturnType<typeof projectImportedFixedLayoutPage>>,
): PageSectioningSection {
  return {
    sectionId: "pg002003_sec001",
    sectionType: "fixed-layout-page",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: 2,
    isPruned: false,
    nodes: projection.nodes,
    placement: projection.placement,
    viewport: projection.viewport,
  }
}

describe("projectImportedFixedLayoutPage", () => {
  it("preserves the #content wrapper, its dimensions and its reference width", () => {
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(`${IMAGE}\n${PARAGRAPH}`),
    )
    expect(projection).not.toBeNull()
    expect(projection!.viewport).toEqual({ width: 1145, height: 692 })
    expect(projection!.referenceWidth).toBe(1145)
    expect(projection!.html).toMatch(/^<div id="content"/)
    expect(projection!.html).toContain('data-fl-reference-width="1145"')
    expect(projection!.html).toContain("width:1145px;height:692px")
    expect(projection!.html).toContain('data-id="pg002003_im001"')
    expect(projection!.html).toContain("top:597px;left:121px")
  })

  it("falls back to the viewport meta when #content carries no pixel size", () => {
    const projection = projectImportedFixedLayoutPage(exportedFixedLayoutPage(
      `${IMAGE}\n${PARAGRAPH}`,
      { contentStyle: "position:relative;margin:0 auto" },
    ))
    expect(projection!.viewport).toEqual({ width: 1145, height: 692 })
  })

  it("rejects implausible and non-numeric dimensions", () => {
    for (const contentStyle of [
      "position:relative;width:0px;height:692px",
      "position:relative;width:-10px;height:692px",
      "position:relative;width:99999px;height:99999px",
      "position:relative;width:100%;height:100%",
    ]) {
      const projection = projectImportedFixedLayoutPage(exportedFixedLayoutPage(
        `${IMAGE}\n${PARAGRAPH}`,
        { contentStyle, viewportMeta: "width=device-width, initial-scale=1" },
      ))
      expect(projection, contentStyle).toBeNull()
    }
  })

  it("returns null for a reflowable activity page in a fixed-layout book", () => {
    const quizPage = `<!DOCTYPE html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head><body><main>
  <div id="content" class="container content mx-auto w-full min-h-screen px-8 py-8 opacity-0">
    <section data-section-id="qz001" data-section-type="activity_multiple_choice">
      <h2 data-id="qz001_h001">Quiz</h2>
    </section>
  </div>
</main></body></html>`
    expect(projectImportedFixedLayoutPage(quizPage)).toBeNull()
  })

  it("returns null when a sized #content has nothing positioned inside it", () => {
    const projection = projectImportedFixedLayoutPage(exportedFixedLayoutPage(
      '  <p data-id="pg001_p000">Reflowable text</p>',
    ))
    expect(projection).toBeNull()
  })

  it("returns null when there is no #content root at all", () => {
    expect(projectImportedFixedLayoutPage("<html><body><p>Nothing</p></body></html>")).toBeNull()
  })

  it("reconstructs text placement from the inline style and data-segments", () => {
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(`${IMAGE}\n${PARAGRAPH}`),
    )!
    const placement = projection.placement.pg002003_p000
    expect(placement.position).toEqual({ top: 597, left: 121, lineHeight: 20 })
    expect(placement.blockBounds).toEqual({ x: 121, y: 597, width: 290, height: 20 })
    expect(placement.segments).toEqual(SEGMENTS)
    expect(projection.nodes).toEqual([
      { nodeId: "pg002003_im001", role: "image", isPruned: false },
      { nodeId: "pg002003_p000", role: "text", isPruned: false, text: "COPE will teach you" },
    ])
  })

  it("reconstructs image bounds, clip path, blend mode and opacity", () => {
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(CLIPPED_IMAGE),
    )!
    expect(projection.placement.pg004005_im003).toEqual({
      bounds: { x: 222, y: 518, width: 160, height: 42 },
      clipPath: "M223.07 558.51L381.27 558.51L381.27 518.6L223.07 518.6Z",
      blendMode: "multiply",
      opacity: 0.5,
    })
  })

  it("carries text alignment through for re-flowed translations", () => {
    const centered = PARAGRAPH.replace("height:20px", "height:20px;text-align:center")
    const projection = projectImportedFixedLayoutPage(exportedFixedLayoutPage(centered))!
    expect(projection.placement.pg002003_p000.textAlign).toBe("center")
  })

  it("drops imported scripts and event handlers but keeps ADT Studio's auto-fit", () => {
    const hostile = '  <img src="images/x.png" alt="" data-id="x001" onerror="steal()"'
      + ' style="position:absolute;top:0px;left:0px;width:10px;height:10px">\n'
      + '  <script>window.alert("inside content")</script>'
    const projection = projectImportedFixedLayoutPage(exportedFixedLayoutPage(
      `${hostile}\n${PARAGRAPH}`,
    ))!
    expect(projection.html).not.toContain("onerror")
    expect(projection.html).not.toContain("alert")
    expect(projection.html).not.toContain("base.bundle")
    expect(projection.html).toContain('<script src="./assets/auto-fit.js"></script>')
    expect(projection.html.match(/<script/g)).toHaveLength(1)
  })

  it("omits the auto-fit script when no paragraph is pinned to a block", () => {
    const unpinned = '  <p data-id="p001" style="position:absolute;top:10px;left:20px;line-height:12px">Hi</p>'
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(`${IMAGE}\n${unpinned}`),
    )!
    expect(projection.html).not.toContain("<script")
    expect(projection.placement.p001.blockBounds).toBeUndefined()
    expect(projection.placement.p001.position).toEqual({ top: 10, left: 20, lineHeight: 12 })
  })

  it("points image sources at the book's image endpoint", () => {
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(IMAGE),
      "/api/books/Volcanoes/images",
    )!
    expect(projection.html).toContain('src="/api/books/Volcanoes/images/pg002003_im001"')
    expect(projection.html).not.toContain("images/pg002003_im001.png")
  })

  it("survives a re-render through the fixed-layout renderer unchanged", () => {
    const projection = projectImportedFixedLayoutPage(
      exportedFixedLayoutPage(`${IMAGE}\n${PARAGRAPH}\n${CLIPPED_IMAGE}`),
      "/api/books/Volcanoes/images",
    )!
    const rendered = renderFixedLayoutPage(
      asSection(projection),
      "/api/books/Volcanoes/images",
      projection.referenceWidth,
    )
    const html = rendered.sections[0].html
    expect(rendered.sections[0].sectionType).toBe("fixed-layout-page")
    expect(html).toContain('data-fl-reference-width="1145"')
    expect(html).toContain("width:1145px;height:692px")
    // Geometry is what has to survive: every placed leaf keeps its box.
    expect(html).toContain("top:-1px;left:-1px;width:575px;height:694px")
    expect(html).toContain("top:597px;left:121px;line-height:20px;width:290px;height:20px")
    expect(html).toContain("top:518px;left:222px;width:160px;height:42px")
    expect(html).toContain("mix-blend-mode:multiply")
    expect(html).toContain("opacity:0.5")
    expect(html).toContain("M223.07 558.51L381.27 558.51L381.27 518.6L223.07 518.6Z")

    // And re-projecting the render is a fixed point, so repeated round trips
    // through export/import cannot drift.
    const reprojected = projectImportedFixedLayoutPage(
      `<html><head></head><body>${html}</body></html>`,
      "/api/books/Volcanoes/images",
    )!
    expect(reprojected.viewport).toEqual(projection.viewport)
    expect(reprojected.placement).toEqual(projection.placement)
    expect(reprojected.nodes).toEqual(projection.nodes)
  })

  it("leaves the semantic projection of the same page intact", () => {
    const html = exportedFixedLayoutPage(`${IMAGE}\n${PARAGRAPH}`)
    const semantic = projectImportedHtmlSection(html, "pg002003_sec001")
    expect(semantic.sectionType).toBe("content")
    expect(semantic.nodes.map((node) => node.nodeId))
      .toEqual(["pg002003_im001", "pg002003_p000"])
    expect(semantic.images[0]).toMatchObject({ imageId: "pg002003_im001", alt: "A volcano" })
  })
})

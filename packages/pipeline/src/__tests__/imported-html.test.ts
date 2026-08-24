import { describe, expect, it } from "vitest"
import {
  extractImportedHtmlPresentationAssets,
  inspectImportedHtmlContract,
  projectImportedHtmlSection,
} from "../imported-html.js"

describe("projectImportedHtmlSection", () => {
  it("normalizes a full exported page into a semantic section fragment", () => {
    const result = projectImportedHtmlSection(`<!doctype html><html><head>
      <title>Book shell</title>
    </head><body><main><div id="content">
      <section data-section-id="pg002_sec001" data-section-type="text_and_single_image">
        <h2><span data-id="heading-1">A new chapter</span></h2>
        <p data-id="body-1">Edited body</p>
        <img data-id="pg002_im001" src="images/original.png" alt="A raven in a tree">
      </section>
    </div></main><script>runtime()</script></body></html>`, "pg002_sec001", "/api/books/demo/images")

    expect(result.sectionType).toBe("text_and_single_image")
    expect(result.html).toContain('<section data-section-id="pg002_sec001"')
    expect(result.html).not.toContain("<!doctype")
    expect(result.html).not.toContain("runtime()")
    expect(result.html).toContain('src="/api/books/demo/images/pg002_im001"')
    expect(result.nodes).toEqual([
      { nodeId: "heading-1", role: "heading", text: "A new chapter", isPruned: false },
      { nodeId: "body-1", role: "text", text: "Edited body", isPruned: false },
      { nodeId: "pg002_im001", role: "image", isPruned: false },
    ])
    expect(result.images).toEqual([{
      imageId: "pg002_im001",
      src: "images/original.png",
      alt: "A raven in a tree",
      decorative: false,
    }])
  })

  it("uses the matching section when the document contains more than one", () => {
    const result = projectImportedHtmlSection(`
      <section data-section-id="other"><p data-id="wrong">Wrong</p></section>
      <section data-section-id="wanted"><p data-id="right">Right</p></section>
    `, "wanted")

    expect(result.html).toContain('data-section-id="wanted"')
    expect(result.nodes).toEqual([
      { nodeId: "right", role: "text", text: "Right", isPruned: false },
    ])
  })

  it("removes executable markup and event handlers from imported sections", () => {
    const result = projectImportedHtmlSection(`
      <section data-section-id="safe">
        <p data-id="body" onclick="fetch('/api/books/demo', {method: 'DELETE'})">Text</p>
        <img data-id="image" src="javascript:alert(1)" onerror="alert(2)">
        <script>window.evil = true</script>
        <iframe src="/api/books"></iframe>
      </section>
    `, "safe")

    expect(result.html).not.toMatch(/<script|<iframe|onclick|onerror|javascript:/i)
    expect(result.nodes).toEqual([
      { nodeId: "body", role: "text", text: "Text", isPruned: false },
      { nodeId: "image", role: "image", isPruned: false },
    ])
  })

  it("repairs stable IDs only when legacy recovery is requested", () => {
    const html = `
      <div id="content">
        <p data-id="pg001_n001">First copy</p>
        <p data-id="pg001_n001">Second copy</p>
        <img src="images/pg001_im001.jpg" alt="A book cover">
      </div>
    `
    const strict = projectImportedHtmlSection(html, "pg001_sec001")
    const repaired = projectImportedHtmlSection(
      html,
      "pg001_sec001",
      undefined,
      { repairLegacyIds: true },
    )

    expect(strict.html.match(/data-id="pg001_n001"/g)).toHaveLength(2)
    expect(repaired.html.match(/data-id="pg001_n001"/g)).toHaveLength(1)
    expect(repaired.html).toContain('data-id="pg001_n001_copy2"')
    expect(repaired.html).toContain('data-id="pg001_im001"')
    expect(repaired.nodes.map((node) => node.nodeId)).toEqual([
      "pg001_n001",
      "pg001_n001_copy2",
      "pg001_im001",
    ])
  })
})

describe("extractImportedHtmlPresentationAssets", () => {
  it("keeps custom local presentation assets and excludes runtime or unsafe paths", () => {
    expect(extractImportedHtmlPresentationAssets(`
      <link href="./content/tailwind_output.css" rel="stylesheet">
      <link href="./assets/book-showcase.css?v=2" rel="stylesheet">
      <link href="https://example.com/remote.css" rel="stylesheet">
      <div id="content" class="container opacity-0 storybook-root"></div>
      <script src="./assets/base.bundle.local.js"></script>
      <script src="./assets/book-showcase.js"></script>
      <script src="../outside.js"></script>
    `)).toEqual({
      stylesheets: ["assets/book-showcase.css"],
      scripts: ["assets/book-showcase.js"],
      contentClasses: ["container", "storybook-root"],
    })
  })
})

describe("inspectImportedHtmlContract", () => {
  it("accepts the canonical page shell and collects local assets", () => {
    expect(inspectImportedHtmlContract(`
      <link href="./content/tailwind_output.css" rel="stylesheet">
      <main><div id="content"><section data-section-id="pg001_sec001" data-section-type="content">
        <img data-id="pg001_im000" src="images/decor.png" alt="" aria-hidden="true">
        <img data-id="pg001_im001" src="images/photo.png" alt="Photo">
        <p data-id="pg001_n001">Text</p>
      </section></div></main>
    `, "pg001_sec001")).toEqual({
      issues: [],
      localAssets: ["content/tailwind_output.css", "images/decor.png", "images/photo.png"],
      dataIds: ["pg001_im000", "pg001_im001", "pg001_n001"],
    })
  })

  it("requires stable ids even for decorative images", () => {
    const result = inspectImportedHtmlContract(`
      <div id="content"><section data-section-id="pg001_sec001" data-section-type="content">
        <img src="images/decor.png" alt="" role="presentation">
        <p data-id="pg001_n001">Text</p>
      </section></div>
    `, "pg001_sec001")

    expect(result.issues).toContainEqual({
      code: "image-missing-data-id",
      detail: "images/decor.png",
    })
  })

  it("checks a fixed-layout page under #content instead of demanding a section", () => {
    const html = `
      <link href="./content/tailwind_output.css" rel="stylesheet">
      <main><div id="content" data-fl-reference-width="1145" style="position:relative;width:1145px;height:692px">
        <img src="images/pg001_im001.png" alt="" data-id="pg001_im001" style="position:absolute;top:0px;left:0px;width:575px;height:692px">
        <p data-id="pg001_p000" style="position:absolute;top:597px;left:121px;line-height:20px">Text</p>
        <script src="./assets/auto-fit.js"></script>
      </div></main>
    `

    expect(inspectImportedHtmlContract(html, "pg001_sec001").issues)
      .toContainEqual({ code: "missing-section", detail: "pg001_sec001" })
    expect(inspectImportedHtmlContract(html, "pg001_sec001", {
      fixedLayoutPage: true,
    })).toEqual({
      issues: [],
      localAssets: [
        "content/tailwind_output.css",
        "images/pg001_im001.png",
        "assets/auto-fit.js",
      ],
      dataIds: ["pg001_im001", "pg001_p000"],
    })
  })

  it("still enforces data-id and asset rules on a fixed-layout page", () => {
    const result = inspectImportedHtmlContract(`
      <div id="content" style="position:relative;width:1145px;height:692px">
        <img src="images/decor.png" alt="" style="position:absolute;top:0px;left:0px;width:10px;height:10px">
        <img src="https://cdn.example.com/remote.png" alt="" data-id="pg001_im002" style="position:absolute;top:0px;left:0px;width:10px;height:10px">
        <p data-id="pg001_p000" style="position:absolute;top:1px;left:1px;line-height:20px">A</p>
        <p data-id="pg001_p000" style="position:absolute;top:2px;left:1px;line-height:20px">B</p>
      </div>
    `, "pg001_sec001", { fixedLayoutPage: true })

    expect(result.issues).toContainEqual({ code: "image-missing-data-id", detail: "images/decor.png" })
    expect(result.issues).toContainEqual({ code: "duplicate-data-id", detail: "pg001_p000" })
    expect(result.issues).toContainEqual({
      code: "remote-asset",
      detail: "https://cdn.example.com/remote.png",
    })
  })

  it("accepts the legacy quiz section identity only when explicitly enabled", () => {
    const html = `
      <div id="content">
        <section data-id="qz001" data-section-type="activity_quiz">
          <p data-id="qz001_que">Question</p>
        </section>
      </div>
    `

    expect(inspectImportedHtmlContract(html, "qz001").issues)
      .toContainEqual({ code: "missing-section", detail: "qz001" })
    expect(inspectImportedHtmlContract(html, "qz001", {
      allowSectionDataId: true,
    })).toEqual({
      issues: [],
      localAssets: [],
      dataIds: ["qz001", "qz001_que"],
    })
  })

  it("rejects custom presentation files and noncanonical media folders", () => {
    const result = inspectImportedHtmlContract(`
      <link href="./assets/book-showcase.css" rel="stylesheet">
      <div id="content"><section data-section-id="pg001_sec001" data-section-type="content">
        <img data-id="pg001_im001" src="showcase-assets/photo.png" alt="Photo">
        <p data-id="pg001_n001">Text</p>
      </section></div>
      <script src="./assets/book-showcase.js"></script>
    `, "pg001_sec001")

    expect(result.issues).toEqual([
      { code: "unsupported-stylesheet", detail: "./assets/book-showcase.css" },
      { code: "unsupported-asset-location", detail: "showcase-assets/photo.png" },
      { code: "unsupported-script", detail: "./assets/book-showcase.js" },
    ])
  })

  it("allows the Google Fonts fallback emitted by the ADT packager", () => {
    const result = inspectImportedHtmlContract(`
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible">
      <div id="content"><section data-section-id="pg001_sec001" data-section-type="content">
        <p data-id="pg001_n001">Text</p>
      </section></div>
    `, "pg001_sec001")

    expect(result.issues).toEqual([])
  })

  it("reports unsupported structure and unsafe dependencies", () => {
    const result = inspectImportedHtmlContract(`
      <section data-section-id="wrong">
        <img src="https://example.com/photo.png">
        <img src="%2e%2e/outside.png">
      </section>
    `, "pg001_sec001")
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "missing-content-root",
      "missing-section",
      "remote-asset",
      "unsafe-asset",
    ])
  })
})


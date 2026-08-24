import { describe, expect, it } from "vitest"
import type { Storage, PageData } from "@adt/storage"
import {
  buildTextCatalog,
  extractImportedHtmlPresentationAssets,
  inspectImportedHtmlContract,
  extractTextCatalogEntriesFromHtml,
  projectImportedHtmlSection,
} from "../text-catalog.js"

function createMockStorage(
  nodeData: Record<string, Record<string, unknown>>
): Storage {
  return {
    getLatestNodeData(node: string, itemId: string) {
      const data = nodeData[node]?.[itemId]
      return data !== undefined ? { version: 1, data } : null
    },
    getPages: () => [],
    getPageImageBase64: () => "",
    getImageBase64: () => "",
    getPageImages: () => [],
    putNodeData: () => 1,
    clearExtractedData: () => {},
    putExtractedPage: () => {},
    appendLlmLog: () => {},
    getSignLanguageVideos: () => [],
    getSignLanguageVideoPath: () => null,
    close: () => {},
  }
}

const pages: PageData[] = [
  { pageId: "pg001", pageNumber: 1, text: "Page 1 text" },
  { pageId: "pg002", pageNumber: 2, text: "Page 2 text" },
]

describe("buildTextCatalog", () => {
  it("extracts text from data-id elements in rendered HTML", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">Hello world</p><p data-id="pg001_gp001_tx002">Second paragraph</p></section>',
            },
          ],
        },
        pg002: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text",
              reasoning: "",
              html: '<section><p data-id="pg002_gp001_tx001">Page two text</p></section>',
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, pages)

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx001", text: "Hello world" },
      { id: "pg001_gp001_tx002", text: "Second paragraph" },
      { id: "pg002_gp001_tx001", text: "Page two text" },
    ])
  })

  it("looks up captions for img data-ids", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "images_only",
              reasoning: "",
              html: '<section><img data-id="pg001_im001" src="placeholder" alt="test" /></section>',
            },
          ],
        },
      },
      "image-captioning": {
        pg001: {
          captions: [
            { imageId: "pg001_im001", reasoning: "...", caption: "A beautiful sunset" },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_im001", text: "A beautiful sunset" },
    ])
  })

  it("reassigns activity_gen_* IDs to page-scoped ac IDs", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_multiple_choice",
              reasoning: "",
              html: '<section><div data-id="pg001_gp001_tx001">Question</div><div data-id="activity_gen_opt1">Option A</div><div data-id="activity_gen_opt2">Option B</div></section>',
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx001", text: "Question" },
      { id: "pg001_ac001", text: "Option A" },
      { id: "pg001_ac002", text: "Option B" },
    ])
  })

  it("builds glossary entries with gl prefix", async () => {
    const storage = createMockStorage({
      glossary: {
        book: {
          items: [
            { word: "Photosynthesis", definition: "The process by which plants make food", variations: [], emojis: [] },
            { word: "Mitosis", definition: "Cell division process", variations: [], emojis: [] },
          ],
          pageCount: 5,
          generatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    })

    const result = await buildTextCatalog(storage, [])

    expect(result.entries).toEqual([
      { id: "gl001", text: "Photosynthesis" },
      { id: "gl001_def", text: "The process by which plants make food" },
      { id: "gl002", text: "Mitosis" },
      { id: "gl002_def", text: "Cell division process" },
    ])
  })

  it("preserves explicit glossary ids for manual entries", async () => {
    const storage = createMockStorage({
      glossary: {
        book: {
          items: [
            {
              id: "gl_manual_soil",
              source: "manual",
              word: "Soil",
              definition: "The top layer of earth",
              variations: ["soils"],
              emojis: ["🪨"],
            },
          ],
          pageCount: 1,
          generatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
    })

    const result = await buildTextCatalog(storage, [])

    expect(result.entries).toEqual([
      { id: "gl_manual_soil", text: "Soil" },
      { id: "gl_manual_soil_def", text: "The top layer of earth" },
    ])
  })

  it("builds quiz entries with qz prefix", async () => {
    const storage = createMockStorage({
      "quiz-generation": {
        book: {
          generatedAt: "2024-01-01T00:00:00.000Z",
          language: "en",
          pagesPerQuiz: 3,
          quizzes: [
            {
              quizIndex: 0,
              afterPageId: "pg003",
              pageIds: ["pg001", "pg002", "pg003"],
              question: "What is 2+2?",
              options: [
                { text: "3", explanation: "Too low" },
                { text: "4", explanation: "Correct!" },
                { text: "5", explanation: "Too high" },
              ],
              answerIndex: 1,
              reasoning: "...",
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [])

    expect(result.entries).toEqual([
      { id: "qz001_que", text: "What is 2+2?" },
      { id: "qz001_o0", text: "3" },
      { id: "qz001_o0_exp", text: "Too low" },
      { id: "qz001_o1", text: "4" },
      { id: "qz001_o1_exp", text: "Correct!" },
      { id: "qz001_o2", text: "5" },
      { id: "qz001_o2_exp", text: "Too high" },
    ])
  })

  it("skips empty text nodes", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">  </p><p data-id="pg001_gp001_tx002">Real text</p></section>',
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx002", text: "Real text" },
    ])
  })

  it("skips pages with no web-rendering data", async () => {
    const storage = createMockStorage({})

    const result = await buildTextCatalog(storage, pages)

    expect(result.entries).toEqual([])
  })

  it("skips images with no caption", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "images_only",
              reasoning: "",
              html: '<section><img data-id="pg001_im001" src="placeholder" alt="test" /></section>',
            },
          ],
        },
      },
      // No image-captioning node
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([])
  })

  it("combines all sources into a single catalog", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">Hello</p><img data-id="pg001_im001" src="x" /></section>',
            },
          ],
        },
      },
      "image-captioning": {
        pg001: {
          captions: [
            { imageId: "pg001_im001", reasoning: "...", caption: "A photo" },
          ],
        },
      },
      glossary: {
        book: {
          items: [{ word: "Hello", definition: "A greeting", variations: [], emojis: [] }],
          pageCount: 1,
          generatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
      "quiz-generation": {
        book: {
          generatedAt: "2024-01-01T00:00:00.000Z",
          language: "en",
          pagesPerQuiz: 1,
          quizzes: [
            {
              quizIndex: 0,
              afterPageId: "pg001",
              pageIds: ["pg001"],
              question: "What is hello?",
              options: [
                { text: "A greeting", explanation: "Correct" },
                { text: "A farewell", explanation: "Wrong" },
                { text: "A color", explanation: "Wrong" },
              ],
              answerIndex: 0,
              reasoning: "...",
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toHaveLength(11)
    // Page text
    expect(result.entries[0]).toEqual({ id: "pg001_gp001_tx001", text: "Hello" })
    // Image caption
    expect(result.entries[1]).toEqual({ id: "pg001_im001", text: "A photo" })
    // Glossary
    expect(result.entries[2]).toEqual({ id: "gl001", text: "Hello" })
    expect(result.entries[3]).toEqual({ id: "gl001_def", text: "A greeting" })
    // Quiz
    expect(result.entries[4]).toEqual({ id: "qz001_que", text: "What is hello?" })
  })

  it("includes generatedAt timestamp", async () => {
    const storage = createMockStorage({})
    const result = await buildTextCatalog(storage, [])
    expect(result.generatedAt).toBeDefined()
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN()
  })

  it("emits activity answer entries with _ans_ IDs", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_fill_in_the_blank",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">The [[blank:item-1]] is hot.</p></section>',
              activityAnswers: { "item-1": "sun", "item-2": "moon" },
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "",
          sections: [
            {
              sectionId: "pg001_section_0",
              sectionType: "activity_fill_in_the_blank",
              nodes: [],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toContainEqual({ id: "pg001_section_0_ans_item-1", text: "sun" })
    expect(result.entries).toContainEqual({ id: "pg001_section_0_ans_item-2", text: "moon" })
  })

  it("stringifies boolean and number answer values", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_fill_in_the_blank",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">Text</p></section>',
              activityAnswers: { "item-1": true, "item-2": 42 },
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toContainEqual({ id: "pg001_sec001_ans_item-1", text: "true" })
    expect(result.entries).toContainEqual({ id: "pg001_sec001_ans_item-2", text: "42" })
  })

  it("skips sections without activity answers", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "text",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">Hello</p></section>',
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([{ id: "pg001_gp001_tx001", text: "Hello" }])
    expect(result.entries.some((e) => e.id.includes("_ans_"))).toBe(false)
  })

  it("extracts leaf data-id text from custom-activity sections", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_custom_drag_drop",
              reasoning: "",
              html:
                '<section data-section-type="activity_custom_drag_drop" data-id="pg001_s0" role="activity">' +
                '<h3 data-id="text-pg001-30">Drag and Drop</h3>' +
                '<p data-id="text-pg001-31">Drag each item.</p>' +
                '<div data-id="text-pg001-32">Autonomous</div>' +
                "</section>",
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "text-pg001-30", text: "Drag and Drop" },
      { id: "text-pg001-31", text: "Drag each item." },
      { id: "text-pg001-32", text: "Autonomous" },
    ])
  })

  it("does not leak inline <script> source into custom-activity catalog entries", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_custom_drag_drop",
              reasoning: "",
              html:
                '<section data-section-type="activity_custom_drag_drop" data-id="pg001_s0" role="activity">' +
                '<p data-id="text-pg001-1">Visible prompt</p>' +
                '<script>window.adtRegisterCustomActivity(section, { validate: () => true, reset: () => {} });</script>' +
                "</section>",
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "text-pg001-1", text: "Visible prompt" },
    ])
    for (const entry of result.entries) {
      expect(entry.text).not.toMatch(/adtRegisterCustomActivity/)
      expect(entry.text).not.toMatch(/window\./)
    }
  })

  it("skips wrapper data-id elements that contain other data-id descendants", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_custom_drag_drop",
              reasoning: "",
              html:
                '<section data-id="pg001_s0">' +
                '<div data-id="text-pg001-1">Outer wrapper text leaf</div>' +
                '<div data-id="text-pg001-2">Another leaf</div>' +
                "</section>",
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries.find((e) => e.id === "pg001_s0")).toBeUndefined()
    expect(result.entries).toEqual([
      { id: "text-pg001-1", text: "Outer wrapper text leaf" },
      { id: "text-pg001-2", text: "Another leaf" },
    ])
  })

  it("produces unique answer IDs for multiple sections with same item keys", async () => {
    const storage = createMockStorage({
      "web-rendering": {
        pg001: {
          sections: [
            {
              sectionIndex: 0,
              sectionType: "activity_fill_in_the_blank",
              reasoning: "",
              html: '<section><p data-id="pg001_gp001_tx001">First</p></section>',
              activityAnswers: { "item-1": "alpha" },
            },
            {
              sectionIndex: 1,
              sectionType: "activity_fill_in_the_blank",
              reasoning: "",
              html: '<section><p data-id="pg001_gp002_tx001">Second</p></section>',
              activityAnswers: { "item-1": "beta" },
            },
          ],
        },
      },
      "page-sectioning": {
        pg001: {
          reasoning: "",
          sections: [
            {
              sectionId: "pg001_section_0",
              sectionType: "activity_fill_in_the_blank",
              nodes: [],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_section_1",
              sectionType: "activity_fill_in_the_blank",
              nodes: [],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
      },
    })

    const result = await buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toContainEqual({ id: "pg001_section_0_ans_item-1", text: "alpha" })
    expect(result.entries).toContainEqual({ id: "pg001_section_1_ans_item-1", text: "beta" })
  })
})

describe("extractTextCatalogEntriesFromHtml", () => {
  it("recovers leaf text and image alternative text from edited pages", () => {
    expect(extractTextCatalogEntriesFromHtml(`
      <main data-id="wrapper">
        <p data-id="pg001_n001">Edited <strong>book text</strong></p>
        <img data-id="pg001_im001" alt="An edited image description">
        <script data-id="script-entry">doNotNarrate()</script>
      </main>
    `)).toEqual([
      { id: "pg001_n001", text: "Edited book text" },
      { id: "pg001_im001", text: "An edited image description" },
    ])
  })

  it("rejects duplicate stable ids instead of producing ambiguous speech", () => {
    expect(() => extractTextCatalogEntriesFromHtml(`
      <p data-id="pg001_n001">One</p>
      <p data-id="pg001_n001">Two</p>
    `)).toThrow("Duplicate data-id")
  })

  it("uses the exported content root and rewrites generated activity ids", () => {
    expect(extractTextCatalogEntriesFromHtml(`
      <h1 data-id="runtime-title">Runtime chrome</h1>
      <div id="content">
        <p data-id="activity_gen_question">Question</p>
        <p data-id="activity_gen_answer">Answer</p>
      </div>
    `, "pg003")).toEqual([
      { id: "pg003_ac001", text: "Question" },
      { id: "pg003_ac002", text: "Answer" },
    ])
  })
})

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

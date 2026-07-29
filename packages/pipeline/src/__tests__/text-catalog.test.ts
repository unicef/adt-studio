import { describe, expect, it } from "vitest"
import type { Storage, PageData } from "@adt/storage"
import { buildTextCatalog } from "../text-catalog.js"

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

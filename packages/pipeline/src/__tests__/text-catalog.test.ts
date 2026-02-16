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
    close: () => {},
  }
}

const pages: PageData[] = [
  { pageId: "pg001", pageNumber: 1, text: "Page 1 text" },
  { pageId: "pg002", pageNumber: 2, text: "Page 2 text" },
]

describe("buildTextCatalog", () => {
  it("extracts text from data-id elements in rendered HTML", () => {
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

    const result = buildTextCatalog(storage, pages)

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx001", text: "Hello world" },
      { id: "pg001_gp001_tx002", text: "Second paragraph" },
      { id: "pg002_gp001_tx001", text: "Page two text" },
    ])
  })

  it("looks up captions for img data-ids", () => {
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

    const result = buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_im001", text: "A beautiful sunset" },
    ])
  })

  it("reassigns activity_gen_* IDs to page-scoped ac IDs", () => {
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

    const result = buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx001", text: "Question" },
      { id: "pg001_ac001", text: "Option A" },
      { id: "pg001_ac002", text: "Option B" },
    ])
  })

  it("builds glossary entries with gl prefix", () => {
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

    const result = buildTextCatalog(storage, [])

    expect(result.entries).toEqual([
      { id: "gl001", text: "Photosynthesis" },
      { id: "gl001_def", text: "The process by which plants make food" },
      { id: "gl002", text: "Mitosis" },
      { id: "gl002_def", text: "Cell division process" },
    ])
  })

  it("builds quiz entries with qz prefix", () => {
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

    const result = buildTextCatalog(storage, [])

    expect(result.entries).toEqual([
      { id: "qz001", text: "What is 2+2?" },
      { id: "qz001_o0", text: "3" },
      { id: "qz001_o0_exp", text: "Too low" },
      { id: "qz001_o1", text: "4" },
      { id: "qz001_o1_exp", text: "Correct!" },
      { id: "qz001_o2", text: "5" },
      { id: "qz001_o2_exp", text: "Too high" },
    ])
  })

  it("skips empty text nodes", () => {
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

    const result = buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([
      { id: "pg001_gp001_tx002", text: "Real text" },
    ])
  })

  it("skips pages with no web-rendering data", () => {
    const storage = createMockStorage({})

    const result = buildTextCatalog(storage, pages)

    expect(result.entries).toEqual([])
  })

  it("skips images with no caption", () => {
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

    const result = buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toEqual([])
  })

  it("combines all sources into a single catalog", () => {
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

    const result = buildTextCatalog(storage, [pages[0]])

    expect(result.entries).toHaveLength(11)
    // Page text
    expect(result.entries[0]).toEqual({ id: "pg001_gp001_tx001", text: "Hello" })
    // Image caption
    expect(result.entries[1]).toEqual({ id: "pg001_im001", text: "A photo" })
    // Glossary
    expect(result.entries[2]).toEqual({ id: "gl001", text: "Hello" })
    expect(result.entries[3]).toEqual({ id: "gl001_def", text: "A greeting" })
    // Quiz
    expect(result.entries[4]).toEqual({ id: "qz001", text: "What is hello?" })
  })

  it("includes generatedAt timestamp", () => {
    const storage = createMockStorage({})
    const result = buildTextCatalog(storage, [])
    expect(result.generatedAt).toBeDefined()
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN()
  })
})

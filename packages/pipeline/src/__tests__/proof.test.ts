import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { runProof } from "../proof.js"

const {
  capturedCaptionInputs,
  captionPageImagesMock,
  generateGlossaryMock,
  generateAllQuizzesMock,
} = vi.hoisted(() => {
  const capturedCaptionInputs: unknown[] = []

  return {
    capturedCaptionInputs,
    captionPageImagesMock: vi.fn(async (input: unknown) => {
      capturedCaptionInputs.push(input)
      return { captions: [] }
    }),
    generateGlossaryMock: vi.fn(async () => ({
      items: [],
      pageCount: 0,
      generatedAt: new Date(0).toISOString(),
    })),
    generateAllQuizzesMock: vi.fn(async () => ({
      generatedAt: new Date(0).toISOString(),
      language: "en",
      pagesPerQuiz: 3,
      quizzes: [],
    })),
  }
})

vi.mock("../image-captioning.js", async () => {
  const actual = await vi.importActual<typeof import("../image-captioning.js")>(
    "../image-captioning.js"
  )
  return {
    ...actual,
    captionPageImages: captionPageImagesMock,
  }
})

vi.mock("../glossary.js", async () => {
  const actual = await vi.importActual<typeof import("../glossary.js")>(
    "../glossary.js"
  )
  return {
    ...actual,
    generateGlossary: generateGlossaryMock,
  }
})

vi.mock("../quiz-generation.js", async () => {
  const actual = await vi.importActual<typeof import("../quiz-generation.js")>(
    "../quiz-generation.js"
  )
  return {
    ...actual,
    generateAllQuizzes: generateAllQuizzesMock,
  }
})

function writeBaseConfig(configPath: string): void {
  fs.writeFileSync(
    configPath,
    `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
`
  )
}

function seedProofBook(
  booksRoot: string,
  label: string,
  bookSummary?: string
): void {
  const storage = createBookStorage(label, booksRoot)
  try {
    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: "pg001_page",
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [
        {
          imageId: "pg001_im001",
          buffer: Buffer.from("fake-image"),
          format: "png",
          hash: "hash-image",
          width: 400,
          height: 300,
        },
      ],
    })

    storage.putNodeData("storyboard-acceptance", "book", {
      acceptedAt: new Date().toISOString(),
      renderedPageCount: 1,
    })

    storage.putNodeData("web-rendering", "pg001", {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: '<section><img data-id="pg001_im001" src="x" /></section>',
        },
      ],
    })

    if (bookSummary) {
      storage.putNodeData("book-summary", "book", { summary: bookSummary })
    }
  } finally {
    storage.close()
  }
}

describe("runProof", () => {
  let tmpDir = ""

  beforeEach(() => {
    capturedCaptionInputs.length = 0
    captionPageImagesMock.mockClear()
    generateGlossaryMock.mockClear()
    generateAllQuizzesMock.mockClear()
  })

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("passes book summary to captioning context when available", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-summary-"))
    const booksRoot = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedProofBook(
      booksRoot,
      "with-summary",
      "A grade 3 science textbook about the water cycle."
    )

    await runProof({
      label: "with-summary",
      booksRoot,
      promptsDir,
      configPath,
    })

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBe(
      "A grade 3 science textbook about the water cycle."
    )
  })

  it("omits book summary when no summary node exists", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-summary-"))
    const booksRoot = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    seedProofBook(booksRoot, "without-summary")

    await runProof({
      label: "without-summary",
      booksRoot,
      promptsDir,
      configPath,
    })

    expect(captionPageImagesMock).toHaveBeenCalledTimes(1)
    const firstInput = capturedCaptionInputs[0] as { bookSummary?: string }
    expect(firstInput.bookSummary).toBeUndefined()
  })
})

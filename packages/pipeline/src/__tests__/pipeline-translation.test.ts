import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { openBookDb, resolveBookPaths } from "@adt/storage"
import type { GenerateObjectOptions } from "@adt/llm"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
  vi.restoreAllMocks()
  vi.resetModules()
})

vi.mock("@adt/llm", async () => {
  const actual = await vi.importActual<typeof import("@adt/llm")>(
    "@adt/llm"
  )

  return {
    ...actual,
    createLLMModel: vi.fn(() => ({
      generateObject: async <T>(options: GenerateObjectOptions) => {
        if (options.prompt === "translation") {
          const texts = (options.context?.texts ??
            []) as Array<{ text: string }>
          return {
            object: {
              translations: texts.map((t) => `FR:${t.text}`),
            } as T,
            usage: { inputTokens: 1, outputTokens: 1 },
          }
        }

        return {
          object: {} as T,
          usage: { inputTokens: 0, outputTokens: 0 },
        }
      },
    })),
    createPromptEngine: vi.fn(() => ({
      renderPrompt: async () => [],
    })),
    createRateLimiter: vi.fn(() => undefined),
  }
})

vi.mock("../pdf-extraction.js", () => ({
  extractPDF: vi.fn(async (_options, storage, progress) => {
    progress.emit({ type: "step-start", step: "extract" })

    const pageImage = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+Q7cAAAAASUVORK5CYII=",
      "base64"
    )

    storage.putExtractedPage({
      pageId: "pg001",
      pageNumber: 1,
      text: "Hello world",
      pageImage: {
        imageId: "pg001_page",
        buffer: pageImage,
        format: "png",
        width: 1,
        height: 1,
        hash: "hash_page",
      },
      images: [
        {
          imageId: "pg001_img001",
          buffer: pageImage,
          format: "png",
          width: 1,
          height: 1,
          hash: "hash_img",
        },
      ],
    })

    progress.emit({
      type: "step-progress",
      step: "extract",
      message: "1/1",
      page: 1,
      totalPages: 1,
    })
    progress.emit({ type: "step-complete", step: "extract" })
  }),
}))

vi.mock("../metadata-extraction.js", async () => {
  const actual = await vi.importActual<typeof import("../metadata-extraction.js")>(
    "../metadata-extraction.js"
  )

  return {
    ...actual,
    extractMetadata: vi.fn(async () => ({
      title: "Mock Book",
      authors: ["Mock Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "Mock metadata",
    })),
  }
})

vi.mock("../text-classification.js", async () => {
  const actual = await vi.importActual<typeof import("../text-classification.js")>(
    "../text-classification.js"
  )

  return {
    ...actual,
    classifyPageText: vi.fn(async () => ({
      reasoning: "Mock text classification",
      groups: [
        {
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            {
              textType: "section_text",
              text: "Hello world",
              isPruned: false,
            },
          ],
        },
      ],
    })),
  }
})

vi.mock("../page-sectioning.js", async () => {
  const actual = await vi.importActual<typeof import("../page-sectioning.js")>(
    "../page-sectioning.js"
  )

  return {
    ...actual,
    sectionPage: vi.fn(async () => ({
      reasoning: "Mock sectioning",
      sections: [
        {
          sectionId: "pg001_sec001",
          sectionType: "text_only",
          parts: [{ type: "text_group", groupId: "pg001_gp001", groupType: "paragraph", texts: [{ textType: "section_text", text: "Hello world", isPruned: false }], isPruned: false }],
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: null,
          isPruned: false,
        },
      ],
    })),
  }
})

vi.mock("../web-rendering.js", async () => {
  const actual = await vi.importActual<typeof import("../web-rendering.js")>(
    "../web-rendering.js"
  )

  return {
    ...actual,
    renderPage: vi.fn(async () => ({
      sections: [
        {
          sectionIndex: 0,
          sectionType: "text_only",
          reasoning: "Mock render",
          html: "<section><p data-text-id=\"pg001_gp001_tx001\">FR:Hello world</p></section>",
        },
      ],
    })),
  }
})

describe("runPipeline translation flow", () => {
  it("creates translated text-classification versions when editing language differs", async () => {
    const { runPipeline } = await import("../pipeline.js")

    const booksRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "adt-pipeline-translation-test-")
    )
    dirs.push(booksRoot)

    const label = "translation-book"
    const pdfPath = path.join(booksRoot, `${label}.pdf`)
    fs.writeFileSync(pdfPath, "%PDF-1.4\n%mock\n")

    const configPath = path.join(booksRoot, "config.yaml")
    fs.writeFileSync(
      configPath,
      `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
editing_language: fr
`
    )

    await runPipeline({
      label,
      pdfPath,
      booksRoot,
      configPath,
      promptsDir: path.join(booksRoot, "prompts"),
      templatesDir: path.join(booksRoot, "templates"),
      concurrency: 1,
    })

    const paths = resolveBookPaths(label, booksRoot)
    const db = openBookDb(paths.dbPath)
    try {
      const rows = db.all(
        "SELECT version, data FROM node_data WHERE node = 'text-classification' AND item_id = ? ORDER BY version ASC",
        ["pg001"]
      ) as Array<{ version: number; data: string }>

      expect(rows).toHaveLength(2)

      const v1 = JSON.parse(rows[0].data) as {
        groups: Array<{ texts: Array<{ text: string }> }>
      }
      const v2 = JSON.parse(rows[1].data) as {
        reasoning: string
        groups: Array<{ texts: Array<{ text: string }> }>
      }

      expect(v1.groups[0].texts[0].text).toBe("Hello world")
      expect(v2.groups[0].texts[0].text).toBe("FR:Hello world")
      expect(v2.reasoning).toContain("Translated from en to fr.")
    } finally {
      db.close()
    }
  })
})

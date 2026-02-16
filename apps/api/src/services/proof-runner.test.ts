import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createPromptEngine, computeHash, writeCache } from "@adt/llm"
import { glossaryLLMSchema } from "@adt/types"
import { createProofRunner } from "./proof-runner.js"

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

function seedBook(
  booksDir: string,
  label: string,
  options: { withRendering: boolean; renderingSections?: unknown[] }
): string {
  const pageId = `${label}_p1`
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId,
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: `${pageId}_page`,
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })

    storage.putNodeData("storyboard-acceptance", "book", {
      acceptedAt: new Date().toISOString(),
    })

    if (options.withRendering) {
      storage.putNodeData("web-rendering", pageId, {
        sections: options.renderingSections ?? [],
      })
    }
  } finally {
    storage.close()
  }

  return pageId
}

describe("ProofRunner", () => {
  const runner = createProofRunner()
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("errors when a page has no web-rendering row", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-runner-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    const label = "missing-rendering"
    seedBook(booksDir, label, { withRendering: false })

    await expect(
      runner.run(
        label,
        {
          booksDir,
          apiKey: "sk-test",
          promptsDir,
          configPath,
        },
        { emit: () => {} }
      )
    ).rejects.toThrow("Missing web-rendering output for page")
  })

  it("treats empty web-rendering as noop and writes empty image-captioning output", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-runner-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    const label = "empty-rendering"
    const pageId = seedBook(booksDir, label, {
      withRendering: true,
      renderingSections: [],
    })

    await runner.run(
      label,
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
      },
      { emit: () => {} }
    )

    const storage = createBookStorage(label, booksDir)
    try {
      const result = storage.getLatestNodeData("image-captioning", pageId)
      expect(result).not.toBeNull()
      expect(result?.data).toEqual({ captions: [] })

      // Glossary should also be generated (empty since no text content)
      const glossary = storage.getLatestNodeData("glossary", "book")
      expect(glossary).not.toBeNull()
      const glossaryData = glossary?.data as { items: unknown[]; pageCount: number }
      expect(glossaryData.items).toEqual([])
      expect(glossaryData.pageCount).toBe(0)
    } finally {
      storage.close()
    }
  })

  it("generates glossary from rendered HTML text", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-runner-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    // Copy glossary prompt so proof runner can render it
    fs.copyFileSync(
      path.join(process.cwd(), "prompts", "glossary.liquid"),
      path.join(promptsDir, "glossary.liquid")
    )

    const label = "glossary-test"
    seedBook(booksDir, label, {
      withRendering: true,
      renderingSections: [
        { sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>The forest is green</p>" },
      ],
    })

    // Pre-populate LLM cache so test doesn't need a real API key
    const pageTexts = [{ pageNumber: 1, text: "The forest is green" }]
    const promptEngine = createPromptEngine(promptsDir)
    const rendered = await promptEngine.renderPrompt("glossary", {
      language: "en",
      pages: pageTexts,
    })
    const systemMsg = rendered.find((m) => m.role === "system")
    const system = typeof systemMsg?.content === "string" ? systemMsg.content : undefined
    const messages = rendered.filter((m) => m.role !== "system")
    const bookCacheDir = path.join(booksDir, label, ".cache")
    const hash = computeHash({
      modelId: "openai:gpt-4.1",
      system,
      messages,
      schema: glossaryLLMSchema,
    })
    writeCache(bookCacheDir, hash, {
      reasoning: "test",
      items: [
        { word: "Forest", definition: "A large area with trees", variations: ["forests"], emojis: ["🌲"] },
      ],
    })

    const events: Array<{ type: string; step?: string }> = []
    await runner.run(
      label,
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
      },
      {
        emit: (event) => {
          events.push(event)
        },
      }
    )

    // Verify glossary step emitted progress events
    const glossaryEvents = events.filter((e) => e.step === "glossary")
    expect(glossaryEvents.some((e) => e.type === "step-start")).toBe(true)
    expect(glossaryEvents.some((e) => e.type === "step-complete")).toBe(true)

    // Verify glossary was stored
    const storage = createBookStorage(label, booksDir)
    try {
      const glossary = storage.getLatestNodeData("glossary", "book")
      expect(glossary).not.toBeNull()
      const data = glossary?.data as { items: Array<{ word: string }>; pageCount: number; generatedAt: string }
      expect(data.items).toHaveLength(1)
      expect(data.items[0].word).toBe("Forest")
      expect(data.pageCount).toBe(1)
      expect(data.generatedAt).toBeTruthy()
    } finally {
      storage.close()
    }
  })
})

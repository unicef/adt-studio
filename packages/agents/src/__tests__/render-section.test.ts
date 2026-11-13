import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { renderSyntheticActivity } from "../tools/render-section.js"

// The renderer builds its own model client; capture the prompt context it is
// given instead of calling a provider.
const seen = vi.hoisted(() => ({ contexts: [] as Array<Record<string, unknown>> }))
vi.mock("@adt/llm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@adt/llm")>()),
  createLLMModel: () => ({
    generateObject: async (opts: { context?: Record<string, unknown> }) => {
      seen.contexts.push(opts.context ?? {})
      return {
        object: {
          reasoning: "test",
          content: '<section data-section-type="text_only" data-section-id="pg001_sec002"><p data-id="pg001_tx900">Text</p></section>',
        },
      }
    },
  }),
}))

const roots: string[] = []
afterEach(() => {
  seen.contexts.length = 0
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

async function pageDirectionFor(sourceLanguage: string, outputLanguages: string[]): Promise<unknown> {
  seen.contexts.length = 0
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-agents-render-"))
  roots.push(root)
  const storage = createBookStorage("test-book", root)
  try {
    storage.putNodeData("metadata", "book", { title: "Test", language_code: sourceLanguage })
    fs.writeFileSync(
      path.join(root, "test-book", "config.yaml"),
      `output_languages:\n${outputLanguages.map((code) => `  - ${code}`).join("\n")}\n`,
    )
    await renderSyntheticActivity({
      storage,
      bookLabel: "test-book",
      booksDir: root,
      promptsDir: path.resolve(process.cwd(), "prompts"),
      configPath: path.resolve(process.cwd(), "config.yaml"),
      anchorPageId: "pg001",
      sectionIndex: 1,
      sectionId: "pg001_sec002",
      sectionType: "text_only",
      nodes: [{ nodeId: "pg001_tx900", isPruned: false, role: "section_text", text: "Text" }],
      credentials: {},
    })
  } finally {
    storage.close()
  }
  expect(seen.contexts).toHaveLength(1)
  return seen.contexts[0].page_direction
}

describe("renderSyntheticActivity", () => {
  // SPEC-0024: the section an agent creates is rendered through the same
  // prompts as the Storyboard, so it has to be told the same direction.
  it("AC-11: tells the prompt the page direction of a book with a right-to-left language", async () => {
    expect(await pageDirectionFor("ur", ["ur"])).toBe("rtl")
    expect(await pageDirectionFor("en", ["en", "ur"])).toBe("ltr")
  })

  it("AC-11: tells the prompt nothing for a book with no right-to-left language", async () => {
    expect(await pageDirectionFor("en", ["en", "fr"])).toBe("")
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage, writeSectioningLifecycle } from "@adt/storage"
import { reRenderPage } from "./page-edit-service.js"

const fetchMock = vi.fn()
const label = "fresh-book"
const pageId = "pg001"
const sectionId = "pg001_sec002"
const neighbor = { sectionIndex: 0, sectionType: "text", reasoning: "manual",
  html: '<section data-section-id="pg001_sec001"><p>Keep custom neighbor</p></section>' }
let booksDir: string

function options(prompt?: string) {
  return { label, pageId, sectionIndex: 1, prompt, booksDir,
    promptsDir: path.resolve("prompts"), configPath: path.resolve("config.yaml"),
    credentials: { openai: { apiKey: "test" } },
  }
}
function response(attempt: number) {
  const content = `<section data-section-type="text" data-section-id="${sectionId}" data-attempt="${attempt}"><p data-id="text-2">Source</p></section>`
  return new Response(JSON.stringify({ id: "chatcmpl-test", object: "chat.completion", created: 0, model: "gpt-4o-mini",
    choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ reasoning: "Fresh", content }) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }), { headers: { "Content-Type": "application/json" } })
}
function readState() {
  const storage = createBookStorage(label, booksDir)
  try {
    return {
      source: storage.getLatestNodeData("page-sectioning", pageId),
      rendering: storage.getLatestNodeData("web-rendering", pageId),
      translation: storage.getLatestNodeData("text-catalog-translation", "es"),
      steps: storage.getStepRuns(),
    }
  } finally { storage.close() }
}
beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "rerender-fresh-"))
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({ pageId, pageNumber: 1, text: "Source", images: [],
      pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("retained-image"), format: "png", hash: "test", width: 100, height: 100 },
    })
    storage.putNodeData("page-sectioning", pageId, { reasoning: "Source", sections: [1, 2].map((n) => ({
      sectionId: `pg001_sec00${n}`, sectionType: "text", backgroundColor: "#fff", textColor: "#000", pageNumber: 1, isPruned: false,
      nodes: [{ nodeId: `text-${n}`, role: "text", text: "Source", isPruned: false }],
    })) })
    storage.putNodeData("web-rendering", pageId, { sections: [neighbor,
      { ...neighbor, sectionIndex: 1, html: `<section data-section-id="${sectionId}"><p data-id="text-2">Source</p></section>` },
    ] })
    storage.putNodeData("text-catalog-translation", "es", { manual: "preserve on failure" })
    storage.markStepCompleted("catalog-translation")
  } finally { storage.close() }
  writeSectioningLifecycle(path.join(booksDir, label), "dynamic", true)
  fs.writeFileSync(path.join(booksDir, label, "config.yaml"), "default_model: openai:gpt-4o-mini\ndefault_render_strategy: llm\nrender_strategies:\n  llm:\n    render_type: llm\n    config:\n      prompt: web_generation_html\n      max_retries: 0\n      visual_refinement:\n        enabled: false\n")
})
afterEach(() => {
  vi.unstubAllGlobals()
  fs.rmSync(booksDir, { recursive: true, force: true })
})

describe("explicit rerender with real storage, rendering and LLM cache", () => {
  it.each([undefined, "Make the layout clearer"])("makes fresh transport requests for repeated instructions: %s", async (prompt) => {
    const before = readState()
    fetchMock.mockResolvedValueOnce(response(1)).mockResolvedValueOnce(response(2))
    const first = await reRenderPage(options(prompt))
    const second = await reRenderPage(options(prompt))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(second.version).toBe(first.version + 1)
    const rendering = second.rendering as { sections: typeof neighbor[] }
    expect(rendering.sections[0]).toEqual(neighbor)
    expect(rendering.sections[1].html).toContain('data-attempt="2"')
    expect(readState().source).toEqual(before.source)
    const cached = fs.readdirSync(path.join(booksDir, label, ".cache")).map((file) => fs.readFileSync(path.join(booksDir, label, ".cache", file), "utf8"))
    expect(cached.join("\n")).toContain('data-attempt=\\"2\\"')
  })

  it("retains source, rendering, downstream data and completion when a fresh provider request fails", async () => {
    const before = readState()
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"denied"}}', { status: 401 }))
    await expect(reRenderPage(options())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readState()).toEqual(before)
  })
})

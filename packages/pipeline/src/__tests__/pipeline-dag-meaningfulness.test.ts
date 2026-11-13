import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import type { ImageClassificationOutput } from "@adt/types"

const transport = vi.hoisted(() => ({ generateObject: vi.fn(), signal: undefined as AbortSignal | undefined }))
// Isolate admission and the executor selection; keep the actual CLI executor,
// DAG, deduplication, cancellation and versioned storage. No provider is called.
vi.mock("../extraction-admission.js", async original => ({ ...await original<typeof import("../extraction-admission.js")>(), prepareExtractionAdmission: () => ({ outcome: "fresh" }) }))
vi.mock("../dag.js", async original => {
  const real = await original<typeof import("../dag.js")>()
  return { ...real, runPipelineDAG: (executors: Parameters<typeof real.runPipelineDAG>[0], progress: Parameters<typeof real.runPipelineDAG>[1], _stages: unknown, signal?: AbortSignal) =>
    real.runPipelineDAG(new Map([["image-meaningfulness", executors.get("image-meaningfulness")!]]), progress, ["extract"], signal) }
})
vi.mock("@adt/llm", async original => ({ ...await original<typeof import("@adt/llm")>(), createLLMModel: (options: { signal?: AbortSignal }) => {
  transport.signal = options.signal
  return { generateObject: transport.generateObject }
} }))
import { runFullPipeline } from "../pipeline-dag.js"

const roots: string[] = []
afterEach(() => { transport.generateObject.mockReset(); transport.signal = undefined; roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })) })

it.each([false, true])("the actual CLI deduplicates images while preserving cancellation, cancel=%s", async cancel => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dag-meaningfulness-")); roots.push(root)
  const configPath = path.join(root, "global.yaml"), pdfPath = path.join(root, "fixture.pdf")
  fs.writeFileSync(configPath, "default_model: ollama:fixture\nconcurrency: 1\nstructure_types: {}\nrole_types: {}\nimage_meaningfulness:\n  max_retries: 0\n")
  fs.writeFileSync(pdfPath, "admission isolated")
  const storage = createBookStorage("book", root)
  const pages = ["pg001", "pg002", "pg003"]
  for (const [index, pageId] of pages.entries()) {
    const image = (suffix: string, hash: string) => ({ imageId: `${pageId}_${suffix}`, buffer: Buffer.from(hash), format: "png" as const, hash, width: 300, height: 200 })
    storage.putExtractedPage({ pageId, pageNumber: index + 1, text: "", pageImage: image("page", pageId), images: [image("logo", "repeated-logo"), image("art", `${pageId}-art`)] })
    storage.putNodeData("image-filtering", pageId, { images: [
      { imageId: `${pageId}_page`, isPruned: true },
      { imageId: `${pageId}_logo`, isPruned: false },
      { imageId: `${pageId}_art`, isPruned: false },
    ] })
  }
  const before = pages.map(pageId => storage.getAllNodeVersions("image-filtering", pageId))
  storage.close()
  const abort = new AbortController(), sent: string[][] = []
  transport.generateObject.mockImplementation(async (options: { context: { images: Array<{ imageId: string }> } }) => {
    expect(transport.signal).toBe(abort.signal)
    sent.push(options.context.images.map(image => image.imageId))
    if (cancel) abort.abort()
    return { object: { images: options.context.images.map(image => ({ image_id: image.imageId, reasoning: "fixture", is_meaningful: !image.imageId.endsWith("_logo") })) }, usage: { inputTokens: 1, outputTokens: 1 } }
  })
  const result = await runFullPipeline({ label: "book", booksRoot: root, pdfPath, configPath, promptsDir: path.resolve("prompts"), templatesDir: path.resolve("templates"), configDir: path.resolve("config"), signal: abort.signal })
  expect(result.steps.statuses.get("image-meaningfulness")).toBe(cancel ? "failed" : "complete")
  const reopened = createBookStorage("book", root)
  try {
    if (cancel) {
      expect(sent).toHaveLength(1)
      expect(pages.map(pageId => reopened.getAllNodeVersions("image-filtering", pageId))).toEqual(before)
    } else {
      expect(sent.map(images => [...images].sort())).toEqual([["pg001_art", "pg001_logo"], ["pg002_art"], ["pg003_art"]])
      for (const pageId of pages) {
        const saved = reopened.getLatestNodeData("image-filtering", pageId)!.data as ImageClassificationOutput
        expect(saved.images.find(image => image.imageId === `${pageId}_logo`)?.isPruned).toBe(true)
        expect(saved.images.find(image => image.imageId === `${pageId}_art`)?.isPruned).toBe(false)
        expect(reopened.getAllNodeVersions("image-filtering", pageId)).toEqual(expect.arrayContaining(before[pages.indexOf(pageId)]))
      }
    }
  } finally { reopened.close() }
})

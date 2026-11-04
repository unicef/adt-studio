// Adapted from the independent Codex C1 reproduction (November 3).
// Real DAG, storage, Sectioning/translation validators and provider transport;
// extraction admission is isolated so this does not claim PDF resume coverage.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it, vi } from "vitest"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import type { StructuredTextRequest } from "@adt/llm"

const transport = vi.hoisted(() => ({
  calls: [] as StructuredTextRequest[],
  beforeSecond: () => {},
  ending: "failure" as "failure" | "cancel",
}))
vi.mock("../extraction-admission.ts", async (original) => ({
  ...await original<typeof import("../extraction-admission.js")>(),
  prepareExtractionAdmission: () => ({ outcome: "fresh" }),
}))
vi.mock("../dag.ts", async (original) => {
  const real = await original<typeof import("../dag.js")>()
  return { ...real, runPipelineDAG: (executors: Parameters<typeof real.runPipelineDAG>[0], progress: Parameters<typeof real.runPipelineDAG>[1]) => real.runPipelineDAG(executors, progress, ["sectioning"]) }
})
vi.mock("@adt/llm", async (original) => {
  const real = await original<typeof import("@adt/llm")>()
  return { ...real, createLLMModel: (options: Parameters<typeof real.createLLMModel>[0]) => real.createLLMModel({
    ...options,
    registry: real.createProviderRegistry().register({
      manifest: { id: "review", displayName: "review", modalities: ["structured-text"], credentialFields: [], defaultModels: { "structured-text": "stub" }, capabilities: { "structured-text": { strategies: ["native-schema"], recursiveSchemas: true, imageInput: true, temperature: false } } },
      credentialSchema: z.object({}),
      cacheFingerprint: () => ({ adapterVersion: "1", configurableOrigin: true }),
      createStructuredTextBackend: () => ({
        generateStructured: async <T>(request: StructuredTextRequest) => {
          transport.calls.push(request)
          const prompt = JSON.stringify([request.system, request.messages])
          if (prompt.includes("SECOND PAGE")) {
            transport.beforeSecond()
            if (transport.ending === "failure") throw new Error("controlled second-page transport failure")
          }
          const object = prompt.includes("expert translator")
            ? { translations: ["Première page réussie"] }
            : { reasoning: "valid", sections: [{ section_type: "text_only", background_color: "white", text_color: "black", page_number: 2, nodes: [{ role: "text", text: "Successful first page" }] }] }
          return { object: object as T, usage: { inputTokens: 7, outputTokens: 9 } }
        },
      }),
    }).freeze(),
  }) }
})
import { runFullPipeline } from "../pipeline-dag.js"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

it.each([false, true].flatMap(translate => ["failure", "cancel"].map(ending => ({ translate, ending: ending as "failure" | "cancel" }))))(
  "fresh DAG commits each complete page before later $ending, translation=$translate",
  async ({ translate, ending }) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dag-sectioning-publication-"))
    roots.push(root)
    const label = "fresh", configPath = path.join(root, "global.yaml"), pdfPath = path.join(root, "fixture.pdf")
    fs.writeFileSync(pdfPath, "extraction admission is isolated in this executor test")
    fs.writeFileSync(configPath, `default_model: review:stub\nconcurrency: 1\nstructure_types:\n  paragraph: Paragraph\nrole_types:\n  text: Text\nsection_types:\n  text_only: Text\npage_sectioning:\n  mode: page\n  max_retries: 0\n  max_refinements: 0\ntranslation:\n  max_retries: 0\n${translate ? "editing_language: fr\n" : ""}`)
    const storage = createBookStorage(label, root)
    for (const n of [2, 7]) {
      const id = `p${n}`
      storage.putExtractedPage({ pageId: id, pageNumber: n, text: n === 7 ? "SECOND PAGE" : "Successful first page", images: [], pageImage: { imageId: id + "_page", buffer: Buffer.from("pixels"), hash: "test", format: "png", width: 4, height: 6 } })
      storage.putNodeData("image-filtering", id, { images: [] })
    }
    storage.putNodeData("metadata", "book", { language_code: "en" })
    storage.putNodeData("book-outline", "book", { entries: [], styleClusters: [], reasoning: "fixture" })
    const pagesBefore = storage.getPages()
    storage.close()
    const controller = new AbortController()
    let publishedBeforeSecond: unknown
    transport.calls = []
    transport.ending = ending
    transport.beforeSecond = () => {
      const reader = createBookStorage(label, root)
      try { publishedBeforeSecond = reader.getLatestNodeData("page-sectioning", "p2")?.data }
      finally { reader.close() }
      if (ending === "cancel") controller.abort()
    }
    const result = await runFullPipeline({ label, booksRoot: root, pdfPath, configPath, promptsDir: path.resolve("prompts"), templatesDir: path.resolve("templates"), signal: controller.signal })
    const after = createBookStorage(label, root)
    try {
      expect(publishedBeforeSecond).toMatchObject({ source: "ai" })
      expect(JSON.stringify(publishedBeforeSecond)).toContain(translate ? "Première page réussie" : "Successful first page")
      expect(after.getAllNodeVersions("page-sectioning", "p2")).toHaveLength(1)
      expect(after.getLatestNodeData("page-sectioning", "p2")?.data).toEqual(publishedBeforeSecond)
      expect(after.getLatestNodeData("page-sectioning", "p7")).toBeNull()
      expect(after.getPages()).toEqual(pagesBefore)
      expect(result.steps.statuses.get("page-sectioning")).toBe("failed")
      expect(result.steps.statuses.get("translation")).toBe("skipped")
      expect(transport.calls).toHaveLength(translate ? 3 : 2)
    } finally { after.close() }
  },
)

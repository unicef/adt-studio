import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import { createBookStorage } from "@adt/storage"
import { runFullPipeline } from "../pipeline-dag.js"
import type { StepExecutor } from "../dag.js"
import type { StepName } from "@adt/types"

const state = vi.hoisted(() => ({ root: "" }))
vi.mock("../page-sectioning.js", async (original) => ({ ...await original<typeof import("../page-sectioning.js")>(), sectionPage: async () => ({ reasoning: "fixture", sections: [{ sectionId: "pg001_sec001", sectionType: "text_only", backgroundColor: "white", textColor: "black", pageNumber: 1, isPruned: false, nodes: [] }] }) }))
vi.mock("../toc-generation.js", async (original) => ({ ...await original<typeof import("../toc-generation.js")>(), generateToc: async () => ({ entries: [], pageCount: 1, generatedAt: "fixture" }) }))
vi.mock("../quiz-generation.js", async (original) => ({ ...await original<typeof import("../quiz-generation.js")>(), generateAllQuizzes: async () => ({ generatedAt: "fixture", language: "en", pagesPerQuiz: 1, quizzes: [{ quizIndex: 0, afterPageId: "pg001", pageIds: ["pg001"], question: "Generated", reasoning: "", answerIndex: 0, options: [{ text: "A", explanation: "" }, { text: "B", explanation: "" }, { text: "C", explanation: "" }] }] }) }))
vi.mock("@adt/llm", async (original) => ({ ...await original<typeof import("@adt/llm")>(), createLLMModel: () => ({ generateObject: async () => ({ object: { translations: ["Bonjour"] } }) }) }))
// Exercise the actual registered CLI persistence executors on a fresh extracted
// fixture. This does not claim full CLI rerun preservation or a PDF acceptance run.
vi.mock("../dag.js", async (original) => ({ ...await original<typeof import("../dag.js")>(), runPipelineDAG: async (executors: Map<StepName, StepExecutor>) => {
  const storage = createBookStorage("cli-authorship", state.root)
  storage.putExtractedPage({ pageId: "pg001", pageNumber: 1, text: "Hello", images: [], pageImage: { imageId: "pg001_page", buffer: Buffer.from("fixture"), format: "png", hash: "fixture", width: 1, height: 1 } })
  storage.putNodeData("image-filtering", "pg001", { images: [] })
  storage.putNodeData("metadata", "book", { language_code: "en" })
  storage.putNodeData("web-rendering", "pg001", { sections: [{ sectionIndex: 0, sectionType: "text_only", html: '<p data-id="pg001_t001">Hello</p>', reasoning: "" }] })
  storage.putNodeData("text-catalog", "book", { entries: [{ id: "pg001_t001", text: "Hello" }], generatedAt: "fixture" })
  storage.close()
  for (const name of ["page-sectioning", "quiz-generation", "toc-generation", "catalog-translation"] as const) await executors.get(name)!({ emit() {} })
  return { statuses: new Map(), errors: new Map() }
} }))

it("stamps AI authorship on all four CLI writers without asserting destructive rerun support", async () => {
  state.root = fs.mkdtempSync(path.join(os.tmpdir(), "cli-authorship-"))
  try {
    const configPath = path.join(state.root, "config.yaml"), pdfPath = path.join(state.root, "fixture.pdf")
    fs.writeFileSync(pdfPath, "fixture")
    fs.writeFileSync(configPath, "default_model: ollama:tinyllama\nstructure_types: {}\nrole_types: {}\noutput_languages: [en, fr]\n")
    await runFullPipeline({ label: "cli-authorship", booksRoot: state.root, pdfPath, configPath, promptsDir: path.resolve("prompts"), templatesDir: path.resolve("templates") })
    const storage = createBookStorage("cli-authorship", state.root)
    try {
      expect(storage.getLatestNodeData("page-sectioning", "pg001")!.data).toMatchObject({ source: "ai" })
      expect(storage.getLatestNodeData("toc-generation", "book")!.data).toMatchObject({ source: "ai" })
      expect(storage.getLatestNodeData("quiz-generation", "book")!.data).toMatchObject({ quizzes: [expect.objectContaining({ source: "ai" })] })
      expect(storage.getLatestNodeData("text-catalog-translation", "fr")!.data).toMatchObject({ entries: [expect.objectContaining({ source: "ai" })] })
    } finally { storage.close() }
  } finally { fs.rmSync(state.root, { recursive: true, force: true }) }
})

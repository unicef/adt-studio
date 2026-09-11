import { beforeEach, afterEach, describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { buildTextCatalog, packageAdtWeb, saveQuizOutput } from "@adt/pipeline"
import { formatQuizId, type Quiz, type QuizGenerationOutput } from "@adt/types"
import { createQuizRoutes } from "./quizzes.js"
import { createAdtPreviewRoutes } from "./adt-preview.js"
import { errorHandler } from "../middleware/error-handler.js"
import { createDebugRoutes } from "./debug.js"
import { makeBeforeRun } from "./stages.js"
import { createStageRunner } from "../services/stage-runner.js"

// Only the remote model is stubbed. Generation, routes, SQLite, catalog,
// HTML rendering and packaging remain production implementations.
vi.mock("@adt/llm", async (importOriginal) => {
  const original = await importOriginal<typeof import("@adt/llm")>()
  return {
    ...original,
    createLLMModel: () => ({
      generateObject: generateObjectMock,
    }),
    createTTSSynthesizer: () => ({ synthesize: synthesizeMock }),
  }
})

const { generateObjectMock, synthesizeMock } = vi.hoisted(() => ({
  generateObjectMock: vi.fn(),
  synthesizeMock: vi.fn(),
}))
const generatedResponse = {
  object: {
    question: "New replacement question",
    reasoning: "review fixture",
    options: [
      { text: "a", explanation: "a-why" },
      { text: "b", explanation: "b-why" },
      { text: "c", explanation: "c-why" },
    ],
    answer_index: 0,
  },
}

const label = "quiz-identity"
let root: string
let app: Hono
let assets: string
let configPath: string
const quiz = (question: string, quizId?: string, afterPageId = "pg001"): Quiz => ({
  ...(quizId === undefined ? {} : { quizId }), quizIndex: 0,
  afterPageId, pageIds: [afterPageId], question,
  options: ["a", "b", "c"].map((text) => ({ text, explanation: text + "-why" })),
  answerIndex: 0, reasoning: "review fixture",
})
const output = (quizzes: Quiz[]): QuizGenerationOutput => ({
  generatedAt: "2026-01-01T00:00:00.000Z", language: "en", pagesPerQuiz: 3, quizzes,
})
function useStorage<T>(fn: (s: ReturnType<typeof createBookStorage>) => T): T {
  const s = createBookStorage(label, root)
  try { return fn(s) } finally { s.close() }
}
function seed(quizzes: Quiz[]) {
  useStorage((s) => s.putNodeData("quiz-generation", "book", output(quizzes)))
}
function stored(): QuizGenerationOutput {
  return useStorage((s) => s.getLatestNodeData("quiz-generation", "book")!.data as QuizGenerationOutput)
}
async function put(quizzes: Quiz[]) {
  return app.request(`/books/${label}/quizzes`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(output(quizzes)),
  })
}
async function exportBook() {
  const storage = createBookStorage(label, root)
  try {
    return await packageAdtWeb(storage, {
      bookDir: path.join(root, label), label, language: "en", outputLanguages: ["en"],
      title: "Review book", webAssetsDir: assets,
    })
  } finally { storage.close() }
}
beforeEach(() => {
  generateObjectMock.mockReset().mockResolvedValue(generatedResponse)
  synthesizeMock.mockReset().mockImplementation(async ({ input }: { input: string }) => Buffer.from(`AUDIO-FIXTURE: ${input}`))
  root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-quiz-identity-"))
  configPath = path.join(root, "config.yaml")
  fs.writeFileSync(configPath, "role_types: { section_text: Text }\nstructure_types: { paragraph: Paragraph }\nediting_language: en\nquiz_generation: { pages_per_quiz: 3 }\nspeech: { model: 'gpt-4o-mini-tts', voice: alloy }\n")
  assets = path.join(root, "assets")
  fs.mkdirSync(assets)
  for (const f of ["base.bundle.min.js", "base.bundle.local.js", "activities.bundle.local.js"]) {
    fs.writeFileSync(path.join(assets, f), "window.__review = true;")
  }
  fs.writeFileSync(path.join(assets, "fonts.css"), "body { font-family: serif; }")
  fs.writeFileSync(path.join(assets, "tailwind_css.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n")
  useStorage((s) => {
    for (let n = 1; n <= 2; n++) {
      const pageId = `pg00${n}`
      s.putExtractedPage({
        pageId, pageNumber: n, text: `Page ${n}`,
        pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("fixture"), format: "png", hash: `hash-${n}`, width: 100, height: 100 },
        images: [],
      })
      s.putNodeData("web-rendering", pageId, { sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "ok", html: `<div>Page ${n}</div>` }] })
      s.putNodeData("page-sectioning", pageId, {
        reasoning: "ok", sections: [{ sectionId: `${pageId}_sec001`, sectionType: "content", nodes: [], backgroundColor: "#fff", textColor: "#000", pageNumber: n, isPruned: false }],
      })
    }
  })
  app = new Hono()
  app.onError(errorHandler)
  app.route("/", createQuizRoutes(root, path.resolve("prompts"), configPath))
  app.route("/", createAdtPreviewRoutes(root, assets, configPath))
  app.route("/", createDebugRoutes(root, path.resolve("prompts"), configPath))
})
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

describe("quiz identity across API edits and exports", () => {
  it("does not give a legacy replacement the removed quiz's catalog and audio identity", async () => {
    seed([quiz("Original question"), quiz("Survivor", undefined, "pg002")])
    const audioDir = path.join(root, label, "audio/en")
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, "qz001_que.mp3"), "AUDIO-FIXTURE: Original question")
    useStorage((s) => {
      s.putNodeData("core-tts-catalog", "en", {
        language: "en", generatedAt: "2026-01-01T00:00:00.000Z", entries: [{
          id: "qz001_que", displayText: "Original question", speechText: "Original question",
          changed: false, transformations: [], status: "ready",
          generation: { mode: "unchanged", generatedAt: "2026-01-01T00:00:00.000Z", enabledTransformations: [], sourceTextHash: "old-source", contextHash: "old-context" },
        }],
      })
      s.putNodeData("tts", "en", { entries: [{ textId: "qz001_que", language: "en", fileName: "qz001_que.mp3", voice: "alloy", model: "gpt-4o-mini-tts", cached: false }] })
    })
    const res = await app.request(`/books/${label}/quizzes/generate-one`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: ["pg001"], afterPageId: "pg001", placement: "replace" }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).quiz.quizId).toBe("qz003")
    const s = createBookStorage(label, root)
    let catalog
    try { catalog = await buildTextCatalog(s, []) } finally { s.close() }
    const questions = catalog.entries.filter((e) => e.id.endsWith("_que"))
    await exportBook()
    const locale = path.join(root, label, "adt/content/i18n/en")
    const texts = JSON.parse(fs.readFileSync(path.join(locale, "texts.json"), "utf8"))
    const audioMap = JSON.parse(fs.readFileSync(path.join(locale, "audios.json"), "utf8"))
    expect(texts.qz003_que).toBe("New replacement question")
    expect(audioMap.qz003_que).toBeUndefined()
    expect(fs.readFileSync(path.join(audioDir, "qz001_que.mp3"), "utf8")).toBe("AUDIO-FIXTURE: Original question")
    expect(questions).not.toContainEqual({ id: "qz001_que", text: "New replacement question" })
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz003", "qz002"])
  })

  it("rejects duplicate quiz identities instead of silently overwriting one export page", async () => {
    const res = await put([quiz("First question", "qz001"), quiz("Second question", "qz001", "pg002")])
    expect(res.status).toBe(400)
  })

  it("does not let an API quizId overwrite a file outside the book during export", async () => {
    const outside = path.join(root, "outside-book.html")
    fs.writeFileSync(outside, "original outside-book content")
    const res = await put([quiz("Traversal question", "../../outside-book")])
    expect(res.status).toBe(400)
    expect(useStorage((s) => s.getLatestNodeData("quiz-generation", "book"))).toBeNull()
    expect(fs.readFileSync(outside, "utf8")).toBe("original outside-book content")
  })

  it("preserves identities when a legacy API client submits the same id-less payload twice", async () => {
    seed([quiz("One"), quiz("Two", undefined, "pg002")])
    const legacyBody = stored().quizzes
    expect((await put(legacyBody)).status).toBe(200)
    const firstIds = stored().quizzes.map((q) => q.quizId)
    expect((await put(legacyBody)).status).toBe(200)
    const secondIds = stored().quizzes.map((q) => q.quizId)
    expect(secondIds).toEqual(firstIds)
  })

  it("previews sparse stable ids, serves the matching manifest, and 404s a retired id", async () => {
    seed([quiz("First sparse question", "qz004"), quiz("Second sparse question", "qz003", "pg002")])
    const pages = await app.request(`/books/${label}/adt-preview/content/pages.json`)
    expect(pages.status).toBe(200)
    expect(await pages.json()).toEqual(expect.arrayContaining([
      { section_id: "qz004", href: "qz004.html" }, { section_id: "qz003", href: "qz003.html" },
    ]))
    const preview = await app.request(`/books/${label}/adt-preview/qz004.html`)
    expect(preview.status).toBe(200)
    expect(await preview.text()).toContain("First sparse question")
    expect((await app.request(`/books/${label}/adt-preview/qz001.html`)).status).toBe(404)
  })
})

async function runStage(stage: "quizzes" | "speech") {
  await createStageRunner().run(label, {
    booksDir: root, promptsDir: path.resolve("prompts"), configPath,
    credentials: { openai: { apiKey: "test-fixture" } }, fromStage: stage, toStage: stage,
  }, { emit: () => {} })
}

function history() {
  return useStorage((s) => s.getAllNodeVersions("quiz-generation", "book"))
}

describe("quiz identity validation and legacy compatibility", () => {
  it.each(["qz000", "qz1", "qz1000", "", "../qz001", "qz001\n", "qz001\r"])("rejects noncanonical id %j without a version write", async (id) => {
    seed([quiz("Original", "qz001")])
    expect((await put([quiz("Changed", id)])).status).toBe(400)
    expect(history()).toHaveLength(1)
    expect(stored().quizzes[0].question).toBe("Original")
  })

  it.each([
    [quiz("Unsafe", "../../outside-book")],
    [quiz("First", "qz001"), quiz("Collision", "qz001")],
    [quiz("Explicit", "qz002"), quiz("Legacy collision")],
  ])("rejects corrupt imported identities before touching an existing export (%#)", async (...quizzes) => {
    seed(quizzes)
    const adt = path.join(root, label, "adt")
    fs.mkdirSync(adt)
    fs.writeFileSync(path.join(adt, "index.html"), "previous successful export")
    const outside = path.join(root, "outside-book.html")
    fs.writeFileSync(outside, "outside original")
    await expect(exportBook()).rejects.toThrow(/quiz id/i)
    expect(fs.readFileSync(path.join(adt, "index.html"), "utf8")).toBe("previous successful export")
    expect(fs.readFileSync(outside, "utf8")).toBe("outside original")
    const storage = createBookStorage(label, root)
    try { await expect(buildTextCatalog(storage, [])).rejects.toThrow(/quiz id/i) }
    finally { storage.close() }
    expect((await app.request(`/books/${label}/adt-preview/content/pages.json`)).status).toBe(500)
  })

  it("rejects ambiguous ID-less content edits but permits an explicit edit", async () => {
    seed([quiz("Original")])
    expect((await put([quiz("Changed")])).status).toBe(400)
    expect(history()).toHaveLength(1)
    expect((await put([quiz("Changed", "qz001")])).status).toBe(200)
    expect(stored().quizzes[0]).toMatchObject({ question: "Changed", quizId: "qz001" })
  })

  it("preserves legacy identities through deletion, reordering, retry and append", async () => {
    const quizzes = [quiz("One"), quiz("Two"), quiz("Three")]
    seed(quizzes)
    const reordered = [quizzes[2], quizzes[1]]
    expect((await put(reordered)).status).toBe(200)
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz003", "qz002"])
    expect((await put([...reordered, quiz("Four")])).status).toBe(200)
    expect((await put([...reordered, quiz("Four")])).status).toBe(200)
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz003", "qz002", "qz004"])
    expect(stored().quizzes.map((q) => q.quizIndex)).toEqual([0, 1, 2])
    expect((await put([quiz("Cannot resurrect", "qz001")])).status).toBe(400)
  })

  it("accepts exact ID-less retries even when the unchanged set contains identical quizzes", async () => {
    const original = [quiz("Same"), quiz("Same")]
    seed(original)
    expect((await put(original)).status).toBe(200)
    expect((await put(original)).status).toBe(200)
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz001", "qz002"])
  })

  it("rejects ID-less duplicate-content ambiguity instead of guessing identity", async () => {
    seed([quiz("Same"), quiz("Same")])
    expect((await put([quiz("Same")])).status).toBe(400)
    expect(history()).toHaveLength(1)
  })

  it("does not let PUT race an active full-stage generation", async () => {
    seed([quiz("Original", "qz001")])
    useStorage((s) => s.markStepStarted("quiz-generation"))
    expect((await put([quiz("Changed", "qz001")])).status).toBe(409)
    expect(history()).toHaveLength(1)
  })

  it("rechecks stage activity after the generate-one model call completes", async () => {
    seed([quiz("Original", "qz001")])
    generateObjectMock.mockImplementationOnce(async () => {
      useStorage((s) => s.markStepStarted("quiz-generation"))
      return generatedResponse
    })
    const response = await app.request(`/books/${label}/quizzes/generate-one`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: ["pg001"], afterPageId: "pg001", placement: "replace" }),
    })
    expect(response.status).toBe(409)
    expect(history()).toHaveLength(1)
  })

  it("fails allocation atomically when all 999 identities are spent", async () => {
    seed(Array.from({ length: 999 }, (_, i) => quiz(`Question ${i}`, formatQuizId(i + 1))))
    expect((await put([])).status).toBe(200)
    expect((await put([quiz("New")])).status).toBe(400)
    expect(history()).toHaveLength(2)
    expect(stored().quizzes).toEqual([])
  })

  it("normalizes history comparison without rewriting legacy debug data", async () => {
    seed([quiz("One"), quiz("Two")])
    expect((await put(stored().quizzes))).toHaveProperty("status", 200)
    const url = `/books/${label}/debug/versions/quiz-generation/book?includeData=true`
    const raw = await (await app.request(url)).json()
    expect(raw.versions[1].data.quizzes[0].quizId).toBeUndefined()
    const resolved = await (await app.request(`${url}&resolveQuizIds=true`)).json()
    expect(resolved.versions[1].data.quizzes.map((q: Quiz) => q.quizId)).toEqual(["qz001", "qz002"])
    expect(resolved.versions[0].data.quizzes).toEqual(resolved.versions[1].data.quizzes.map((q: Quiz, quizIndex: number) => ({ ...q, quizIndex })))
    expect(history()).toHaveLength(2)
    useStorage((s) => s.clearNodesByType(["quiz-generation"]))
    const cleared = await (await app.request(`${url}&resolveQuizIds=true`)).json()
    expect(cleared.versions[0].data).toBeNull()
    expect((await (await app.request(`/books/${label}/quizzes`)).json()).quizzes).toBeNull()
  })
})

describe("full-stage quiz regeneration", () => {
  it("allocates fresh IDs on each full rerun and after rollback, even for identical model output", async () => {
    seed([quiz("Legacy one"), quiz("Legacy two")])
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await runStage("quizzes")
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz003"])
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await runStage("quizzes")
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz004"])
    useStorage((s) => expect(s.setCurrentNodeVersion("quiz-generation", "book", 1)).toBe(true))
    expect(stored().quizzes[0].question).toBe("Legacy one")
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await runStage("quizzes")
    expect(stored().quizzes.map((q) => q.quizId)).toEqual(["qz005"])
    expect(history()).toHaveLength(4)
  })

  it("can regenerate corrupt imported identities while retaining their history", async () => {
    seed([quiz("First", "qz001"), quiz("Duplicate", "qz001")])
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await runStage("quizzes")
    expect(stored().quizzes[0].quizId).toBe("qz002")
    expect(history()).toHaveLength(2)
  })

  it("publishes an empty result if no pages remain eligible, without erasing history", async () => {
    seed([quiz("Original", "qz001")])
    useStorage((s) => s.clearNodesByType(["web-rendering"]))
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await runStage("quizzes")
    expect(stored().quizzes).toEqual([])
    expect(history()).toHaveLength(2)
    expect(generateObjectMock).not.toHaveBeenCalled()
  })

  it("does not replace prior output if a full rerun exhausts the ID space", async () => {
    seed(Array.from({ length: 999 }, (_, i) => quiz(`Question ${i}`, formatQuizId(i + 1))))
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await expect(runStage("quizzes")).rejects.toThrow("allocated all 999")
    expect(history()).toHaveLength(1)
    expect(stored().quizzes).toHaveLength(999)
  })

  it("reserves a removed legacy singleton and IDs from versions newer than a rollback", async () => {
    seed([quiz("Legacy")])
    seed([quiz("Newer", "qz002")])
    useStorage((s) => s.setCurrentNodeVersion("quiz-generation", "book", 1))
    const response = await app.request(`/books/${label}/quizzes/generate-one`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageIds: ["pg001"], afterPageId: "pg001", placement: "replace" }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).quiz.quizId).toBe("qz003")
    expect(stored().quizzes).toEqual([expect.objectContaining({ quizId: "qz003" })])
  })

  it("keeps the previous quiz output and history if full generation fails", async () => {
    seed([quiz("Original", "qz001")])
    generateObjectMock.mockRejectedValue(new Error("model unavailable"))
    makeBeforeRun(label, "quizzes", "quizzes", root)()
    await expect(runStage("quizzes")).rejects.toThrow("model unavailable")
    expect(stored().quizzes[0]).toMatchObject({ question: "Original", quizId: "qz001" })
    expect(history()).toHaveLength(1)
    expect(useStorage((s) => s.getStepRuns()).find((s) => s.step === "quiz-generation")?.status).toBe("error")
  })

  it("reserves IDs after upstream invalidation and a complete extraction reset", async () => {
    seed([quiz("One"), quiz("Two")])
    makeBeforeRun(label, "storyboard", "storyboard", root)()
    expect(useStorage((s) => s.getLatestNodeData("quiz-generation", "book"))).toBeNull()
    useStorage((s) => saveQuizOutput(s, output([quiz("Three")]), "replace"))
    expect(stored().quizzes[0].quizId).toBe("qz003")
    makeBeforeRun(label, "extract", "quizzes", root)()
    expect(useStorage((s) => s.getLatestNodeData("quiz-generation", "book"))).toBeNull()
    useStorage((s) => saveQuizOutput(s, output([quiz("Four")]), "replace"))
    expect(stored().quizzes[0].quizId).toBe("qz004")
    expect(history()).toHaveLength(5)
  })

  it("cannot reuse or overwrite old manual audio when the full run preserves the speech manifest", async () => {
    seed([quiz("Original question", "qz001")])
    const audioDir = path.join(root, label, "audio/en")
    fs.mkdirSync(audioDir, { recursive: true })
    fs.writeFileSync(path.join(audioDir, "qz001_que.mp3"), "ORIGINAL MANUAL RECORDING")
    useStorage((s) => s.putNodeData("tts", "en", { entries: [{
      textId: "qz001_que", language: "en", fileName: "qz001_que.mp3",
      voice: "manual", model: "manual", provider: "manual", voiceSlot: "primary", cached: false,
    }] }))
    makeBeforeRun(label, "quizzes", "speech", root)()
    expect(useStorage((s) => s.getLatestNodeData("tts", "en"))).not.toBeNull()
    await runStage("quizzes")
    expect(stored().quizzes[0].quizId).toBe("qz002")
    // Seed the intermediate ready catalog; the actual Speech runner, cache and
    // output writer execute below. Only the provider's audio bytes are stubbed.
    useStorage((s) => s.putNodeData("core-tts-catalog", "en", {
      language: "en", generatedAt: "2026-01-01T00:00:00.000Z", entries: [{
        id: "qz002_que", displayText: "New replacement question", speechText: "New replacement question",
        changed: false, transformations: [], status: "ready",
        generation: { mode: "unchanged", generatedAt: "2026-01-01T00:00:00.000Z", enabledTransformations: [], sourceTextHash: "new", contextHash: "new" },
      }],
    }))
    await runStage("speech")
    expect(synthesizeMock).toHaveBeenCalledWith(expect.objectContaining({ input: "New replacement question" }))
    expect(fs.readFileSync(path.join(audioDir, "qz002_que.mp3"), "utf8")).toBe("AUDIO-FIXTURE: New replacement question")
    expect(fs.readFileSync(path.join(audioDir, "qz001_que.mp3"), "utf8")).toBe("ORIGINAL MANUAL RECORDING")
    const tts = useStorage((s) => s.getLatestNodeData("tts", "en")!.data) as { entries: Array<{textId: string; provider: string}> }
    expect(tts.entries).toEqual([expect.objectContaining({ textId: "qz002_que", provider: "openai" })])
    useStorage((s) => s.setCurrentNodeVersion("quiz-generation", "book", 1))
    expect(stored().quizzes[0].question).toBe("Original question")
    expect(fs.readFileSync(path.join(audioDir, "qz001_que.mp3"), "utf8")).toBe("ORIGINAL MANUAL RECORDING")
  })
})

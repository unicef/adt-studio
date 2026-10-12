import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { runFullPipeline } from "../pipeline-dag.js"
import { loadBookConfig } from "../config.js"
import { readGenerationCatalog } from "../generation-catalog.js"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
const repository = path.resolve(import.meta.dirname, "../../../..")
const label = "book"
let root: string
let transport: ReturnType<typeof setupFullResumeFixture>["transport"]
let options: ReturnType<typeof setupFullResumeFixture>["options"]
let storage: ReturnType<typeof setupFullResumeFixture>["storage"]
let histories: ReturnType<typeof setupFullResumeFixture>["histories"]
let errors: ReturnType<typeof setupFullResumeFixture>["errors"]
beforeEach(() => { ({ root, transport, options, storage, histories, errors } = setupFullResumeFixture()) })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })
it("initial shared execution records generation evidence, then resumes every current source stage without calls or version churn", { timeout: 60000 }, async () => {
  const first = await runFullPipeline(options())
  expect(errors(first)).toEqual([])
  expect(first.resume?.status).toBe("complete")
  expect(transport.mock.calls.length).toBeGreaterThanOrEqual(4)
  const before = histories(), calls = transport.mock.calls.length
  const second = await runFullPipeline(options())
  expect(errors(second)).toEqual([])
  expect(second.resume?.outputs.every((output) => output.current || output.state === "skipped")).toBe(true)
  expect(transport).toHaveBeenCalledTimes(calls)
  expect(histories()).toEqual(before)
})
it("protects edited output and rejects a stale replacement decision", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const s = storage()
  const row = s.getLatestNodeData("web-rendering", "pg001")!
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "edit", html: "Manual" }] })
  const output = readGenerationCatalog({ storage: s, config: loadBookConfig(label, options().booksRoot, options().configPath), bookDir: s.bookDir!, promptsDir: options().promptsDir, templatesDir: options().templatesDir }).find((status) => status.identity.kind === "storyboard")!
  s.close()
  const before = histories(), calls = transport.mock.calls.length
  const result = await runFullPipeline(options())
  expect(result.resume?.status).toBe("incomplete")
  expect(result.resume?.outputs).toContainEqual(expect.objectContaining({ identity: output.identity, protected: true, state: "blocked" }))
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})
it("completes a whole book including a real bundle, then reuses all output and its file inventory", { timeout: 120000 }, async () => {
  const full = { ...options(), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  const first = await runFullPipeline(full)
  expect(errors(first)).toEqual([])
  expect(first.resume?.status).toBe("complete")
  expect(fs.existsSync(path.join(full.booksRoot, label, "adt/index.html"))).toBe(true)
  const before = histories(), calls = transport.mock.calls.length
  const second = await runFullPipeline(full)
  expect(errors(second)).toEqual([])
  expect(second.resume?.status).toBe("complete")
  expect(second.resume?.outputs.find((output) => output.identity.kind === "package")?.state).toBe("reused")
  expect(transport).toHaveBeenCalledTimes(calls)
  expect(histories()).toEqual(before)
})
it("cancellation during generation keeps previous source-stage content and does not publish evidence", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const before = histories(), controller = new AbortController(), response = transport.getMockImplementation()!
  fs.writeFileSync(path.join(root, "prompts/book_summary.liquid"), '{% chat role: "user" %}book_summary Changed{% endchat %}')
  transport.mockImplementation(async (...args) => { const result = await response(...args); controller.abort(); return result })
  const result = await runFullPipeline({ ...options(), signal: controller.signal })
  expect(result.resume?.status).toBe("cancelled")
  expect(histories()).toEqual(before)
  transport.mockImplementation(response)
  const restarted = await runFullPipeline(options())
  expect(errors(restarted)).toEqual([])
  expect(restarted.resume?.status).toBe("complete")
})
it("a downstream-only change leaves extraction and Sectioning versions untouched", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const before = histories()
  fs.appendFileSync(options().configPath, "\noutput_languages: [fr-FR]\n")
  const result = await runFullPipeline(options())
  expect(errors(result)).toEqual([])
  expect(histories()).toEqual(before)
})
it("rejects a publication when a direct concurrent writer changes content during a provider response", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const before = histories(), response = transport.getMockImplementation()!
  fs.writeFileSync(path.join(root, "prompts/book_summary.liquid"), '{% chat role: "user" %}book_summary concurrent{% endchat %}')
  transport.mockImplementation(async (...args) => {
    const result = await response(...args), s = storage()
    s.putNodeData("book-summary", "book", { summary: "Human correction" }); s.close()
    return result
  })
  const result = await runFullPipeline(options())
  expect(result.resume?.status).toBe("failed")
  expect(errors(result)[0]).toContain("changed")
  const s = storage()
  expect(s.getLatestNodeData("book-summary", "book")?.data).toEqual({ summary: "Human correction" })
  s.close()
  expect(histories().filter((entry) => entry.node !== "book-summary")).toEqual(before.filter((entry) => entry.node !== "book-summary"))
})
it("replaces reviewed protected Storyboard output, but rejects an obsolete decision without calls", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const s = storage(), row = s.getLatestNodeData("web-rendering", "pg001")!
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "edit", html: "Manual" }] })
  const reviewed = readGenerationCatalog({ storage: s, config: loadBookConfig(label, options().booksRoot, options().configPath), bookDir: s.bookDir!, promptsDir: options().promptsDir, templatesDir: options().templatesDir }).find((status) => status.identity.kind === "storyboard")!
  s.close()
  const outputScope = { selection: { identities: [reviewed.identity] }, replace: [{ identity: reviewed.identity, signature: reviewed.signature, contentHash: reviewed.contentHash, revision: reviewed.revision }] }
  const replaced = await runFullPipeline({ ...options(), fromStage: "storyboard", outputScope })
  expect(errors(replaced)).toEqual([])
  const before = histories(), calls = transport.mock.calls.length
  const obsolete = await runFullPipeline({ ...options(), fromStage: "storyboard", outputScope })
  expect(errors(obsolete)[0]).toContain("changed since review")
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})
it("a missing packaged asset rebuilds the bundle without provider calls and retains source histories", { timeout: 120000 }, async () => {
  const full = { ...options(), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const before = histories().filter((entry) => entry.node !== "accessibility-assessment"), calls = transport.mock.calls.length
  fs.unlinkSync(path.join(full.booksRoot, label, "adt/index.html"))
  const repaired = await runFullPipeline(full)
  expect(errors(repaired)).toEqual([])
  expect(fs.existsSync(path.join(full.booksRoot, label, "adt/index.html"))).toBe(true)
  expect(transport.mock.calls.slice(calls).filter(([url]) => /chat\/completions|audio\/speech/.test(String(url)))).toHaveLength(0)
  expect(histories().filter((entry) => entry.node !== "accessibility-assessment")).toEqual(before)
})
it("generates quiz and glossary source artifacts at the transport boundary and reuses them on a full rerun", { timeout: 120000 }, async () => {
  fs.appendFileSync(options().configPath, "\nquiz_generation: { pages_per_quiz: 1 }\n")
  // Replace the earlier key rather than rely on duplicate YAML mappings.
  fs.writeFileSync(options().configPath, fs.readFileSync(options().configPath, "utf8").replace("quiz_generation: { quiz_section_types: [] }\n", ""))
  fs.writeFileSync(path.join(root, "prompts/quiz_generation.liquid"), '{% chat role: "user" %}quiz_generation{% endchat %}')
  const response = transport.getMockImplementation()!
  transport.mockImplementation(async (url, init) => {
    const body = String(init?.body)
    const object = body.includes("quiz_generation") ? { reasoning: "fixture", question: "Who visits?", options: [{ text: "Raven", explanation: "Correct" }, { text: "Cat", explanation: "No" }, { text: "Dog", explanation: "No" }], answer_index: 0 }
      : body.includes("glossary") ? { reasoning: "fixture", items: [{ word: "raven", definition: "A bird.", variations: [], emojis: [] }] } : undefined
    if (object) return Response.json({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(object) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
    return response(url, init)
  })
  const full = { ...options(), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  const generated = await runFullPipeline(full)
  expect(errors(generated)).toEqual([])
  const s = storage()
  expect(s.getLatestNodeData("quiz-generation", "book")?.data).toMatchObject({ quizzes: [expect.objectContaining({ question: "Who visits?" })] })
  expect(s.getLatestNodeData("glossary", "book")?.data).toMatchObject({ items: [expect.objectContaining({ word: "raven" })] })
  s.close()
  expect(transport.mock.calls.some(([, init]) => String(init?.body).includes("quiz_generation"))).toBe(true)
  expect(transport.mock.calls.some(([, init]) => String(init?.body).includes("glossary"))).toBe(true)
  const before = histories(), calls = transport.mock.calls.length
  expect(errors(await runFullPipeline(full))).toEqual([])
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})

it("informational lifecycle records never require a bookkeeping rerun", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const { writeSectioningLifecycle, readSectioningLifecycle } = await import("@adt/storage")
  writeSectioningLifecycle(path.join(options().booksRoot, label), "page", false)
  const before = histories(), calls = transport.mock.calls.length
  expect(errors(await runFullPipeline(options()))).toEqual([])
  expect(readSectioningLifecycle(path.join(options().booksRoot, label))).toMatchObject({ sectioningReady: false })
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})

it.each(["fixed", "reflowable"])("completes %s part-window output and preserves it on full resume", { timeout: 120000 }, async (layout) => {
  const o = options()
  fs.writeFileSync(o.configPath, fs.readFileSync(o.configPath, "utf8").replace("start_page: 1", "start_page: 2").replace("end_page: 1", "end_page: 2").replace("render_type: template", `render_type: ${layout === "fixed" ? "fixed_layout" : "template"}`))
  fs.mkdirSync(path.join(o.booksRoot, label), { recursive: true })
  fs.writeFileSync(path.join(o.booksRoot, label, "part.json"), JSON.stringify({ adtPart: 1, sourceLabel: "source", title: null, range: { startPage: 2, endPage: 2 }, pageCount: 3, fingerprint: {}, identityHash: "i", semanticsHash: "s", createdAt: "now", partLabelSuggestion: "part" }))
  const response = transport.getMockImplementation()!
  transport.mockImplementation(async (...args) => {
    const result = await response(...args)
    if (!String(args[1]?.body).includes("page_sectioning")) return result
    const json = await result.json(), content = JSON.parse(json.choices[0].message.content)
    content.sections[0].page_number = 2
    json.choices[0].message.content = JSON.stringify(content)
    return Response.json(json)
  })
  const full = { ...o, toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  const result = await runFullPipeline(full)
  expect(errors(result)).toEqual([])
  expect(result.resume?.status).toBe("complete")
  const s = storage(); expect(s.getPages().map((page) => page.pageId)).toEqual(["pg002"]); s.close()
  const before = histories(), calls = transport.mock.calls.length
  expect(errors(await runFullPipeline(full))).toEqual([])
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})

it("the actual full CLI reuses the bundle without calls and exits nonzero for unresolved manual output", { timeout: 120000 }, async () => {
  const { spawnSync } = await import("node:child_process")
  const { pathToFileURL } = await import("node:url")
  fs.cpSync(path.join(repository, "templates"), path.join(root, "templates"), { recursive: true })
  fs.mkdirSync(path.join(root, "assets"))
  fs.symlinkSync(path.join(repository, "assets/adt"), path.join(root, "assets/adt"))
  const full = { ...options(), templatesDir: path.join(root, "templates"), toStage: "package" as const, webAssetsDir: path.join(root, "assets/adt") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const hook = path.join(root, "no-provider.mjs")
  fs.writeFileSync(hook, 'globalThis.fetch = async () => { process.stderr.write("UNEXPECTED_PROVIDER_REQUEST"); process.exit(79) }')
  const run = () => spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, path.join(repository, "packages/pipeline/dist/cli.js"), label, full.pdfPath, "--books-dir", full.booksRoot], { cwd: root, encoding: "utf8", timeout: 30000 })
  const before = histories(), complete = run()
  expect(complete.stderr + complete.stdout).not.toContain("UNEXPECTED_PROVIDER_REQUEST")
  expect(complete.status, complete.stderr + complete.stdout).toBe(0)
  expect(histories()).toEqual(before)
  const s = storage(), row = s.getLatestNodeData("web-rendering", "pg001")!
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), source: "manual" }); s.close()
  const retained = histories(), incomplete = run()
  expect(incomplete.status, incomplete.stderr + incomplete.stdout).toBe(1)
  expect(incomplete.stderr + incomplete.stdout).toContain('"reason":"protected"')
  expect(incomplete.stderr + incomplete.stdout).not.toContain("UNEXPECTED_PROVIDER_REQUEST")
  expect(histories()).toEqual(retained)
})


it("book regeneration cannot authorize replacement of a protected glossary term", { timeout: 60000 }, async () => {
  const full = { ...options(), toStage: "glossary" as const }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const s = storage()
  const previous = s.getLatestNodeData("glossary", "book")!
  s.putNodeData("glossary", "book", { ...(previous.data as object), items: [{ word: "authored", definition: "Human definition", source: "manual", variations: [], emojis: [] }] })
  const read = () => readGenerationCatalog({ storage: s, config: loadBookConfig(label, full.booksRoot, full.configPath), bookDir: s.bookDir!, promptsDir: full.promptsDir, templatesDir: full.templatesDir }).find((output) => output.identity.kind === "glossary")!
  const status = read(), count = s.getAllNodeVersions("glossary", "book").length
  const blocked = await runFullPipeline(full)
  expect(blocked.resume?.status).toBe("incomplete")
  expect(s.getAllNodeVersions("glossary", "book")).toHaveLength(count)
  const replaced = await runFullPipeline({ ...full, fromStage: "glossary", outputScope: { replace: [{ identity: status.identity, signature: status.signature, contentHash: status.contentHash, revision: status.revision }] } })
  expect(replaced.resume?.status).toBe("incomplete")
  expect(replaced.resume?.outputs).toContainEqual(expect.objectContaining({ identity: expect.objectContaining({ kind: "glossary", id: "gl001" }), protected: true, state: "blocked" }))
  expect(s.getLatestNodeData("glossary", "book")?.data).toMatchObject({ items: [expect.objectContaining({ word: "authored", source: "manual" })] })
  expect(s.getAllNodeVersions("glossary", "book")[count - 1].data).toMatchObject({ items: [expect.objectContaining({ word: "authored" })] })
  s.close()
})

it("full resume retains manual Core TTS, uploaded audio/video and their complete histories", { timeout: 60000 }, async () => {
  const full = { ...options(), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const s = storage(), core = s.getLatestNodeData("core-tts-catalog", "en")!.data as import("@adt/types").CoreTtsCatalogOutput
  const audio = s.getLatestNodeData("tts", "en")!.data as import("@adt/types").TTSOutput
  s.putNodeData("core-tts-catalog", "en", { ...core, entries: core.entries.map((entry) => ({ ...entry, speechText: "Human normalization", source: "manual", generation: { ...entry.generation, mode: "manual" } })) })
  fs.writeFileSync(path.join(s.bookDir!, "audio/en/manual.mp3"), "human recording")
  s.putNodeData("tts", "en", { ...audio, entries: audio.entries.map((entry) => ({ ...entry, source: "manual", fileName: "manual.mp3", provider: "manual", model: "manual", voice: "manual" })) })
  s.putSignLanguageVideo("uploaded", Buffer.from("human video"), "human.mp4", "video/mp4")
  s.assignSignLanguageVideo("uploaded", "pg001_sec001")
  const coreHistory = s.getAllNodeVersions("core-tts-catalog", "en"), audioHistory = s.getAllNodeVersions("tts", "en"), videos = s.getSignLanguageVideos()
  const before = histories(), calls = transport.mock.calls.length
  const result = await runFullPipeline(full)
  expect(result.resume?.status).toBe("incomplete")
  expect(s.getAllNodeVersions("core-tts-catalog", "en")).toEqual(coreHistory)
  expect(s.getAllNodeVersions("tts", "en")).toEqual(audioHistory)
  expect(s.getSignLanguageVideos()).toEqual(videos)
  expect(fs.readFileSync(path.join(s.bookDir!, "audio/en/manual.mp3"), "utf8")).toBe("human recording")
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
  s.close()
})

it("a missing runtime capability is rejected before initial extraction or provider work", async () => {
  const result = await runFullPipeline({ ...options(), toStage: "package" })
  expect(errors(result)[0]).toContain("runtime assets")
  expect(transport).not.toHaveBeenCalled()
  expect(fs.existsSync(path.join(options().booksRoot, label, "extraction.json"))).toBe(false)
  expect(fs.existsSync(path.join(options().booksRoot, label, "book.pdf"))).toBe(false)
})

it("a selected fixed-layout page uses the full book width and leaves its neighbor untouched", { timeout: 60000 }, async () => {
  fs.writeFileSync(options().configPath, fs.readFileSync(options().configPath, "utf8").replace("end_page: 1", "end_page: 2").replace("render_type: template", "render_type: fixed_layout"))
  const response = transport.getMockImplementation()!
  let pageNumber = 0
  transport.mockImplementation(async (...args) => {
    const result = await response(...args)
    if (!String(args[1]?.body).includes("page_sectioning")) return result
    const json = await result.json(), content = JSON.parse(json.choices[0].message.content)
    content.sections[0].page_number = ++pageNumber
    json.choices[0].message.content = JSON.stringify(content)
    return Response.json(json)
  })
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const s = storage(), positioned = s.getLatestNodeData("positioned-text", "pg002")!.data as { pageWidth: number }
  s.putNodeData("positioned-text", "pg002", { ...positioned, pageWidth: positioned.pageWidth * 2 })
  const neighbor = s.getAllNodeVersions("web-rendering", "pg002"), tree = s.getAllNodeVersions("fixed-layout-sectioning", "pg002"), calls = transport.mock.calls.length
  const result = await runFullPipeline({ ...options(), fromStage: "storyboard", outputScope: { selection: { pageIds: ["pg001"] } } })
  expect(errors(result)).toEqual([])
  expect(JSON.stringify(s.getLatestNodeData("web-rendering", "pg001")!.data)).toContain(`data-fl-reference-width=\\"${Math.round(positioned.pageWidth * 2)}\\"`)
  expect(s.getAllNodeVersions("web-rendering", "pg002")).toEqual(neighbor)
  expect(s.getAllNodeVersions("fixed-layout-sectioning", "pg002")).toEqual(tree)
  expect(transport).toHaveBeenCalledTimes(calls)
  s.close()
})

it("dynamic prompt dependencies cannot be stamped current from an unverified fingerprint", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const before = histories(), calls = transport.mock.calls.length
  fs.writeFileSync(path.join(root, "prompts/book_summary.liquid"), '{% include selected_prompt %}')
  const result = await runFullPipeline(options())
  expect(errors(result)[0]).toContain("UNSAFE_RESUME_UNAVAILABLE")
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
})

it("cancellation while packaging retains the prior bundle and assessment history", { timeout: 60000 }, async () => {
  const full = { ...options(), toStage: "package" as const, webAssetsDir: path.join(repository, "assets/adt") }
  expect(errors(await runFullPipeline(full))).toEqual([])
  const s = storage(), original = fs.readFileSync(path.join(s.bookDir!, "adt/index.html")), assessments = s.getAllNodeVersions("accessibility-assessment", "book")
  fs.appendFileSync(full.configPath, "\napply_body_background: true\n")
  const controller = new AbortController()
  const result = await runFullPipeline({ ...full, signal: controller.signal }, { emit(event) {
    if (event.type === "step-start" && event.step === "package-web") controller.abort()
  } })
  expect(result.resume?.status).toBe("cancelled")
  expect(fs.readFileSync(path.join(s.bookDir!, "adt/index.html"))).toEqual(original)
  expect(s.getAllNodeVersions("accessibility-assessment", "book")).toEqual(assessments)
  expect(errors(await runFullPipeline(full))).toEqual([])
  s.close()
})

it("changed generation preferences retain existing Sectioning and manual rendering", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const s = storage(), row = s.getLatestNodeData("web-rendering", "pg001")!
  s.putNodeData("web-rendering", "pg001", { ...(row.data as object), source: "manual" })
  fs.appendFileSync(path.join(root, "prompts/page_sectioning.liquid"), "Changed source generation")
  const before = histories(), calls = transport.mock.calls.length
  const resumed = await runFullPipeline(options())
  expect(resumed.resume?.status).toBe("incomplete") // Unreviewed manual rendering remains protected.
  expect(histories()).toEqual(before)
  expect(transport).toHaveBeenCalledTimes(calls)
  s.close()
})

it("an invalid retained source is visibly blocked and cannot be made current by regenerating its consumer", { timeout: 60000 }, async () => {
  expect(errors(await runFullPipeline(options()))).toEqual([])
  const s = storage()
  s.putNodeData("page-sectioning", "pg001", { sections: [], reasoning: 4 })
  const output = readGenerationCatalog({ storage: s, config: loadBookConfig(label, options().booksRoot, options().configPath), bookDir: s.bookDir!, promptsDir: options().promptsDir, templatesDir: options().templatesDir }).find((output) => output.identity.kind === "storyboard")!
  expect(output).toMatchObject({ blocked: true, current: false })
  expect(output.warnings).toContainEqual({ reason: "upstream" })
  s.close()
})

it("direct stage admission leaves an unsafe occupied directory byte-for-byte untouched", async () => {
  const { createStageRunner } = await import("../stage-execution.js")
  const full = options(), bookDir = path.join(full.booksRoot, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.writeFileSync(path.join(bookDir, "retained.txt"), "existing user content")
  await expect(createStageRunner().run(label, { ...full, booksDir: full.booksRoot }, { emit() {} })).rejects.toMatchObject({ code: "EXTRACTION_LEGACY" })
  expect(fs.readdirSync(bookDir)).toEqual(["retained.txt"])
  expect(fs.readFileSync(path.join(bookDir, "retained.txt"), "utf8")).toBe("existing user content")
  expect(transport).not.toHaveBeenCalled()
})

it("direct stage cancellation during initial extraction retains an incomplete attempt", { timeout: 60000 }, async () => {
  const { createStageRunner } = await import("../stage-execution.js")
  const full = options(), controller = new AbortController()
  await expect(createStageRunner().run(label, { ...full, booksDir: full.booksRoot, signal: controller.signal }, { emit(event) {
    if (event.type === "step-start" && event.step === "extract") controller.abort()
  } })).rejects.toThrow()
  const manifest = JSON.parse(fs.readFileSync(path.join(full.booksRoot, label, "extraction.json"), "utf8"))
  expect(manifest.status).toBe("failed")
  expect(transport).not.toHaveBeenCalled()
})

import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { createStageRunner } from "../stage-execution.js"
import { setupFullResumeFixture } from "./fixtures/full-resume.js"
import { readGenerationCatalog } from "../generation-catalog.js"
import { loadBookConfig } from "../config.js"

let fixture: ReturnType<typeof setupFullResumeFixture>
let calls: string[]
let failing: Set<string>
beforeEach(() => {
  fixture = setupFullResumeFixture()
  calls = []; failing = new Set(["pg002"])
  const file = fixture.options().configPath
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('end_page: 1','end_page: 3').replace('meaningfulness: false','meaningfulness: true').replace('min_side: 99999','min_side: 0') + '\nimage_meaningfulness: { max_retries: 0 }\n')
  fs.writeFileSync(path.join(fixture.root, "prompts/image_meaningfulness.liquid"), '{% chat role: "user" %}meaningfulness {{ page_id }} {% for image in images %}{{ image.imageId }} {% endfor %}{% endchat %}')
  const respond = fixture.transport.getMockImplementation()!
  fixture.transport.mockImplementation(async (url, init) => {
    const prompt = JSON.stringify(JSON.parse(String(init?.body)).messages)
    if (!prompt.includes("meaningfulness")) return respond(url, init)
    const ids = [...new Set(prompt.match(/pg\d+_im\d+|pg\d+_figure\d+|pg\d+_page/g) ?? [])]
    const page = prompt.match(/pg\d+/)?.[0] ?? "unknown"
    calls.push(page)
    if (failing.has(page)) return new Response('{"error":{"message":"temporary"}}', { status: 503 })
    return Response.json({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ images: ids.map((id) => ({ image_id: id, reasoning: "fixture", is_meaningful: true })) }) }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } })
  })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); fs.rmSync(fixture.root, { recursive: true, force: true }) })
function run(decide: NonNullable<Parameters<ReturnType<typeof createStageRunner>["run"]>[1]["requestPageDecision"]>, extra: Partial<Parameters<ReturnType<typeof createStageRunner>["run"]>[1]> = {}) {
  const options = fixture.options()
  return createStageRunner().run("book", { booksDir: options.booksRoot, promptsDir: options.promptsDir, configPath: options.configPath,
    pdfPath: options.pdfPath, templatesDir: options.templatesDir, fromStage: "extract", toStage: "extract", credentials: {}, pageErrorPolicy: "ask", requestPageDecision: decide, ...extra,
  }, { emit() {} })
}
it("Retry calls only the failed source page and commits successful sibling filtering", { timeout: 60000 }, async () => {
  let decisions = 0
  await run(async (decision) => {
    decisions++
    expect(decision.pageId).toBe("pg002")
    expect(decision.canRetry).toBe(true)
    decision.validateRetry!()
    const storage = fixture.storage()
    try {
      expect(storage.getLatestNodeData("image-filtering", "pg001")).not.toBeNull()
      expect(storage.getPages().map((page) => page.pageId)).toEqual(["pg001", "pg002", "pg003"])
    } finally { storage.close() }
    failing.clear()
    return "retry"
  })
  expect(decisions).toBe(1)
  expect(calls.filter((page) => page === "pg001")).toHaveLength(1)
  expect(calls.filter((page) => page === "pg002")).toHaveLength(2)
  expect(calls.filter((page) => page === "pg003")).toHaveLength(1)
})
it("Skip is durable and never makes the generated Extract output current", { timeout: 60000 }, async () => {
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  try {
    expect(storage.getPageRecovery()).toEqual([expect.objectContaining({ pageId: "pg002", outcome: "skipped-with-error" })])
    expect(storage.getPages()).toHaveLength(3)
    expect(storage.getLatestNodeData("image-filtering", "pg002")).not.toBeNull()
    const outputs = readGenerationCatalog({ storage, config: loadBookConfig("book", fixture.options().booksRoot, fixture.options().configPath), bookDir: storage.bookDir!, promptsDir: fixture.options().promptsDir })
    expect(outputs.find((output) => output.identity.kind === "extract-generation")).toMatchObject({ current: false })
  } finally { storage.close() }
})

it("each Retry grants exactly one new round; Stop retains already committed siblings and baseline filtering", { timeout: 60000 }, async () => {
  let decisions = 0
  let retained: unknown
  await expect(run(async (decision) => {
    expect(decision.pageId).toBe("pg002")
    decisions++
    const storage = fixture.storage()
    try {
      const current = storage.getAllNodeVersions("image-filtering", "pg001")
      if (!retained) retained = current
      else expect(current).toEqual(retained)
      expect(storage.getLatestNodeData("image-filtering", "pg002")).not.toBeNull()
    } finally { storage.close() }
    return decisions < 3 ? "retry" : "stop"
  })).rejects.toThrow("Stopped")
  expect(decisions).toBe(3)
  expect(calls).toEqual(["pg001", "pg002", "pg002", "pg002"])
  const storage = fixture.storage()
  try { expect(storage.getAllNodeVersions("image-filtering", "pg001")).toEqual(retained) }
  finally { storage.close() }
})

it("changed prompt inputs reject retry before another request and keep Stop/Skip recovery available", { timeout: 60000 }, async () => {
  await expect(run(async (decision) => {
    fs.appendFileSync(path.join(fixture.root, "prompts/image_meaningfulness.liquid"), " changed")
    expect(() => decision.validateRetry!()).toThrow("changed")
    return "stop"
  })).rejects.toThrow("Stopped")
  expect(calls).toEqual(["pg001", "pg002"])
})

it("a restarted explicit run retains manual pruning and does not repeat completed sibling requests", { timeout: 60000 }, async () => {
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  const original = storage.getLatestNodeData("image-filtering", "pg001")!
  const manual = { images: (original.data as { images: Array<{ imageId: string; isPruned: boolean }> }).images.map((image) => ({ ...image, isPruned: true, reason: "deliberate manual prune" })) }
  storage.putNodeData("image-filtering", "pg001", manual)
  const retained = storage.getAllNodeVersions("image-filtering", "pg001")
  storage.close()
  // The shared book output is now protected. Ordinary resume must not adopt or
  // overwrite unknown filtering just to make a recovery run current.
  const before = calls.length
  await expect(run(async () => "stop")).rejects.toThrow("RESUME_INCOMPLETE")
  expect(calls).toHaveLength(before)
  const reopened = fixture.storage()
  try { expect(reopened.getAllNodeVersions("image-filtering", "pg001")).toEqual(retained) }
  finally { reopened.close() }
})

it("an explicit restart recovers only the failed page and clears its durable warning after publication", { timeout: 60000 }, async () => {
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  const siblings = ["pg001", "pg003"].map((id) => storage.getAllNodeVersions("image-filtering", id))
  storage.close()
  const before = calls.length
  failing.clear()
  await run(async () => { throw new Error("No dialog expected after successful recovery") })
  expect(calls.slice(before)).toEqual(["pg002"])
  const reopened = fixture.storage()
  try {
    expect(reopened.getPageRecovery()).toEqual([])
    expect(["pg001", "pg003"].map((id) => reopened.getAllNodeVersions("image-filtering", id))).toEqual(siblings)
  } finally { reopened.close() }
})

it("a non-cooperating concurrent filtering edit rejects publication and preserves the new manual version", { timeout: 60000 }, async () => {
  failing.clear()
  const respond = fixture.transport.getMockImplementation()!
  let manualHistory: unknown
  fixture.transport.mockImplementation(async (url, init) => {
    const response = await respond(url, init)
    if (calls.at(-1) === "pg002" && !manualHistory) {
      const storage = fixture.storage()
      storage.putNodeData("image-filtering", "pg002", { images: [{ imageId: "pg002_im001", isPruned: true, reason: "Human choice" }] })
      manualHistory = storage.getAllNodeVersions("image-filtering", "pg002")
      storage.close()
    }
    return response
  })
  await expect(run(async (decision) => {
    expect(decision.pageId).toBe("pg002")
    expect(() => decision.validateRetry!()).toThrow("changed")
    return "stop"
  })).rejects.toThrow("Stopped")
  const storage = fixture.storage()
  try { expect(storage.getAllNodeVersions("image-filtering", "pg002")).toEqual(manualHistory) }
  finally { storage.close() }
})

it("headless exhaustion never invokes a decision and retains all source identities", { timeout: 60000 }, async () => {
  const decide = vi.fn(async () => "retry" as const)
  await expect(run(decide, { pageErrorPolicy: "stop" })).rejects.toThrow()
  expect(decide).not.toHaveBeenCalled()
  expect(calls).toEqual(["pg001", "pg002", "pg003"])
  const storage = fixture.storage()
  try {
    expect(storage.getPages().map((page) => page.pageId)).toEqual(["pg001", "pg002", "pg003"])
    expect(storage.getLatestNodeData("image-filtering", "pg003")).not.toBeNull()
  } finally { storage.close() }
})

function enableImagePasses() {
  const config = fixture.options().configPath
  fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace("cropping: false", "cropping: true").replace("segmentation: false", "segmentation: true") + "\nimage_segmentation: { max_retries: 0 }\nimage_cropping: { max_retries: 0 }\n")
  for (const step of ["segmentation", "cropping"]) fs.writeFileSync(path.join(fixture.root, `prompts/image_${step}.liquid`), `{% chat role: "user" %}${step} {% for image in images %}{{ image.imageId }} {% endfor %}{% endchat %}`)
  const transport = fixture.transport.getMockImplementation()!
  const passCalls: string[] = []
  fixture.transport.mockImplementation(async (url, init) => {
    const prompt = JSON.stringify(JSON.parse(String(init?.body)).messages)
    const step = prompt.includes("segmentation") ? "segmentation" : prompt.includes("cropping") ? "cropping" : null
    if (!step) return transport(url, init)
    const ids = [...new Set(prompt.match(/pg\d+_im\d+(?:_seg\d+_v\d+)?/g) ?? [])]
    passCalls.push(`${step}:${ids[0]?.match(/pg\d+/)?.[0]}`)
    const images = ids.map((image_id) => step === "segmentation"
      ? { image_id, reasoning: "fixture", needs_segmentation: true, segments: [{ label: "part1", crop_left: 0, crop_top: 0, crop_right: 4, crop_bottom: 4 }, { label: "part2", crop_left: 0, crop_top: 0, crop_right: 4, crop_bottom: 4 }] }
      : { image_id, reasoning: "fixture", should_crop: true, crop_left: 0, crop_top: 0, crop_right: 2, crop_bottom: 2 })
    return Response.json({ id: "fixture", object: "chat.completion", created: 0, model: "fixture", choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ images }) }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } })
  })
  return passCalls
}

it("headless failure never admits dependent image passes", { timeout: 60000 }, async () => {
  const passes = enableImagePasses()
  await expect(run(async () => "retry", { pageErrorPolicy: "stop" })).rejects.toThrow()
  expect(calls).toEqual(["pg001", "pg002", "pg003"])
  expect(passes).toEqual([])
})

it("recovery reuses completed segmentation/cropping and retains sibling rows and media", { timeout: 60000 }, async () => {
  const passes = enableImagePasses()
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  const history = storage.getNodeVersionFingerprint().filter((row) => row.itemId === "pg001" || row.itemId === "pg003")
  const assets = storage.getPageImages("pg001").map((image) => [image.imageId, storage.getImageBase64(image.imageId)])
  storage.close()
  const before = passes.length, meaningful = calls.length
  failing.clear()
  await run(async () => { throw new Error("unexpected dialog") })
  expect(calls.slice(meaningful)).toEqual(["pg002"])
  expect(passes.slice(before)).toEqual(["segmentation:pg002", "cropping:pg002"])
  const reopened = fixture.storage()
  try {
    expect(reopened.getNodeVersionFingerprint().filter((row) => row.itemId === "pg001" || row.itemId === "pg003")).toEqual(history)
    expect(reopened.getPageImages("pg001").map((image) => [image.imageId, reopened.getImageBase64(image.imageId)])).toEqual(assets)
  } finally { reopened.close() }
  const meanCalls = calls.length, previousPasses = passes.length
  const promptPath = path.join(fixture.root, "prompts/image_segmentation.liquid")
  fs.writeFileSync(promptPath, fs.readFileSync(promptPath, "utf8").replace("{% endchat %}", "updated segmentation instructions{% endchat %}"))
  await run(async () => { throw new Error("unexpected dialog") })
  expect(calls).toHaveLength(meanCalls)
  expect(passes.slice(previousPasses).filter((call) => call.startsWith("segmentation:"))).toHaveLength(3)
  expect(passes.slice(previousPasses).filter((call) => call.startsWith("cropping:"))).toHaveLength(3)
})


it.each([null, { images: "invalid" }])("missing or invalid filtering after Skip blocks downstream requests (%j)", { timeout: 60000 }, async (value) => {
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  storage.putNodeData("image-filtering", "pg002", value)
  const before = storage.getNodeVersionFingerprint()
  storage.close()
  const providerCalls = fixture.transport.mock.calls.length
  await expect(run(async () => "skip", { fromStage: "sectioning", toStage: "storyboard" })).rejects.toThrow()
  const reopened = fixture.storage()
  try {
    expect(reopened.getPages()).toHaveLength(3)
    expect(reopened.getLatestNodeData("page-sectioning", "pg002")).toBeNull()
    expect(reopened.getNodeVersionFingerprint().filter((row) => row.itemId === "pg002")).toEqual(before.filter((row) => row.itemId === "pg002"))
  } finally { reopened.close() }
  // Other ready pages may progress, but the failed page is never admitted.
  expect(fixture.transport.mock.calls.slice(providerCalls).every(([, init]) => !String(init?.body).includes('pg002'))).toBe(true)
})

it("later successful Sectioning publication clears its durable Skip without shrinking pages", { timeout: 60000 }, async () => {
  failing.clear()
  await run(async () => "stop")
  fs.writeFileSync(path.join(fixture.root, "prompts/page_sectioning.liquid"), '{% chat role: "user" %}page_sectioning page{{ page.pageNumber }}{% endchat %}')
  const transport = fixture.transport.getMockImplementation()!
  let failed = true
  fixture.transport.mockImplementation(async (url, init) => {
    if (failed && String(init?.body).includes("page_sectioning page2")) return new Response('{"error":{"message":"fixture permission"}}', { status: 403 })
    return transport(url, init)
  })
  await expect(run(async (decision) => { expect(decision.canRetry).not.toBe(true); return "skip" }, { fromStage: "sectioning", toStage: "storyboard" })).rejects.toThrow()
  const storage = fixture.storage()
  expect(storage.getPageRecovery()).toEqual([expect.objectContaining({ step: "page-sectioning", pageId: "pg002" })])
  storage.close()
  failed = false
  await run(async () => "stop", { fromStage: "sectioning", toStage: "storyboard" })
  const reopened = fixture.storage()
  try {
    expect(reopened.getPageRecovery()).toEqual([])
    expect(reopened.getNodeItemIds("page-sectioning")).toEqual(["pg001", "pg002", "pg003"])
    expect(reopened.getNodeItemIds("web-rendering")).toEqual(["pg001", "pg002", "pg003"])
  } finally { reopened.close() }
})


it("explicit book replacement cannot certify retained unknown/manual pruning as generated current", { timeout: 60000 }, async () => {
  await expect(run(async () => "skip")).rejects.toThrow("RESUME_INCOMPLETE")
  const storage = fixture.storage()
  const row = storage.getLatestNodeData("image-filtering", "pg001")!.data as { images: Array<{ imageId: string }> }
  storage.putNodeData("image-filtering", "pg001", { images: row.images.map((image) => ({ ...image, isPruned: true, reason: "human" })) })
  const retained = storage.getAllNodeVersions("image-filtering", "pg001")
  const status = readGenerationCatalog({ storage, config: loadBookConfig("book", fixture.options().booksRoot, fixture.options().configPath), bookDir: storage.bookDir!, promptsDir: fixture.options().promptsDir }).find((output) => output.identity.kind === "extract-generation")!
  expect(status.protected).toBe(true)
  storage.close()
  failing.clear()
  await expect(run(async () => "stop", { outputScope: { replace: [{ identity: status.identity, signature: status.signature, contentHash: status.contentHash }] } })).rejects.toThrow("RESUME_INCOMPLETE")
  const reopened = fixture.storage()
  try {
    expect(reopened.getAllNodeVersions("image-filtering", "pg001")).toEqual(retained)
    const output = readGenerationCatalog({ storage: reopened, config: loadBookConfig("book", fixture.options().booksRoot, fixture.options().configPath), bookDir: reopened.bookDir!, promptsDir: fixture.options().promptsDir }).find((item) => item.identity.kind === "extract-generation")!
    expect(output).toMatchObject({ current: false, protected: true })
    expect(reopened.getPageRecovery()).toEqual([])
    const metadata = reopened.getLatestNodeData("metadata", "book")!.data as object
    reopened.putNodeData("metadata", "book", { ...metadata, generationEvidence: { review: { signature: output.signature, contentHash: output.contentHash, action: "keep" } } })
    const reviewed = readGenerationCatalog({ storage: reopened, config: loadBookConfig("book", fixture.options().booksRoot, fixture.options().configPath), bookDir: reopened.bookDir!, promptsDir: fixture.options().promptsDir }).find((item) => item.identity.kind === "extract-generation")!
    expect(reviewed).toMatchObject({ current: true, protected: true })
    expect(reopened.getAllNodeVersions("image-filtering", "pg001")).toEqual(retained)
  } finally { reopened.close() }
})

it("compiled CLI exhausts one bounded round, exits nonzero, and never admits dependent paid work", { timeout: 60000 }, async () => {
  const { spawnSync } = await import("node:child_process")
  const options = fixture.options()
  enableImagePasses()
  fs.writeFileSync(options.configPath, fs.readFileSync(options.configPath, "utf8").replace("image_meaningfulness: { max_retries: 0 }", "image_meaningfulness: { max_retries: 2 }"))
  fs.symlinkSync(options.templatesDir, path.join(fixture.root, "templates"))
  const hook = path.join(fixture.root, "transport.mjs"), log = path.join(fixture.root, "calls.jsonl")
  fs.writeFileSync(hook, `import fs from 'node:fs';
    globalThis.fetch = async (_url, init) => {
      const prompt = JSON.stringify(JSON.parse(String(init.body)).messages);
      fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(prompt)+'\\n');
      let object;
      if(prompt.includes('meaningfulness')) {
        if(prompt.includes('pg002')) return new Response('{"error":{"message":"temporary"}}',{status:503});
        const ids=[...new Set(prompt.match(/pg\\d+_im\\d+/g)||[])];
        object={images:ids.map(image_id=>({image_id,reasoning:'fixture',is_meaningful:true}))};
      } else if(prompt.includes('metadata_extraction')) object={title:'Raven',authors:[],publisher:null,language_code:'en',cover_page_number:1,reasoning:'fixture'};
      else if(prompt.includes('book_summary')) object={summary:'A raven visits.'};
      else if(prompt.includes('book_outline')) object={reasoning:'fixture',entries:[],styleClusters:[]};
      else throw new Error('Unexpected dependent request');
      return Response.json({id:'fixture',object:'chat.completion',created:0,model:'fixture',choices:[{index:0,message:{role:'assistant',content:JSON.stringify(object)},finish_reason:'stop'}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
    };
  `)
  const repository = path.resolve(import.meta.dirname, "../../../..")
  fs.mkdirSync(path.join(fixture.root, "assets"))
  fs.symlinkSync(path.join(repository, "assets/adt"), path.join(fixture.root, "assets/adt"))
  const result = spawnSync(process.execPath, ["--import", hook, path.join(repository, "packages/pipeline/dist/cli.js"), "headless", options.pdfPath, "--books-dir", options.booksRoot], { cwd: fixture.root, encoding: "utf8", timeout: 45000 })
  expect(result.status, result.stdout + result.stderr).toBe(1)
  expect(result.signal).toBeNull()
  expect(fs.existsSync(log), result.stdout + result.stderr).toBe(true)
  const requests = fs.readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line) as string)
  expect(requests.filter((prompt) => prompt.includes("meaningfulness") && prompt.includes("pg002"))).toHaveLength(3)
  expect(requests.some((prompt) => prompt.includes("segmentation") || prompt.includes("cropping"))).toBe(false)
  expect(result.stdout + result.stderr).toContain("Failed stages")
})

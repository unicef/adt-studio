import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createPromptEngine } from "@adt/llm"
import { createPromptRoutes } from "./prompts.js"

let root: string
let bundled: string
let overrides: string
let books: string
const template = (text: string) => `{% chat role: "user" %}${text}{% endchat %}`
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-contract-"))
  bundled = path.join(root, "resources", "prompts")
  overrides = path.join(root, "data", "overrides")
  books = path.join(root, "books")
  fs.mkdirSync(bundled, { recursive: true })
  fs.mkdirSync(books)
  fs.writeFileSync(path.join(bundled, "test.liquid"), template("base"))
})
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }) })
const app = () => createPromptRoutes(bundled, books, undefined, overrides)
async function read(url = "/prompts/test") { const r = await app().request(url); expect(r.status).toBe(200); return r.json() }
async function write(url: string, revision?: string, content?: string, method = "PUT") {
  return app().request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify({ revision, ...(content === undefined ? {} : { content }) }) })
}

describe("SPEC-0011 persistence contract", () => {
  it("requires revisions on save, reset and restore", async () => {
    for (const [url, method] of [["/prompts/test", "PUT"], ["/prompts/test", "DELETE"], ["/prompts/test/versions/20260101T000000000Z-000.liquid/current", "PUT"]]) {
      expect((await write(url, undefined, undefined, method)).status).toBe(428)
    }
    expect((await read()).content).toBe(template("base"))
  })
  it("has one concurrent winner, checks stale identical saves, and reconciles retries without new versions", async () => {
    const first = await read()
    const results = await Promise.all([write("/prompts/test", first.revision, "A"), write("/prompts/test", first.revision, "B")])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const current = await read()
    expect((await write("/prompts/test", first.revision, current.content)).status).toBe(409)
    expect((await write("/prompts/test", current.revision, current.content)).status).toBe(200)
    const history = await (await app().request("/prompts/test/versions")).json()
    expect(history.versions).toHaveLength(1)
  })
  it("retains history and detects A-to-B-to-A selections", async () => {
    const initial = await read()
    const a = await (await write("/prompts/test", initial.revision, "A")).json()
    const b = await (await write("/prompts/test", a.revision, "B")).json()
    const restored = await (await write(`/prompts/test/versions/${a.version}/current`, b.revision)).json()
    expect(restored.content).toBe("A")
    expect(restored.revision).not.toBe(a.revision)
    expect((await write("/prompts/test", a.revision, undefined, "DELETE")).status).toBe(409)
    const reset = await (await write("/prompts/test", restored.revision, undefined, "DELETE")).json()
    expect(reset.content).toBe(template("base"))
    const history = await (await app().request("/prompts/test/versions")).json()
    expect(history.versions.map((v: {content:string}) => v.content).sort()).toEqual(["A", "B"])
    expect((await write(`/prompts/test/versions/${a.version}/current`, reset.revision)).status).toBe(200)
  })
  it("never activates an orphan after pointer failure, reload or a corrupt/missing pointer", async () => {
    const initial = await read()
    const a = await (await write("/prompts/test", initial.revision, "A")).json()
    const rename = fs.renameSync.bind(fs)
    vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
      if (String(to).endsWith(".current")) throw new Error("injected pointer failure")
      rename(from, to)
    })
    expect((await write("/prompts/test", a.revision, "orphan")).status).toBe(500)
    vi.restoreAllMocks()
    expect((await read()).content).toBe("A")
    const pointer = path.join(overrides, ".versions", "test", ".current")
    fs.writeFileSync(pointer, "corrupt")
    expect((await app().request("/prompts/test")).status).toBe(400)
    fs.unlinkSync(pointer)
    expect((await app().request("/prompts/test")).status).toBe(400)
  })
  it("keeps model-first resolution, resets one candidate and shares engine content", async () => {
    fs.mkdirSync(path.join(bundled, "openai_gpt_5_5"))
    fs.writeFileSync(path.join(bundled, "openai_gpt_5_5", "test.liquid"), template("model"))
    const url = "/books/book/prompts/test"
    const initial = await read(url)
    expect((await write(url, initial.revision, template("book base"))).status).toBe(200)
    const variant = await read(`${url}?model=openai:gpt-5.5`)
    expect(variant.source).toBe("bundled")
    expect(variant.resolvedName).toBe("test__openai_gpt_5_5")
    const saved = await (await write(`${url}?model=openai:gpt-5.5`, variant.revision, template("book model"))).json()
    const engine = createPromptEngine([path.join(books, "book", "prompts"), overrides, bundled])
    expect(await engine.renderPrompt("test", {}, { modelId: "openai:gpt-5.5" })).toEqual([{ role: "user", content: [{ type: "text", text: "book model" }] }])
    const reset = await (await write(`${url}?model=openai:gpt-5.5`, saved.revision, undefined, "DELETE")).json()
    expect(reset.content).toBe(template("model"))
    expect((await read(url)).content).toBe(template("book base"))
  })
  it("detects inherited edits and persistent model-folder collisions", async () => {
    const child = await read("/books/book/prompts/test")
    const global = await read()
    await write("/prompts/test", global.revision, "global changed")
    expect((await write("/books/book/prompts/test", child.revision, "stale")).status).toBe(409)
    const variant = await read("/prompts/test?model=custom:foo-bar")
    expect((await write("/prompts/test?model=custom:foo-bar", variant.revision, "custom")).status).toBe(200)
    expect((await app().request("/prompts/test?model=custom:foo_bar")).status).toBe(400)
  })
  it.each(["/prompts", "/books/book/prompts"])("rejects concurrent model-folder aliases across different %s", async (prefix) => {
    fs.writeFileSync(path.join(bundled, "other.liquid"), template("other base"))
    const urls = [`${prefix}/test?model=custom:foo-bar`, `${prefix}/other?model=custom:foo_bar`]
    const initial = await Promise.all(urls.map((url) => read(url)))
    const results = await Promise.all(urls.map((url, index) => write(url, initial[index].revision, `alias ${index}`)))
    expect(results.map((response) => response.status).sort()).toEqual([200, 400])
    const winner = results.findIndex((response) => response.status === 200)
    expect((await read(urls[winner])).content).toBe(`alias ${winner}`)
    const loser = 1 - winner
    const target = prefix.startsWith("/books") ? path.join(books, "book", "prompts") : overrides
    expect(fs.existsSync(path.join(target, ".versions", `${loser === 0 ? "test" : "other"}__custom_foo_bar`))).toBe(false)
    expect((await app().request(urls[loser])).status).toBe(400)
    expect(fs.readFileSync(path.join(bundled, "other.liquid"), "utf8")).toBe(template("other base"))
  })
  it("migrates legacy history once, retains source, detects different-byte collisions, and preserves target selections", async () => {
    const dir = path.join(bundled, ".versions", "test")
    const version = "20260101T000000000Z-000.liquid"
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, version), "legacy")
    const migrated = await read()
    expect(migrated.content).toBe("legacy")
    const saved = await (await write("/prompts/test", migrated.revision, "newer")).json()
    expect((await read()).revision).toBe(saved.revision)
    expect(fs.readFileSync(path.join(dir, version), "utf8")).toBe("legacy")
    fs.writeFileSync(path.join(dir, version), "different")
    const conflict = await app().request("/prompts/test")
    expect(conflict.status).toBe(409)
    expect((await conflict.json()).code).toBe("PROMPT_MIGRATION_CONFLICT")
    expect(fs.readFileSync(path.join(overrides, ".versions", "test", saved.version), "utf8")).toBe("newer")
  })
  it("keeps templates tied to bundled roots and rejects symlink escapes", async () => {
    fs.mkdirSync(path.join(root, "resources", "templates"))
    fs.writeFileSync(path.join(root, "resources", "templates", "layout.liquid"), "layout")
    expect((await (await app().request("/templates/layout")).json()).content).toBe("layout")
    fs.mkdirSync(path.join(books, "book"))
    fs.symlinkSync(bundled, path.join(books, "book", "prompts"))
    expect((await app().request("/books/book/prompts/test")).status).toBe(400)
    expect(fs.readFileSync(path.join(bundled, "test.liquid"), "utf8")).toBe(template("base"))
  })
})

it("serializes independent processes and reloads the winner with read-only bundled resources", async () => {
  const { spawn } = await import("node:child_process")
  const moduleUrl = new URL("../../dist/routes/prompts.js", import.meta.url).href
  const first = await read()
  fs.chmodSync(bundled, 0o555)
  fs.chmodSync(path.join(bundled, "test.liquid"), 0o444)
  const run = (content?: string) => new Promise<{ status: number; body: { content: string } }>((resolve, reject) => {
    const code = `import {createPromptRoutes} from ${JSON.stringify(moduleUrl)};
const [bundled,books,overrides,revision,content]=process.argv.slice(1);
const app=createPromptRoutes(bundled,books,undefined,overrides);
const response=await app.request('/prompts/test',content===undefined?undefined:{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({revision,content})});
console.log(JSON.stringify({status:response.status,body:await response.json()}));`
    const child = spawn(process.execPath, ["--input-type=module", "-e", code, bundled, books, overrides, first.revision, ...(content ? [content] : [])])
    let output = "", error = ""
    child.stdout.on("data", (data) => { output += data })
    child.stderr.on("data", (data) => { error += data })
    child.on("error", reject)
    child.on("exit", (code) => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error)))
  })
  try {
    const concurrent = await Promise.all([run("process A"), run("process B")])
    expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409])
    expect((await run()).body.content).toBe(concurrent.find((r) => r.status === 200)!.body.content)
    expect(fs.readFileSync(path.join(bundled, "test.liquid"), "utf8")).toBe(template("base"))
  } finally { fs.chmodSync(bundled, 0o755); fs.chmodSync(path.join(bundled, "test.liquid"), 0o644) }
}, 30000)

it("retries an interrupted migration without activating partially copied history", async () => {
  const dir = path.join(bundled, ".versions", "test")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "20260101T000000Z.liquid"), "legacy")
  const rename = fs.renameSync.bind(fs)
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to) === path.join(overrides, ".versions", "test")) throw new Error("publish interrupted")
    rename(from, to)
  })
  expect((await app().request("/prompts/test")).status).toBe(500)
  expect(fs.existsSync(path.join(overrides, ".versions", "test"))).toBe(false)
  vi.restoreAllMocks()
  expect((await read()).content).toBe("legacy")
})

it("rejects resource-root aliases, malformed model metadata, and preserves a newer target flat file", async () => {
  const alias = path.join(root, "alias")
  fs.symlinkSync(bundled, alias)
  const aliased = createPromptRoutes(bundled, books, undefined, alias)
  expect((await aliased.request("/prompts/test")).status).toBe(400)
  expect(fs.existsSync(path.join(bundled, ".prompt-write.lock"))).toBe(false)
  const overlapping = createPromptRoutes(bundled, books, undefined, path.join(books, "book", "prompts"))
  expect((await overlapping.request("/books/book/prompts/test")).status).toBe(400)
  fs.mkdirSync(overrides, { recursive: true })
  fs.writeFileSync(path.join(overrides, "test.liquid"), "target flat")
  const legacy = path.join(bundled, ".versions", "test")
  fs.mkdirSync(legacy, { recursive: true })
  fs.writeFileSync(path.join(legacy, "20260101T000000Z.liquid"), "older source")
  fs.writeFileSync(path.join(bundled, ".models.json"), "{broken")
  expect((await app().request("/prompts/test")).status).toBe(409)
  expect(fs.existsSync(path.join(overrides, ".versions"))).toBe(false)
  fs.unlinkSync(path.join(bundled, ".models.json"))
  expect((await read()).content).toBe("target flat")
  expect(fs.readFileSync(path.join(overrides, ".versions", "test", "20260101T000000Z.liquid"), "utf8")).toBe("older source")
})

it("keeps the old flat selection when initial pointer publication fails", async () => {
  const initial = await read()
  const rename = fs.renameSync.bind(fs)
  vi.spyOn(fs, "renameSync").mockImplementation((from, to) => {
    if (String(to).endsWith(".current")) throw new Error("initial publish interrupted")
    rename(from, to)
  })
  expect((await write("/prompts/test", initial.revision, "not selected")).status).toBe(500)
  vi.restoreAllMocks()
  expect((await read()).content).toBe(template("base"))
})

it("fails closed after a writer crash and resumes only after explicit lock recovery", async () => {
  const initial = await read()
  const lock = path.join(overrides, ".prompt-write.lock")
  fs.mkdirSync(lock)
  fs.writeFileSync(path.join(lock, "owner.json"), '{"pid":99999999}')
  const busy = await write("/prompts/test", initial.revision, "blocked")
  expect(busy.status).toBe(503)
  expect(fs.existsSync(path.join(overrides, ".versions", "test"))).toBe(false)
  // Operator has stopped every writer before removing the abandoned gate.
  fs.rmSync(lock, { recursive: true })
  expect((await write("/prompts/test", initial.revision, "recovered")).status).toBe(200)
  expect((await read()).content).toBe("recovered")
}, 15000)

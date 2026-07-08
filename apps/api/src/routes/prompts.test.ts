import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createPromptRoutes } from "./prompts.js"

let tmpDir: string
let promptsDir: string
let templatesDir: string
let booksDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-prompts-route-"))
  promptsDir = path.join(tmpDir, "prompts")
  templatesDir = path.join(tmpDir, "templates")
  booksDir = path.join(tmpDir, "books")
  fs.mkdirSync(promptsDir, { recursive: true })
  fs.mkdirSync(booksDir, { recursive: true })
})

afterEach(() => {
  vi.useRealTimers()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function app() {
  return createPromptRoutes(promptsDir, booksDir)
}

function writePrompt(name: string, content: string) {
  fs.writeFileSync(path.join(promptsDir, `${name}.liquid`), content, "utf-8")
}

function writeTemplate(name: string, content: string) {
  fs.mkdirSync(templatesDir, { recursive: true })
  fs.writeFileSync(path.join(templatesDir, `${name}.liquid`), content, "utf-8")
}

// ---- Prompt models ----

describe("GET /prompt-models", () => {
  it("returns an empty model list when none were configured", async () => {
    const res = await app().request("/prompt-models")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.models).toEqual([])
  })
})

describe("PUT /prompt-models", () => {
  it("stores normalized unique prompt model ids", async () => {
    const res = await app().request("/prompt-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: [" OpenAI:GPT-6 ", "openai:gpt-6", "custom:local-model"] }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.models).toEqual(["openai:gpt-6", "custom:local-model"])

    const readRes = await app().request("/prompt-models")
    const readBody = await readRes.json()
    expect(readBody.models).toEqual(["openai:gpt-6", "custom:local-model"])
  })

  it("rejects invalid prompt model ids", async () => {
    const res = await app().request("/prompt-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: ["openai:gpt-6", "../bad"] }),
    })

    expect(res.status).toBe(400)
  })
})

// ---- Prompts ----

describe("GET /prompts", () => {
  it("lists base prompt names and available variants", async () => {
    writePrompt("page_sectioning", "base")
    writePrompt("page_sectioning__openai_gpt_5_5", "flat variant")
    const versionDir = path.join(promptsDir, ".versions", "metadata_extraction")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, "20260101T000000000Z-000.liquid"), "version", "utf-8")

    const res = await app().request("/prompts")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toEqual([
      { name: "metadata_extraction", variants: [] },
      { name: "page_sectioning", variants: ["page_sectioning__openai_gpt_5_5"] },
    ])
  })
})

describe("GET /prompts/:name", () => {
  it("returns prompt content", async () => {
    writePrompt("page_sectioning", "Hello {{ page }}")
    const res = await app().request("/prompts/page_sectioning")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("page_sectioning")
    expect(body.content).toBe("Hello {{ page }}")
  })

  it("returns 404 for missing prompt", async () => {
    const res = await app().request("/prompts/nonexistent")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid name", async () => {
    const res = await app().request("/prompts/bad-name")
    expect(res.status).toBe(400)
  })
})

describe("PUT /prompts/:name", () => {
  it("creates a versioned global prompt override", async () => {
    writePrompt("test_prompt", "old content")
    const res = await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "new content" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe("new content")
    expect(body.version).toMatch(/\.liquid$/)
    expect(fs.readFileSync(path.join(promptsDir, "test_prompt.liquid"), "utf-8")).toBe("old content")
    const versionDir = path.join(promptsDir, ".versions", "test_prompt")
    const versions = fs.readdirSync(versionDir)
    expect(versions).toHaveLength(1)
    expect(fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")).toBe("new content")
  })

  it("creates a versioned global exact model override", async () => {
    writePrompt("test_prompt", "old content")
    const res = await app().request("/prompts/test_prompt?model=google%3Agemini-2.5-pro", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "gemini content" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolvedName).toBe("test_prompt__google_gemini_2_5_pro")
    expect(body.modelId).toBe("google:gemini-2.5-pro")

    const readRes = await app().request("/prompts/test_prompt?model=google%3Agemini-2.5-pro")
    const readBody = await readRes.json()
    expect(readBody.resolvedName).toBe("test_prompt__google_gemini_2_5_pro")
    expect(readBody.content).toBe("gemini content")
  })

  it("returns 404 when prompt does not exist", async () => {
    const res = await app().request("/prompts/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when content is missing", async () => {
    writePrompt("test_prompt", "old")
    const res = await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

describe("DELETE /prompts/:name", () => {
  it("resets a global prompt override to the flat default", async () => {
    writePrompt("test_prompt", "default content")
    const saveRes = await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "edited content" }),
    })
    expect(saveRes.status).toBe(200)

    const resetRes = await app().request("/prompts/test_prompt", { method: "DELETE" })
    expect(resetRes.status).toBe(200)
    const body = await resetRes.json()
    expect(body.content).toBe("default content")
    expect(body.version).toBeUndefined()
    expect(fs.existsSync(path.join(promptsDir, ".versions", "test_prompt"))).toBe(false)
  })

  it("resets a missing model variant back to the base prompt fallback", async () => {
    writePrompt("test_prompt", "default content")
    await app().request("/prompts/test_prompt?model=anthropic%3Aclaude-opus-4-6", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "claude content" }),
    })

    const resetRes = await app().request("/prompts/test_prompt?model=anthropic%3Aclaude-opus-4-6", {
      method: "DELETE",
    })

    expect(resetRes.status).toBe(200)
    const body = await resetRes.json()
    expect(body.resolvedName).toBe("test_prompt")
    expect(body.modelId).toBeNull()
    expect(body.content).toBe("default content")
  })
})

// ---- Book-level prompt overrides ----

describe("GET /books/:label/prompts/:name", () => {
  it("returns global prompt when no book override exists", async () => {
    writePrompt("page_sectioning", "global content")
    fs.mkdirSync(path.join(booksDir, "my-book"), { recursive: true })
    const res = await app().request("/books/my-book/prompts/page_sectioning")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("global")
    expect(body.content).toBe("global content")
  })

  it("returns book override when it exists", async () => {
    writePrompt("page_sectioning", "global content")
    const bookPromptsDir = path.join(booksDir, "my-book", "prompts")
    fs.mkdirSync(bookPromptsDir, { recursive: true })
    fs.writeFileSync(path.join(bookPromptsDir, "page_sectioning.liquid"), "book content", "utf-8")
    const res = await app().request("/books/my-book/prompts/page_sectioning")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.content).toBe("book content")
  })

  it("returns an exact model prompt variant before the base prompt", async () => {
    writePrompt("page_sectioning", "global base")
    writePrompt("page_sectioning__openai_gpt_5_5", "global gpt 5.5")
    const res = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("global")
    expect(body.resolvedName).toBe("page_sectioning__openai_gpt_5_5")
    expect(body.modelId).toBe("openai:gpt-5.5")
    expect(body.content).toBe("global gpt 5.5")
  })

  it("returns the base prompt when a model variant is missing", async () => {
    writePrompt("page_sectioning", "global base")
    const res = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("global")
    expect(body.resolvedName).toBe("page_sectioning")
    expect(body.modelId).toBeNull()
    expect(body.content).toBe("global base")
  })

  it("returns 404 when prompt does not exist globally", async () => {
    const res = await app().request("/books/my-book/prompts/nonexistent")
    expect(res.status).toBe(404)
  })
})

describe("PUT /books/:label/prompts/:name", () => {
  it("creates book-level override", async () => {
    writePrompt("page_sectioning", "global")
    const res = await app().request("/books/my-book/prompts/page_sectioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "override" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.content).toBe("override")
    const versionDir = path.join(booksDir, "my-book", "prompts", ".versions", "page_sectioning")
    const versions = fs.readdirSync(versionDir)
    expect(versions).toHaveLength(1)
    const onDisk = fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")
    expect(onDisk).toBe("override")
  })

  it("creates a versioned book-level exact model override", async () => {
    writePrompt("page_sectioning", "global")
    const res = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "gpt 5.5 override" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.resolvedName).toBe("page_sectioning__openai_gpt_5_5")
    expect(body.modelId).toBe("openai:gpt-5.5")

    const readRes = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5")
    expect(readRes.status).toBe(200)
    const readBody = await readRes.json()
    expect(readBody.source).toBe("book")
    expect(readBody.resolvedName).toBe("page_sectioning__openai_gpt_5_5")
    expect(readBody.content).toBe("gpt 5.5 override")
  })

  it("creates separate versions when saves share the same timestamp", async () => {
    writePrompt("page_sectioning", "global")
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"))

    const first = await app().request("/books/my-book/prompts/page_sectioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "first" }),
    })
    const second = await app().request("/books/my-book/prompts/page_sectioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "second" }),
    })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const versionDir = path.join(booksDir, "my-book", "prompts", ".versions", "page_sectioning")
    const versions = fs.readdirSync(versionDir).sort()
    expect(versions).toEqual([
      "20260102T030405006Z-000.liquid",
      "20260102T030405006Z-001.liquid",
    ])
    expect(fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")).toBe("first")
    expect(fs.readFileSync(path.join(versionDir, versions[1]), "utf-8")).toBe("second")

    const readRes = await app().request("/books/my-book/prompts/page_sectioning")
    const readBody = await readRes.json()
    expect(readBody.content).toBe("second")
  })

  it("returns 404 when global prompt does not exist", async () => {
    const res = await app().request("/books/my-book/prompts/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    })
    expect(res.status).toBe(404)
  })
})

// ---- Templates ----

describe("GET /templates", () => {
  it("returns empty array when templates dir does not exist", async () => {
    const res = await app().request("/templates")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.templates).toEqual([])
  })

  it("returns liquid template names without extension", async () => {
    writeTemplate("two_column_render", "<div>col</div>")
    writeTemplate("two_column_story", "<div>story</div>")
    const res = await app().request("/templates")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.templates.sort()).toEqual(["two_column_render", "two_column_story"])
  })

  it("excludes non-liquid files", async () => {
    writeTemplate("valid", "<div/>")
    fs.writeFileSync(path.join(templatesDir, "readme.md"), "# Hi", "utf-8")
    const res = await app().request("/templates")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.templates).toEqual(["valid"])
  })
})

describe("GET /templates/:name", () => {
  it("returns template content", async () => {
    writeTemplate("two_column_render", "<div>{{ section }}</div>")
    const res = await app().request("/templates/two_column_render")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("two_column_render")
    expect(body.content).toBe("<div>{{ section }}</div>")
  })

  it("returns 404 for missing template", async () => {
    const res = await app().request("/templates/nonexistent")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid name", async () => {
    const res = await app().request("/templates/bad-name")
    expect(res.status).toBe(400)
  })
})

describe("PUT /templates/:name", () => {
  it("updates template content", async () => {
    writeTemplate("two_column_render", "old")
    const res = await app().request("/templates/two_column_render", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "new" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe("new")
    expect(fs.readFileSync(path.join(templatesDir, "two_column_render.liquid"), "utf-8")).toBe("new")
  })

  it("returns 404 when template does not exist", async () => {
    const res = await app().request("/templates/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 when content is missing", async () => {
    writeTemplate("two_column_render", "old")
    const res = await app().request("/templates/two_column_render", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

// ---- Book-level template overrides ----

describe("GET /books/:label/templates/:name", () => {
  it("returns global template when no book override exists", async () => {
    writeTemplate("two_column_render", "global template")
    const res = await app().request("/books/my-book/templates/two_column_render")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("global")
    expect(body.content).toBe("global template")
  })

  it("returns book override when it exists", async () => {
    writeTemplate("two_column_render", "global template")
    const bookTemplatesDir = path.join(booksDir, "my-book", "templates")
    fs.mkdirSync(bookTemplatesDir, { recursive: true })
    fs.writeFileSync(path.join(bookTemplatesDir, "two_column_render.liquid"), "book template", "utf-8")
    const res = await app().request("/books/my-book/templates/two_column_render")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.content).toBe("book template")
  })

  it("returns 404 when template does not exist", async () => {
    const res = await app().request("/books/my-book/templates/nonexistent")
    expect(res.status).toBe(404)
  })
})

describe("PUT /books/:label/templates/:name", () => {
  it("creates book-level template override", async () => {
    writeTemplate("two_column_render", "global")
    const res = await app().request("/books/my-book/templates/two_column_render", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "book override" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.content).toBe("book override")
    const onDisk = fs.readFileSync(
      path.join(booksDir, "my-book", "templates", "two_column_render.liquid"),
      "utf-8"
    )
    expect(onDisk).toBe("book override")
  })

  it("returns 404 when global template does not exist", async () => {
    const res = await app().request("/books/my-book/templates/ghost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "x" }),
    })
    expect(res.status).toBe(404)
  })
})

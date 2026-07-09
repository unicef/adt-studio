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

function writeModelPrompt(modelFolder: string, name: string, content: string) {
  const modelPromptsDir = path.join(promptsDir, modelFolder)
  fs.mkdirSync(modelPromptsDir, { recursive: true })
  fs.writeFileSync(path.join(modelPromptsDir, `${name}.liquid`), content, "utf-8")
}

function writeTemplate(name: string, content: string) {
  fs.mkdirSync(templatesDir, { recursive: true })
  fs.writeFileSync(path.join(templatesDir, `${name}.liquid`), content, "utf-8")
}

function readLiquidVersions(versionDir: string): string[] {
  return fs
    .readdirSync(versionDir)
    .filter((file) => file.endsWith(".liquid"))
    .sort()
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

  it("rejects prompt model ids that map to the same folder name", async () => {
    const res = await app().request("/prompt-models", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: ["openai:gpt-5.5", "openai:gpt_5_5"] }),
    })

    expect(res.status).toBe(400)
  })
})

// ---- Prompts ----

describe("GET /prompts", () => {
  it("lists base prompt names and available variants", async () => {
    writePrompt("page_sectioning", "base")
    writePrompt("page_sectioning__openai_gpt_5_5", "flat variant")
    writeModelPrompt("google_gemini_2_5_pro", "page_sectioning", "folder variant")
    const versionDir = path.join(promptsDir, ".versions", "metadata_extraction")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, "20260101T000000000Z-000.liquid"), "version", "utf-8")

    const res = await app().request("/prompts")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toEqual([
      { name: "metadata_extraction", variants: [], variantSources: {} },
      {
        name: "page_sectioning",
        variants: [
          "page_sectioning__google_gemini_2_5_pro",
          "page_sectioning__openai_gpt_5_5",
        ],
        variantSources: {
          page_sectioning__google_gemini_2_5_pro: "file",
          page_sectioning__openai_gpt_5_5: "file",
        },
      },
    ])
  })

  it("marks model variants with both shipped files and user versions", async () => {
    writePrompt("page_sectioning", "base")
    writeModelPrompt("google_gemini_2_5_pro", "page_sectioning", "folder variant")
    const versionDir = path.join(promptsDir, ".versions", "page_sectioning__google_gemini_2_5_pro")
    fs.mkdirSync(versionDir, { recursive: true })
    fs.writeFileSync(path.join(versionDir, "20260101T000000000Z-000.liquid"), "version", "utf-8")

    const res = await app().request("/prompts")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toEqual([
      {
        name: "page_sectioning",
        variants: ["page_sectioning__google_gemini_2_5_pro"],
        variantSources: {
          page_sectioning__google_gemini_2_5_pro: "file+version",
        },
      },
    ])
  })

  it("lists folder variants when the base prompt only exists as a version", async () => {
    const baseVersionDir = path.join(promptsDir, ".versions", "page_sectioning")
    fs.mkdirSync(baseVersionDir, { recursive: true })
    fs.writeFileSync(
      path.join(baseVersionDir, "20260101T000000000Z-000.liquid"),
      "base version",
      "utf-8",
    )
    writeModelPrompt("openai_gpt_5_5", "page_sectioning", "folder variant")

    const res = await app().request("/prompts")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toEqual([
      {
        name: "page_sectioning",
        variants: ["page_sectioning__openai_gpt_5_5"],
        variantSources: {
          page_sectioning__openai_gpt_5_5: "file",
        },
      },
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
    const versions = readLiquidVersions(versionDir)
    expect(versions).toHaveLength(1)
    expect(fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")).toBe("new content")
    expect(fs.readFileSync(path.join(versionDir, ".current"), "utf-8").trim()).toBe(versions[0])
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

  it("normalizes bare OpenAI model ids before resolving prompt variants", async () => {
    writePrompt("test_prompt", "old content")
    const res = await app().request("/prompts/test_prompt?model=gpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "gpt content" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolvedName).toBe("test_prompt__openai_gpt_5_5")
    expect(body.modelId).toBe("openai:gpt-5.5")

    const readRes = await app().request("/prompts/test_prompt?model=openai%3Agpt-5.5")
    const readBody = await readRes.json()
    expect(readBody.content).toBe("gpt content")
  })

  it("reads model-specific prompt files from model folders", async () => {
    writePrompt("test_prompt", "base content")
    writePrompt("test_prompt__google_gemini_2_5_pro", "legacy flat content")
    writeModelPrompt("google_gemini_2_5_pro", "test_prompt", "folder content")

    const res = await app().request("/prompts/test_prompt?model=google%3Agemini-2.5-pro")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolvedName).toBe("test_prompt__google_gemini_2_5_pro")
    expect(body.modelId).toBe("google:gemini-2.5-pro")
    expect(body.source).toBe("global")
    expect(body.content).toBe("folder content")
  })

  it("preserves all global prompt versions", async () => {
    writePrompt("test_prompt", "old content")
    vi.useFakeTimers()

    for (let index = 1; index <= 8; index += 1) {
      vi.setSystemTime(new Date(`2026-01-02T03:04:0${index}.000Z`))
      const res = await app().request("/prompts/test_prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `version ${index}` }),
      })
      expect(res.status).toBe(200)
    }

    const versionDir = path.join(promptsDir, ".versions", "test_prompt")
    const versions = readLiquidVersions(versionDir)
    expect(versions).toEqual([
      "20260102T030401000Z-000.liquid",
      "20260102T030402000Z-000.liquid",
      "20260102T030403000Z-000.liquid",
      "20260102T030404000Z-000.liquid",
      "20260102T030405000Z-000.liquid",
      "20260102T030406000Z-000.liquid",
      "20260102T030407000Z-000.liquid",
      "20260102T030408000Z-000.liquid",
    ])
    expect(fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")).toBe("version 1")
    expect(fs.readFileSync(path.join(versionDir, versions.at(-1)!), "utf-8")).toBe("version 8")
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

describe("GET /prompts/:name/versions", () => {
  it("lists global prompt versions with the current version marked", async () => {
    writePrompt("test_prompt", "default content")
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"))
    await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "first version" }),
    })
    vi.setSystemTime(new Date("2026-01-02T03:04:06.007Z"))
    await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "second version" }),
    })

    const res = await app().request("/prompts/test_prompt/versions")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("test_prompt")
    expect(body.resolvedName).toBe("test_prompt")
    expect(body.fallbackContent).toBe("default content")
    expect(body.fallbackResolvedName).toBe("test_prompt")
    expect(body.currentVersion).toBe("20260102T030406007Z-000.liquid")
    expect(body.versions).toEqual([
      {
        version: "20260102T030406007Z-000.liquid",
        createdAt: "2026-01-02T03:04:06.007Z",
        content: "second version",
        isCurrent: true,
      },
      {
        version: "20260102T030405006Z-000.liquid",
        createdAt: "2026-01-02T03:04:05.006Z",
        content: "first version",
        isCurrent: false,
      },
    ])
  })

  it("lists model-specific global prompt versions", async () => {
    writePrompt("test_prompt", "default content")
    await app().request("/prompts/test_prompt?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "gpt version" }),
    })

    const res = await app().request("/prompts/test_prompt/versions?model=openai%3Agpt-5.5")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolvedName).toBe("test_prompt__openai_gpt_5_5")
    expect(body.modelId).toBe("openai:gpt-5.5")
    expect(body.fallbackContent).toBe("default content")
    expect(body.fallbackResolvedName).toBe("test_prompt")
    expect(body.versions).toHaveLength(1)
    expect(body.versions[0].content).toBe("gpt version")
    expect(body.versions[0].isCurrent).toBe(true)
  })

  it("uses the shipped model prompt as the version diff fallback when present", async () => {
    writePrompt("test_prompt", "default content")
    writeModelPrompt("openai_gpt_5_5", "test_prompt", "shipped gpt fallback")
    await app().request("/prompts/test_prompt?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "custom gpt version" }),
    })

    const res = await app().request("/prompts/test_prompt/versions?model=openai%3Agpt-5.5")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resolvedName).toBe("test_prompt__openai_gpt_5_5")
    expect(body.fallbackContent).toBe("shipped gpt fallback")
    expect(body.fallbackResolvedName).toBe("test_prompt__openai_gpt_5_5")
    expect(body.versions[0].content).toBe("custom gpt version")
  })
})

describe("PUT /prompts/:name/versions/:version/current", () => {
  it("selects an older global prompt version as current", async () => {
    writePrompt("test_prompt", "default content")
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"))
    await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "first version" }),
    })
    vi.setSystemTime(new Date("2026-01-02T03:04:06.007Z"))
    await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "second version" }),
    })

    const res = await app().request(
      "/prompts/test_prompt/versions/20260102T030405006Z-000.liquid/current",
      { method: "PUT" },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe("first version")
    expect(body.version).toBe("20260102T030405006Z-000.liquid")

    const readRes = await app().request("/prompts/test_prompt")
    const readBody = await readRes.json()
    expect(readBody.content).toBe("first version")

    const versionDir = path.join(promptsDir, ".versions", "test_prompt")
    expect(fs.readFileSync(path.join(versionDir, ".current"), "utf-8").trim()).toBe(
      "20260102T030405006Z-000.liquid",
    )
  })

  it("makes a new save current after an older version was selected", async () => {
    writePrompt("test_prompt", "default content")
    vi.useFakeTimers()

    for (let index = 1; index <= 2; index += 1) {
      vi.setSystemTime(new Date(`2026-01-02T03:04:0${index}.000Z`))
      await app().request("/prompts/test_prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `version ${index}` }),
      })
    }

    await app().request(
      "/prompts/test_prompt/versions/20260102T030401000Z-000.liquid/current",
      { method: "PUT" },
    )

    vi.setSystemTime(new Date("2026-01-02T03:04:03.000Z"))
    await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "version 3" }),
    })

    const versionDir = path.join(promptsDir, ".versions", "test_prompt")
    const versions = readLiquidVersions(versionDir)
    expect(versions).toEqual([
      "20260102T030401000Z-000.liquid",
      "20260102T030402000Z-000.liquid",
      "20260102T030403000Z-000.liquid",
    ])
    expect(fs.readFileSync(path.join(versionDir, ".current"), "utf-8").trim()).toBe(
      "20260102T030403000Z-000.liquid",
    )
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

  it("resets a global model override back to the model folder prompt", async () => {
    writePrompt("test_prompt", "default content")
    writeModelPrompt("anthropic_claude_opus_4_6", "test_prompt", "folder content")
    await app().request("/prompts/test_prompt?model=anthropic%3Aclaude-opus-4-6", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "edited content" }),
    })

    const resetRes = await app().request("/prompts/test_prompt?model=anthropic%3Aclaude-opus-4-6", {
      method: "DELETE",
    })

    expect(resetRes.status).toBe(200)
    const body = await resetRes.json()
    expect(body.resolvedName).toBe("test_prompt__anthropic_claude_opus_4_6")
    expect(body.modelId).toBe("anthropic:claude-opus-4-6")
    expect(body.content).toBe("folder content")
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
    writeModelPrompt("openai_gpt_5_5", "page_sectioning", "global gpt 5.5 folder")
    const res = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("global")
    expect(body.resolvedName).toBe("page_sectioning__openai_gpt_5_5")
    expect(body.modelId).toBe("openai:gpt-5.5")
    expect(body.content).toBe("global gpt 5.5 folder")
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
    const versions = readLiquidVersions(versionDir)
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
    const versions = readLiquidVersions(versionDir)
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

  it("preserves all book prompt versions", async () => {
    writePrompt("page_sectioning", "global")
    vi.useFakeTimers()

    for (let index = 1; index <= 8; index += 1) {
      vi.setSystemTime(new Date(`2026-01-02T03:04:0${index}.000Z`))
      const res = await app().request("/books/my-book/prompts/page_sectioning", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `book version ${index}` }),
      })
      expect(res.status).toBe(200)
    }

    const versionDir = path.join(booksDir, "my-book", "prompts", ".versions", "page_sectioning")
    const versions = readLiquidVersions(versionDir)
    expect(versions).toEqual([
      "20260102T030401000Z-000.liquid",
      "20260102T030402000Z-000.liquid",
      "20260102T030403000Z-000.liquid",
      "20260102T030404000Z-000.liquid",
      "20260102T030405000Z-000.liquid",
      "20260102T030406000Z-000.liquid",
      "20260102T030407000Z-000.liquid",
      "20260102T030408000Z-000.liquid",
    ])
    expect(fs.readFileSync(path.join(versionDir, versions[0]), "utf-8")).toBe("book version 1")
    expect(fs.readFileSync(path.join(versionDir, versions.at(-1)!), "utf-8")).toBe("book version 8")
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

describe("GET /books/:label/prompts/:name/versions", () => {
  it("lists book prompt versions with global fallback content", async () => {
    writePrompt("page_sectioning", "global fallback")
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"))
    await app().request("/books/my-book/prompts/page_sectioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "first book version" }),
    })
    vi.setSystemTime(new Date("2026-01-02T03:04:06.007Z"))
    await app().request("/books/my-book/prompts/page_sectioning", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "second book version" }),
    })

    const res = await app().request("/books/my-book/prompts/page_sectioning/versions")

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("page_sectioning")
    expect(body.resolvedName).toBe("page_sectioning")
    expect(body.fallbackContent).toBe("global fallback")
    expect(body.fallbackResolvedName).toBe("page_sectioning")
    expect(body.currentVersion).toBe("20260102T030406007Z-000.liquid")
    expect(body.versions.map((version: { content: string; isCurrent: boolean }) => ({
      content: version.content,
      isCurrent: version.isCurrent,
    }))).toEqual([
      { content: "second book version", isCurrent: true },
      { content: "first book version", isCurrent: false },
    ])
  })
})

describe("PUT /books/:label/prompts/:name/versions/:version/current", () => {
  it("selects an older book prompt version as current", async () => {
    writePrompt("page_sectioning", "global fallback")
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-01-02T03:04:05.006Z"))
    await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "first model book version" }),
    })
    vi.setSystemTime(new Date("2026-01-02T03:04:06.007Z"))
    await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "second model book version" }),
    })

    const res = await app().request(
      "/books/my-book/prompts/page_sectioning/versions/20260102T030405006Z-000.liquid/current?model=openai%3Agpt-5.5",
      { method: "PUT" },
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.source).toBe("book")
    expect(body.resolvedName).toBe("page_sectioning__openai_gpt_5_5")
    expect(body.content).toBe("first model book version")
    expect(body.version).toBe("20260102T030405006Z-000.liquid")

    const readRes = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5")
    const readBody = await readRes.json()
    expect(readBody.content).toBe("first model book version")
  })
})

describe("DELETE /books/:label/prompts/:name", () => {
  it("resets a book prompt override back to the global fallback", async () => {
    writePrompt("page_sectioning", "global fallback")
    await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "book model override" }),
    })

    const resetRes = await app().request("/books/my-book/prompts/page_sectioning?model=openai%3Agpt-5.5", {
      method: "DELETE",
    })

    expect(resetRes.status).toBe(200)
    const body = await resetRes.json()
    expect(body.source).toBe("global")
    expect(body.resolvedName).toBe("page_sectioning")
    expect(body.content).toBe("global fallback")
    expect(fs.existsSync(
      path.join(booksDir, "my-book", "prompts", ".versions", "page_sectioning__openai_gpt_5_5"),
    )).toBe(false)
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

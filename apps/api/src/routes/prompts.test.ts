import { describe, it, expect, beforeEach, afterEach } from "vitest"
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

// ---- Prompts ----

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
  it("updates prompt content", async () => {
    writePrompt("test_prompt", "old content")
    const res = await app().request("/prompts/test_prompt", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "new content" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe("new content")
    expect(fs.readFileSync(path.join(promptsDir, "test_prompt.liquid"), "utf-8")).toBe("new content")
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
    const onDisk = fs.readFileSync(
      path.join(booksDir, "my-book", "prompts", "page_sectioning.liquid"),
      "utf-8"
    )
    expect(onDisk).toBe("override")
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

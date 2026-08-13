import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createPresetRoutes } from "./presets.js"

let tmpDir: string
let booksDir: string
let configPath: string
let bundledDir: string
let writableDir: string
let bookStyleguidesDir: string
const previousStyleguidesDir = process.env.STYLEGUIDES_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-presets-route-"))
  booksDir = path.join(tmpDir, "books")
  configPath = path.join(tmpDir, "resources", "config.yaml")
  bundledDir = path.join(tmpDir, "resources", "assets", "styleguides")
  writableDir = path.join(booksDir, ".styleguides")
  bookStyleguidesDir = path.join(booksDir, "my-book", "styleguides")
  delete process.env.STYLEGUIDES_DIR
  fs.mkdirSync(bundledDir, { recursive: true })
  fs.mkdirSync(writableDir, { recursive: true })
  fs.mkdirSync(bookStyleguidesDir, { recursive: true })
  fs.writeFileSync(
    configPath,
    "# keep this comment\nstructure_types: {}\nrole_types: {}\n",
    "utf-8",
  )
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previousStyleguidesDir === undefined) delete process.env.STYLEGUIDES_DIR
  else process.env.STYLEGUIDES_DIR = previousStyleguidesDir
})

function app() {
  return createPresetRoutes(configPath, booksDir)
}

describe("GET /styleguides", () => {
  it("adds book-local guides only when the book is requested", async () => {
    fs.writeFileSync(path.join(bundledDir, "default.md"), "# default")
    fs.writeFileSync(path.join(writableDir, "uploaded.md"), "# uploaded")
    fs.writeFileSync(path.join(bookStyleguidesDir, "my-book-generated.md"), "# generated")

    const globalResponse = await app().request("/styleguides")
    expect(await globalResponse.json()).toEqual({ styleguides: ["default", "uploaded"] })

    const bookResponse = await app().request("/styleguides?book=my-book")
    expect(await bookResponse.json()).toEqual({
      styleguides: ["default", "my-book-generated", "uploaded"],
    })
  })

  it("de-duplicates names across book, uploaded, and bundled sources", async () => {
    for (const dir of [bookStyleguidesDir, writableDir, bundledDir]) {
      fs.writeFileSync(path.join(dir, "default.md"), `# ${dir}`)
    }
    const response = await app().request("/styleguides?book=my-book")
    expect(await response.json()).toEqual({ styleguides: ["default"] })
  })

  it("rejects an invalid book label", async () => {
    const response = await app().request("/styleguides?book=../outside")
    expect(response.status).toBe(400)
  })

  it("lists and previews a generated guide for a dotted book label", async () => {
    const dottedDir = path.join(booksDir, "book.v1", "styleguides")
    fs.mkdirSync(dottedDir, { recursive: true })
    fs.writeFileSync(path.join(dottedDir, "book-v1-generated.md"), "# Generated")

    const listResponse = await app().request("/styleguides?book=book.v1")
    expect(await listResponse.json()).toEqual({ styleguides: ["book-v1-generated"] })

    const previewResponse = await app().request(
      "/styleguides/book-v1-generated/preview?book=book.v1",
    )
    expect(previewResponse.status).toBe(200)
    expect((await previewResponse.json()).html).toContain("Generated")
  })
})

describe("GET /styleguides/:name/preview", () => {
  it("uses markdown from the winning source instead of another source's preview", async () => {
    fs.writeFileSync(path.join(writableDir, "default.md"), "# Writable override")
    fs.writeFileSync(path.join(bundledDir, "default.md"), "# Bundled")
    fs.writeFileSync(path.join(bundledDir, "default-preview.html"), "<p>Bundled preview</p>")

    const response = await app().request("/styleguides/default/preview")
    const body = await response.json()
    expect(body.html).toContain("Writable override")
    expect(body.html).not.toContain("Bundled preview")
  })

  it("serves a book-local generated preview", async () => {
    fs.writeFileSync(path.join(bookStyleguidesDir, "my-book-generated.md"), "# Generated")
    fs.writeFileSync(
      path.join(bookStyleguidesDir, "my-book-generated-preview.html"),
      "<h1>Generated preview</h1>",
    )
    const response = await app().request(
      "/styleguides/my-book-generated/preview?book=my-book",
    )
    expect(await response.json()).toEqual({
      name: "my-book-generated",
      html: "<h1>Generated preview</h1>",
    })
  })

  it("returns 404 for an unknown style guide", async () => {
    const response = await app().request("/styleguides/nope/preview")
    expect(response.status).toBe(404)
  })
})

describe("POST /styleguides/upload", () => {
  it("writes uploads globally and invalidates a stale preview", async () => {
    const stalePreview = path.join(writableDir, "custom-guide-preview.html")
    fs.writeFileSync(stalePreview, "<p>stale</p>")
    const form = new FormData()
    form.append("file", new File(["# uploaded"], "custom-guide.md", { type: "text/markdown" }))

    const response = await app().request("/styleguides/upload", { method: "POST", body: form })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ name: "custom-guide" })
    expect(fs.readFileSync(path.join(writableDir, "custom-guide.md"), "utf-8")).toBe("# uploaded")
    expect(fs.existsSync(stalePreview)).toBe(false)
    expect(fs.existsSync(path.join(bundledDir, "custom-guide.md"))).toBe(false)
  })

  it("returns a clear error when the configured target is invalid", async () => {
    const invalidTarget = path.join(tmpDir, "not-a-directory")
    fs.writeFileSync(invalidTarget, "blocked")
    process.env.STYLEGUIDES_DIR = invalidTarget
    const form = new FormData()
    form.append("file", new File(["# uploaded"], "custom-guide.md"))

    const response = await app().request("/styleguides/upload", { method: "POST", body: form })
    expect(response.status).toBe(500)
    expect(await response.text()).toContain("configured target is not a directory")
  })
})

describe("global default model", () => {
  it("returns GPT-5.4 when no override is configured", async () => {
    const response = await app().request("/config/default-model")
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ model: "openai:gpt-5.4" })
  })

  it("updates the model without discarding the config formatting", async () => {
    const routes = app()
    const response = await routes.request("/config/default-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: " Anthropic:Claude-Sonnet-4-6 " }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ model: "anthropic:claude-sonnet-4-6" })
    expect(fs.readFileSync(configPath, "utf-8")).toContain("# keep this comment")
    expect(await (await routes.request("/config/default-model")).json()).toEqual({
      model: "anthropic:claude-sonnet-4-6",
    })
  })

  it("rejects invalid model ids", async () => {
    const response = await app().request("/config/default-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "../invalid" }),
    })
    expect(response.status).toBe(400)
  })
})

describe("global specialized model defaults", () => {
  it("returns built-in defaults when no overrides are configured", async () => {
    const response = await app().request("/config/specialized-model-defaults")
    expect(await response.json()).toEqual({
      imageGeneration: "openai:gpt-image-2",
      speechGeneration: "gpt-4o-mini-tts",
    })
  })

  it("updates both defaults without discarding config formatting", async () => {
    const response = await app().request("/config/specialized-model-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageGeneration: " OpenAI:DALL-E-3 ", speechGeneration: " TTS-1-HD " }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ imageGeneration: "openai:dall-e-3", speechGeneration: "tts-1-hd" })
    const content = fs.readFileSync(configPath, "utf-8")
    expect(content).toContain("# keep this comment")
    expect(content).toContain('default_image_generation_model: "openai:dall-e-3"')
    expect(content).toContain('default_speech_generation_model: "tts-1-hd"')
  })

  it("rejects invalid specialized model ids", async () => {
    const response = await app().request("/config/specialized-model-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageGeneration: "gpt-image-2", speechGeneration: "../invalid" }),
    })
    expect(response.status).toBe(400)
  })
})

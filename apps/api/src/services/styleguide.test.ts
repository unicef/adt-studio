import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getBookStyleguidesDir,
  getBundledStyleguidesDir,
  getGeneratedStyleguideName,
  getWritableStyleguidesDir,
  loadStyleguideContent,
  resolveStyleguideSource,
  StyleguideWriteError,
  writeStyleguideFiles,
} from "./styleguide.js"

let tmpDir: string
let booksDir: string
let configPath: string
let bundledDir: string
let writableDir: string
let bookDir: string
const previousStyleguidesDir = process.env.STYLEGUIDES_DIR

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-styleguide-"))
  booksDir = path.join(tmpDir, "books")
  configPath = path.join(tmpDir, "resources", "config.yaml")
  bundledDir = getBundledStyleguidesDir(configPath)
  delete process.env.STYLEGUIDES_DIR
  writableDir = getWritableStyleguidesDir(booksDir)
  bookDir = getBookStyleguidesDir(booksDir, "my-book")
  fs.mkdirSync(bundledDir, { recursive: true })
  fs.mkdirSync(writableDir, { recursive: true })
  fs.mkdirSync(bookDir, { recursive: true })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpDir, { recursive: true, force: true })
  if (previousStyleguidesDir === undefined) delete process.env.STYLEGUIDES_DIR
  else process.env.STYLEGUIDES_DIR = previousStyleguidesDir
})

describe("styleguide directories", () => {
  it("keeps generated guides inside the book and uploads at application level", () => {
    expect(bookDir).toBe(path.join(path.resolve(booksDir), "my-book", "styleguides"))
    expect(writableDir).toBe(path.join(path.resolve(booksDir), ".styleguides"))
  })

  it("honors the STYLEGUIDES_DIR upload override", () => {
    const custom = path.join(tmpDir, "custom-styleguides")
    process.env.STYLEGUIDES_DIR = custom
    expect(getWritableStyleguidesDir(booksDir)).toBe(path.resolve(custom))
  })

  it("rejects traversal in a book label", () => {
    expect(() => getBookStyleguidesDir(booksDir, "../outside")).toThrow()
  })

  it("derives a valid generated name from a book label containing dots", () => {
    expect(getGeneratedStyleguideName("book.v1")).toBe("book-v1-generated")
  })
})

describe("styleguide source resolution", () => {
  it("loads book-local content before uploaded and bundled content", () => {
    fs.writeFileSync(path.join(bookDir, "default.md"), "book content")
    fs.writeFileSync(path.join(writableDir, "default.md"), "uploaded content")
    fs.writeFileSync(path.join(bundledDir, "default.md"), "bundled content")
    expect(loadStyleguideContent("default", configPath, booksDir, "my-book")).toBe(
      "book content",
    )
  })

  it("falls back from uploaded content to bundled presets", () => {
    fs.writeFileSync(path.join(writableDir, "uploaded.md"), "uploaded content")
    fs.writeFileSync(path.join(bundledDir, "default.md"), "bundled content")
    expect(loadStyleguideContent("uploaded", configPath, booksDir, "my-book")).toBe(
      "uploaded content",
    )
    expect(loadStyleguideContent("default", configPath, booksDir, "my-book")).toBe(
      "bundled content",
    )
  })

  it("keeps a preview in the same source directory as its markdown", () => {
    fs.writeFileSync(path.join(writableDir, "default.md"), "uploaded content")
    fs.writeFileSync(path.join(bundledDir, "default.md"), "bundled content")
    fs.writeFileSync(path.join(bundledDir, "default-preview.html"), "bundled preview")
    const source = resolveStyleguideSource("default", configPath, booksDir)
    expect(source?.kind).toBe("uploaded")
    expect(source?.previewPath).toBeUndefined()
  })

  it("returns undefined for missing and traversing names", () => {
    expect(loadStyleguideContent(undefined, configPath, booksDir, "my-book")).toBeUndefined()
    expect(loadStyleguideContent("missing", configPath, booksDir, "my-book")).toBeUndefined()
    expect(resolveStyleguideSource("../../secret", configPath, booksDir, "my-book")).toBeUndefined()
  })
})

describe("writeStyleguideFiles", () => {
  it("writes markdown and preview together", () => {
    writeStyleguideFiles({
      dir: bookDir,
      name: "my-book-generated",
      content: "generated markdown",
      previewHtml: "generated preview",
    })
    expect(fs.readFileSync(path.join(bookDir, "my-book-generated.md"), "utf-8")).toBe(
      "generated markdown",
    )
    expect(
      fs.readFileSync(path.join(bookDir, "my-book-generated-preview.html"), "utf-8"),
    ).toBe("generated preview")
  })

  it("removes a stale preview when uploading markdown only", () => {
    const previewPath = path.join(writableDir, "custom-preview.html")
    fs.writeFileSync(previewPath, "stale")
    writeStyleguideFiles({ dir: writableDir, name: "custom", content: "fresh" })
    expect(fs.existsSync(previewPath)).toBe(false)
  })

  it("restores the previous pair when the preview write fails", () => {
    const markdownPath = path.join(bookDir, "my-book-generated.md")
    const previewPath = path.join(bookDir, "my-book-generated-preview.html")
    fs.writeFileSync(markdownPath, "old markdown")
    fs.writeFileSync(previewPath, "old preview")

    const originalWriteFileSync = fs.writeFileSync
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      if (path.resolve(String(file)) === previewPath && data === "new preview") {
        const error = new Error("blocked preview") as NodeJS.ErrnoException
        error.code = "EACCES"
        throw error
      }
      return originalWriteFileSync(file, data, options)
    })

    expect(() =>
      writeStyleguideFiles({
        dir: bookDir,
        name: "my-book-generated",
        content: "new markdown",
        previewHtml: "new preview",
      }),
    ).toThrow("target directory is not writable")
    expect(fs.readFileSync(markdownPath, "utf-8")).toBe("old markdown")
    expect(fs.readFileSync(previewPath, "utf-8")).toBe("old preview")
  })

  it("maps invalid target failures to a clear error", () => {
    const invalidTarget = path.join(tmpDir, "not-a-directory")
    fs.writeFileSync(invalidTarget, "blocked")
    expect(() =>
      writeStyleguideFiles({ dir: invalidTarget, name: "custom", content: "content" }),
    ).toThrowError(
      new StyleguideWriteError(
        "Could not save the style guide because the configured target is not a directory.",
      ),
    )
  })
})

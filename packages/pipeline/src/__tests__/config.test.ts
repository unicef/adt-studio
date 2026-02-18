import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { deepMerge, loadBookConfig } from "../config.js"

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  dirs.length = 0
})

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-pipeline-config-test-"))
  dirs.push(dir)
  return dir
}

describe("deepMerge", () => {
  it("deep-merges plain objects and overrides arrays", () => {
    const merged = deepMerge(
      {
        text_classification: { prompt: "base", max_retries: 2 },
        pruned_text_types: ["header_text"],
      },
      {
        text_classification: { max_retries: 5 },
        pruned_text_types: ["footer_text"],
      }
    )

    expect(merged).toEqual({
      text_classification: { prompt: "base", max_retries: 5 },
      pruned_text_types: ["footer_text"],
    })
  })

  it("removes keys when override value is null", () => {
    const merged = deepMerge(
      {
        section_types: { title: "Title section", header: "Header", footer: "Footer" },
      },
      {
        section_types: { title: "Title section", footer: null },
      }
    )

    expect(merged).toEqual({
      section_types: { title: "Title section", header: "Header" },
    })
  })

  it("removes top-level keys when override value is null", () => {
    const merged = deepMerge(
      { a: 1, b: 2, c: 3 },
      { b: null }
    )

    expect(merged).toEqual({ a: 1, c: 3 })
  })
})

describe("loadBookConfig", () => {
  it("loads and merges book-level config overrides", () => {
    const booksRoot = makeTempDir()
    const label = "book-one"
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    const bookDir = path.join(booksRoot, label)
    fs.mkdirSync(bookDir, { recursive: true })

    fs.writeFileSync(
      baseConfigPath,
      `text_types:
  heading: Heading
text_group_types:
  paragraph: Paragraph
text_classification:
  prompt: text_classification
  model: openai:gpt-4o
concurrency: 2
start_page: 1
end_page: 20
pruned_text_types:
  - header_text
`
    )

    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      `concurrency: 7
start_page: 3
end_page: 8
pruned_text_types:
  - footer_text
`
    )

    const config = loadBookConfig(label, booksRoot, baseConfigPath)

    expect(config.text_classification?.prompt).toBe("text_classification")
    expect(config.text_classification?.model).toBe("openai:gpt-4o")
    expect(config.concurrency).toBe(7)
    expect(config.start_page).toBe(3)
    expect(config.end_page).toBe(8)
    expect(config.pruned_text_types).toEqual(["footer_text"])
  })

  it("rejects invalid persisted page ranges", () => {
    const booksRoot = makeTempDir()
    const label = "bad-range"
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    const bookDir = path.join(booksRoot, label)
    fs.mkdirSync(bookDir, { recursive: true })

    fs.writeFileSync(
      baseConfigPath,
      `text_types:
  heading: Heading
text_group_types:
  paragraph: Paragraph
`
    )

    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      `start_page: 9
end_page: 2
`
    )

    expect(() => loadBookConfig(label, booksRoot, baseConfigPath)).toThrow(
      "end_page must be greater than or equal to start_page"
    )
  })

  it("rejects unsafe labels before resolving book config path", () => {
    const booksRoot = makeTempDir()
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    fs.writeFileSync(
      baseConfigPath,
      `text_types:
  heading: Heading
text_group_types:
  paragraph: Paragraph
`
    )

    expect(() =>
      loadBookConfig("../escape", booksRoot, baseConfigPath)
    ).toThrow("Invalid book label")
  })
})

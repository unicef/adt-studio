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
pruned_text_types:
  - header_text
`
    )

    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      `concurrency: 7
pruned_text_types:
  - footer_text
`
    )

    const config = loadBookConfig(label, booksRoot, baseConfigPath)

    expect(config.text_classification?.prompt).toBe("text_classification")
    expect(config.text_classification?.model).toBe("openai:gpt-4o")
    expect(config.concurrency).toBe(7)
    expect(config.pruned_text_types).toEqual(["footer_text"])
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

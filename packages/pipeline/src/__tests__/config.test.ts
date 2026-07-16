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
        page_sectioning: { prompt: "base", max_retries: 2 },
        pruned_role_types: ["header"],
      },
      {
        page_sectioning: { max_retries: 5 },
        pruned_role_types: ["footer"],
      }
    )

    expect(merged).toEqual({
      page_sectioning: { prompt: "base", max_retries: 5 },
      pruned_role_types: ["footer"],
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
      `structure_types:
  paragraph: Paragraph
role_types:
  heading: Heading
default_image_generation_model: openai:gpt-image-2
default_speech_generation_model: gpt-4o-mini-tts
page_sectioning:
  prompt: page_sectioning
  model: openai:gpt-4o
concurrency: 2
start_page: 1
end_page: 20
pruned_role_types:
  - header
`
    )

    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      `concurrency: 7
start_page: 3
end_page: 8
default_image_generation_model: openai:dall-e-3
default_speech_generation_model: tts-1-hd
pruned_role_types:
  - footer
`
    )

    const config = loadBookConfig(label, booksRoot, baseConfigPath)

    expect(config.page_sectioning?.prompt).toBe("page_sectioning")
    expect(config.page_sectioning?.model).toBe("openai:gpt-4o")
    expect(config.concurrency).toBe(7)
    expect(config.start_page).toBe(3)
    expect(config.end_page).toBe(8)
    expect(config.pruned_role_types).toEqual(["footer"])
    expect(config.default_image_generation_model).toBe("openai:dall-e-3")
    expect(config.default_speech_generation_model).toBe("tts-1-hd")
  })

  it("rejects invalid persisted page ranges", () => {
    const booksRoot = makeTempDir()
    const label = "bad-range"
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    const bookDir = path.join(booksRoot, label)
    fs.mkdirSync(bookDir, { recursive: true })

    fs.writeFileSync(
      baseConfigPath,
      `structure_types:
  paragraph: Paragraph
role_types:
  heading: Heading
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


  it("merges accessibility assessment book overrides", () => {
    const booksRoot = makeTempDir()
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    const label = "book-a11y-config"
    const bookDir = path.join(booksRoot, label)
    fs.mkdirSync(bookDir, { recursive: true })

    fs.writeFileSync(
      baseConfigPath,
      `structure_types:
  paragraph: Paragraph
role_types:
  heading: Heading
accessibility_assessment:
  run_only_tags:
    - wcag2a
    - wcag2aa
  disabled_rules:
    - color-contrast
`
    )

    fs.writeFileSync(
      path.join(bookDir, "config.yaml"),
      `accessibility_assessment:
  run_only_tags:
    - wcag2a
    - cat.forms
  disabled_rules: []
`
    )

    const config = loadBookConfig(label, booksRoot, baseConfigPath)

    expect(config.accessibility_assessment?.run_only_tags).toEqual(["wcag2a", "cat.forms"])
    expect(config.accessibility_assessment?.disabled_rules).toEqual([])
  })

  it("rejects unsafe labels before resolving book config path", () => {
    const booksRoot = makeTempDir()
    const baseConfigPath = path.join(booksRoot, "config.yaml")
    fs.writeFileSync(
      baseConfigPath,
      `structure_types:
  paragraph: Paragraph
role_types:
  heading: Heading
`
    )

    expect(() =>
      loadBookConfig("../escape", booksRoot, baseConfigPath)
    ).toThrow("Invalid book label")
  })
})

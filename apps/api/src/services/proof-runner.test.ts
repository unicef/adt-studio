import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createBookStorage } from "@adt/storage"
import { createProofRunner } from "./proof-runner.js"

function writeBaseConfig(configPath: string): void {
  fs.writeFileSync(
    configPath,
    `text_types:
  section_text: Main body text
text_group_types:
  paragraph: Paragraph
`
  )
}

function seedBook(
  booksDir: string,
  label: string,
  options: { withRendering: boolean; renderingSections?: unknown[] }
): string {
  const pageId = `${label}_p1`
  const storage = createBookStorage(label, booksDir)
  try {
    storage.putExtractedPage({
      pageId,
      pageNumber: 1,
      text: "Page text",
      pageImage: {
        imageId: `${pageId}_page`,
        buffer: Buffer.from("fake-page-image"),
        format: "png",
        hash: "hash-page",
        width: 800,
        height: 600,
      },
      images: [],
    })

    storage.putNodeData("storyboard-acceptance", "book", {
      acceptedAt: new Date().toISOString(),
    })

    if (options.withRendering) {
      storage.putNodeData("web-rendering", pageId, {
        sections: options.renderingSections ?? [],
      })
    }
  } finally {
    storage.close()
  }

  return pageId
}

describe("ProofRunner", () => {
  const runner = createProofRunner()
  let tmpDir = ""

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = ""
    }
  })

  it("errors when a page has no web-rendering row", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-runner-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    const label = "missing-rendering"
    seedBook(booksDir, label, { withRendering: false })

    await expect(
      runner.run(
        label,
        {
          booksDir,
          apiKey: "sk-test",
          promptsDir,
          configPath,
        },
        { emit: () => {} }
      )
    ).rejects.toThrow("Missing web-rendering output for page")
  })

  it("treats empty web-rendering as noop and writes empty image-captioning output", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proof-runner-"))
    const booksDir = path.join(tmpDir, "books")
    const promptsDir = path.join(tmpDir, "prompts")
    const configPath = path.join(tmpDir, "config.yaml")
    fs.mkdirSync(promptsDir, { recursive: true })
    writeBaseConfig(configPath)

    const label = "empty-rendering"
    const pageId = seedBook(booksDir, label, {
      withRendering: true,
      renderingSections: [],
    })

    await runner.run(
      label,
      {
        booksDir,
        apiKey: "sk-test",
        promptsDir,
        configPath,
      },
      { emit: () => {} }
    )

    const storage = createBookStorage(label, booksDir)
    try {
      const result = storage.getLatestNodeData("image-captioning", pageId)
      expect(result).not.toBeNull()
      expect(result?.data).toEqual({ captions: [] })
    } finally {
      storage.close()
    }
  })
})

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { GenerateObjectOptions } from "@adt/llm"
import { createBookStorage } from "@adt/storage"
import type { ImageClassificationOutput } from "@adt/types"
import { createStageRunner } from "./stage-runner.js"
import type { StageRunOptions } from "./stage-service.js"

const { generateObject } = vi.hoisted(() => ({
  generateObject: vi.fn<(input: GenerateObjectOptions) => Promise<unknown>>(),
}))

vi.mock("@adt/llm", async (importOriginal) => ({
  ...await importOriginal<typeof import("@adt/llm")>(),
  createLLMModel: () => ({ generateObject }),
}))

// Keep the real classification, dedup helpers and storage; only unrelated
// extraction/LLM steps are stubbed so the test enters through the Extract runner.
vi.mock("@adt/pipeline", async (importOriginal) => ({
  ...await importOriginal<typeof import("@adt/pipeline")>(),
  extractPDF: vi.fn(async () => {}),
  extractMetadata: vi.fn(async () => ({ title: "Fixture", language_code: "en" })),
  generateBookSummary: vi.fn(async () => ({ summary: "Fixture" })),
  buildBookOutlineEvidence: vi.fn(() => []),
  generateBookOutline: vi.fn(async () => ({ reasoning: "", entries: [] })),
}))

describe("Extract runner image meaningfulness hash dedup", () => {
  let root: string
  let options: StageRunOptions
  const pageIds = ["pg001", "pg002", "pg003", "pg004"]
  const emit = vi.fn()
  const decide = vi.fn<NonNullable<StageRunOptions["requestPageDecision"]>>()

  function modelVerdict(input: GenerateObjectOptions) {
    expect(input.prompt).toBe("image_meaningfulness")
    const images = (input.context as { images: Array<{ imageId: string }> }).images
    return {
      object: {
        images: images.map(({ imageId }) => ({
          image_id: imageId,
          is_meaningful: !imageId.endsWith("_im001"),
          reasoning: "fixture verdict",
        })),
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    }
  }

  function sentImages() {
    return generateObject.mock.calls.map(([input]) => ({
      page: input.log?.pageId,
      images: (input.context as { images: Array<{ imageId: string }> }).images.map((image) => image.imageId),
    }))
  }

  // Reopen storage after the runner closes it: in-memory propagation alone
  // must not satisfy the assertions about saved classifications.
  function savedImages(pageId: string) {
    const storage = createBookStorage("book", root)
    try {
      const row = storage.getLatestNodeData("image-filtering", pageId)
      expect(row).not.toBeNull()
      return (row!.data as ImageClassificationOutput).images
    } finally {
      storage.close()
    }
  }

  function expectUnjudgedLogo(pageId: string) {
    expect(savedImages(pageId).find((image) => image.imageId === `${pageId}_im001`))
      .toEqual({ imageId: `${pageId}_im001`, isPruned: false })
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-runner-dedup-"))
    const promptsDir = path.join(root, "prompts")
    const configPath = path.join(root, "config.yaml")
    fs.mkdirSync(promptsDir)
    fs.writeFileSync(configPath, `
role_types:
  section_text: Main body text
structure_types:
  paragraph: Paragraph
default_model: openai:gpt-4o
concurrency: 1
image_filters:
  meaningfulness: true
  segmentation: false
  cropping: false
image_meaningfulness:
  max_retries: 0
`)
    options = {
      booksDir: root, promptsDir, configPath, credentials: {},
      fromStage: "extract", toStage: "extract",
      pageErrorPolicy: "ask", requestPageDecision: decide,
    }
    const storage = createBookStorage("book", root)
    try {
      for (const [index, pageId] of pageIds.entries()) {
        // Four copies of the logo are shareable. The two-page repeat must
        // still be judged on both pages, and pg002 has only a duplicate.
        const hashes = index === 0 ? ["logo", "unique"]
          : index === 1 ? ["logo"] : ["logo", "two-page-repeat"]
        const image = (imageId: string, hash: string) => ({
          imageId, pageId, hash, buffer: Buffer.from(`png:${hash}`),
          format: "png" as const, width: 300, height: 300,
        })
        storage.putExtractedPage({
          pageId, pageNumber: index + 1, text: `Text of ${pageId}`,
          positionedText: {
            drawItems: [], pageWidth: 300, pageHeight: 300, renderWidth: 300, renderHeight: 300,
          },
          pageImage: image(`${pageId}_page`, `page-${pageId}`),
          images: hashes.map((hash, i) => image(`${pageId}_im00${i + 1}`, hash)),
        })
      }
    } finally {
      storage.close()
    }
    emit.mockReset()
    decide.mockReset().mockResolvedValue("skip")
    generateObject.mockReset().mockImplementation(async (input) => modelVerdict(input))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("judges the logo once, skips duplicate-only pages, and saves shared verdicts", async () => {
    await createStageRunner().run("book", options, { emit })

    expect(sentImages()).toEqual([
      { page: "pg001", images: ["pg001_im001", "pg001_im002"] },
      { page: "pg003", images: ["pg003_im002"] },
      { page: "pg004", images: ["pg004_im002"] },
    ])
    for (const pageId of pageIds) {
      expect(savedImages(pageId)).toEqual([
        { imageId: `${pageId}_im001`, isPruned: true, reason: pageId === "pg001"
          ? "not meaningful: fixture verdict"
          : "duplicate of pg001_im001: not meaningful: fixture verdict" },
        ...(pageId === "pg002" ? [] : [{ imageId: `${pageId}_im002`, isPruned: false }]),
        { imageId: `${pageId}_page`, isPruned: true, reason: "full-page render" },
      ])
    }
    expect(decide).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith({ type: "stage-complete", stage: "extract" })
  })

  it("judges a skipped owner's orphans on their own pages without resending other images", async () => {
    generateObject.mockRejectedValueOnce(new Error("owner failed"))
    await createStageRunner().run("book", options, { emit })

    expect(decide).toHaveBeenCalledExactlyOnceWith({
      step: "image-meaningfulness", pageId: "pg001", error: "owner failed",
    })
    expect(sentImages()).toEqual([
      { page: "pg001", images: ["pg001_im001", "pg001_im002"] },
      { page: "pg003", images: ["pg003_im002"] },
      { page: "pg004", images: ["pg004_im002"] },
      { page: "pg002", images: ["pg002_im001"] },
      { page: "pg003", images: ["pg003_im001"] },
      { page: "pg004", images: ["pg004_im001"] },
    ])
    expectUnjudgedLogo("pg001")
    for (const pageId of pageIds.slice(1)) {
      expect(savedImages(pageId).find((image) => image.imageId === `${pageId}_im001`))
        .toEqual({ imageId: `${pageId}_im001`, isPruned: true, reason: "not meaningful: fixture verdict" })
    }
    expect(emit).toHaveBeenCalledWith({ type: "stage-complete", stage: "extract" })
  })

  it("does not judge or settle duplicates after Stop in the first round", async () => {
    generateObject.mockRejectedValueOnce(new Error("owner failed"))
    decide.mockResolvedValue("stop")
    await expect(createStageRunner().run("book", options, { emit }))
      .rejects.toThrow("Stopped by a page-error decision")

    expect(decide).toHaveBeenCalledExactlyOnceWith({
      step: "image-meaningfulness", pageId: "pg001", error: "owner failed",
    })
    expect(sentImages()).toEqual([
      { page: "pg001", images: ["pg001_im001", "pg001_im002"] },
    ])
    for (const pageId of pageIds) expectUnjudgedLogo(pageId)
    expect(emit).not.toHaveBeenCalledWith({ type: "stage-complete", stage: "extract" })
  })

  it("stops later orphan calls and settlement when Stop is chosen during the orphan round", async () => {
    generateObject.mockImplementation(async (input) => {
      if (input.log?.pageId === "pg001") throw new Error("owner failed")
      if (input.log?.pageId === "pg002") throw new Error("orphan failed")
      return modelVerdict(input)
    })
    decide.mockResolvedValueOnce("skip").mockResolvedValueOnce("stop")
    await expect(createStageRunner().run("book", options, { emit }))
      .rejects.toThrow("Stopped by a page-error decision")

    expect(decide.mock.calls).toEqual([
      [{ step: "image-meaningfulness", pageId: "pg001", error: "owner failed" }],
      [{ step: "image-meaningfulness", pageId: "pg002", error: "orphan failed" }],
    ])
    expect(sentImages()).toEqual([
      { page: "pg001", images: ["pg001_im001", "pg001_im002"] },
      { page: "pg003", images: ["pg003_im002"] },
      { page: "pg004", images: ["pg004_im002"] },
      { page: "pg002", images: ["pg002_im001"] },
    ])
    for (const pageId of pageIds) expectUnjudgedLogo(pageId)
    expect(emit).not.toHaveBeenCalledWith({ type: "stage-complete", stage: "extract" })
  })
})

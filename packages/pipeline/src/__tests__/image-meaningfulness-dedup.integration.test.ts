import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import type { GenerateObjectOptions, GenerateObjectResult, LLMModel } from "@adt/llm"
import type { ImageClassificationOutput } from "@adt/types"
import {
  applyHashDedupVerdicts,
  buildHashDedupPlan,
  buildMeaningfulnessImages,
  filterPageImageMeaningfulness,
  type MeaningfulnessConfig,
} from "../image-meaningfulness.js"

/**
 * Drives the exact sequence both runners use (plan → per-page input → model →
 * propagate → persist) against real book storage, so the storage-side pieces
 * (image hashes from getPageImages, extraction-debug lookups, node writes)
 * are covered, not only the pure helpers.
 */
let root: string
const image = (imageId: string, pageId: string, hash: string) => ({ imageId, pageId, buffer: Buffer.from(`png:${hash}`), format: "png" as const, hash, width: 300, height: 300, renderMethod: "raster" as const })
const page = (pageId: string, pageNumber: number, images: ReturnType<typeof image>[]) =>
  ({ pageId, pageNumber, text: "", pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png" as const, hash: `page-${pageId}`, width: 100, height: 100 }, images })
const unpruned = (storage: Storage, pageId: string) => ({ images: [{ imageId: `${pageId}_page`, isPruned: true, reason: "full-page render" }, ...storage.getPageImages(pageId).filter((img) => !img.imageId.endsWith("_page")).map((img) => ({ imageId: img.imageId, isPruned: false }))] })
const config: MeaningfulnessConfig = { promptName: "image_meaningfulness", modelId: "fake", figureExtractionMode: "auto", maxRetries: 0 }

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "adt-dedup-")) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))

it("sends each distinct image once, keeps figure candidates per page, and persists the owner verdicts onto duplicates", async () => {
  const storage = createBookStorage("book", root)
  try {
    storage.putExtractedPage(page("pg001", 1, [image("pg001_im001", "pg001", "logo"), image("pg001_im002", "pg001", "figure-a")]))
    storage.putExtractedPage(page("pg002", 2, [image("pg002_im001", "pg002", "logo"), image("pg002_im002", "pg002", "art")]))
    storage.putExtractedPage(page("pg003", 3, [image("pg003_im001", "pg003", "logo"), image("pg003_im002", "pg003", "art")]))
    // On pg003 the "art" raster is covered by a composite candidate, so it must be judged there, not deduplicated.
    storage.putNodeData("extraction-debug", "pg003", { pageId: "pg003", groups: [{ imageId: "pg003_fig001", coveredRasterImageIds: ["pg003_im002"], hasText: false, hasImages: true, shapeCount: 2, shapes: [] }] })
    for (const pageId of ["pg001", "pg002", "pg003"]) storage.putNodeData("image-filtering", pageId, unpruned(storage, pageId))

    const sent: Record<string, string[]> = {}
    const model: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const context = options.context as { images: Array<{ imageId: string }> }
        const pageId = (options.log as { pageId: string }).pageId
        sent[pageId] = context.images.map((img) => img.imageId)
        const verdict = (imageId: string) => ({ image_id: imageId, reasoning: "fixture", is_meaningful: !imageId.endsWith("_im001") })
        return { object: { images: context.images.map((img) => verdict(img.imageId)) } as T, usage: { inputTokens: 1, outputTokens: 1 } } as GenerateObjectResult<T>
      },
    }

    const pages = storage.getPages()
    const classificationOf = (pageId: string) => storage.getLatestNodeData("image-filtering", pageId)?.data as ImageClassificationOutput | undefined
    const plan = buildHashDedupPlan(storage, pages, classificationOf)
    const judged = new Set<string>()
    for (const current of pages) {
      const existing = classificationOf(current.pageId)!
      const images = buildMeaningfulnessImages(storage, current.pageId, existing, plan)
      if (images.length) {
        const updated = await filterPageImageMeaningfulness({ pageId: current.pageId, pageImageBase64: "", pageText: "", images }, existing, config, model)
        storage.putNodeData("image-filtering", current.pageId, updated)
      }
      judged.add(current.pageId)
    }
    for (const [pageId, updated] of applyHashDedupVerdicts(plan, classificationOf, judged)) storage.putNodeData("image-filtering", pageId, updated)

    // The logo is judged once (pg001); "art" is judged on pg002 and again on pg003 where it is figure-involved.
    expect(sent).toEqual({ pg001: ["pg001_im001", "pg001_im002"], pg002: ["pg002_im002"], pg003: ["pg003_im002"] })
    const reasons = (pageId: string) => classificationOf(pageId)!.images.map((img) => [img.imageId, img.isPruned, img.reason ?? ""])
    expect(reasons("pg002")).toEqual([["pg002_page", true, "full-page render"], ["pg002_im001", true, "duplicate of pg001_im001: not meaningful: fixture"], ["pg002_im002", false, ""]])
    expect(reasons("pg003")).toEqual([["pg003_page", true, "full-page render"], ["pg003_im001", true, "duplicate of pg001_im001: not meaningful: fixture"], ["pg003_im002", false, ""]])
    // Every write is a new version (pre-pass, after its own model call, after propagation): nothing is overwritten.
    expect(storage.getAllNodeVersions("image-filtering", "pg002").length).toBe(3)
  } finally {
    storage.close()
  }
})

it("keeps duplicates, with a reason, when the owner's page never completed", async () => {
  const storage = createBookStorage("book", root)
  try {
    storage.putExtractedPage(page("pg001", 1, [image("pg001_im001", "pg001", "logo")]))
    storage.putExtractedPage(page("pg002", 2, [image("pg002_im001", "pg002", "logo")]))
    for (const pageId of ["pg001", "pg002"]) storage.putNodeData("image-filtering", pageId, unpruned(storage, pageId))
    const pages = storage.getPages()
    const classificationOf = (pageId: string) => storage.getLatestNodeData("image-filtering", pageId)?.data as ImageClassificationOutput | undefined
    const plan = buildHashDedupPlan(storage, pages, classificationOf)
    expect(buildMeaningfulnessImages(storage, "pg002", classificationOf("pg002")!, plan)).toEqual([])
    // pg001 throws before it is judged: only pg002 completed.
    for (const [pageId, updated] of applyHashDedupVerdicts(plan, classificationOf, new Set(["pg002"]))) storage.putNodeData("image-filtering", pageId, updated)
    expect(classificationOf("pg002")!.images[1]).toEqual({ imageId: "pg002_im001", isPruned: false, reason: "duplicate of pg001_im001: owner was not judged, kept" })
  } finally {
    storage.close()
  }
})

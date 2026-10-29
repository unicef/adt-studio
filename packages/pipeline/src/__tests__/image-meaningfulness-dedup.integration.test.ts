import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, expect, it } from "vitest"
import { createBookStorage, type Storage } from "@adt/storage"
import type { GenerateObjectOptions, GenerateObjectResult, LLMModel } from "@adt/llm"
import type { ImageClassificationOutput } from "@adt/types"
import {
  buildHashDedupPlan,
  buildMeaningfulnessImages,
  filterPageImageMeaningfulness,
  sentInFirstRound,
  settleHashDedup,
  type MeaningfulnessConfig,
} from "../image-meaningfulness.js"

/**
 * Drives the exact sequence both runners use (plan → first round → orphan
 * round → propagate → persist) against real book storage, so the storage-side pieces
 * (image hashes from getPageImages, extraction-debug lookups, node writes)
 * are covered, not only the pure helpers.
 */
let root: string
const image = (imageId: string, pageId: string, hash: string) => ({ imageId, pageId, buffer: Buffer.from(`png:${hash}`), format: "png" as const, hash, width: 300, height: 300, renderMethod: "raster" as const })
const page = (pageId: string, pageNumber: number, images: ReturnType<typeof image>[]) =>
  ({ pageId, pageNumber, text: "", pageImage: { imageId: `${pageId}_page`, buffer: Buffer.from("page"), format: "png" as const, hash: `page-${pageId}`, width: 100, height: 100 }, images })
const unpruned = (storage: Storage, pageId: string) => ({ images: [{ imageId: `${pageId}_page`, isPruned: true, reason: "full-page render" }, ...storage.getPageImages(pageId).filter((img) => !img.imageId.endsWith("_page")).map((img) => ({ imageId: img.imageId, isPruned: false }))] })
const config: MeaningfulnessConfig = { promptName: "image_meaningfulness", modelId: "fake", figureExtractionMode: "auto", maxRetries: 0 }
const classificationIn = (storage: Storage) => (pageId: string) => storage.getLatestNodeData("image-filtering", pageId)?.data as ImageClassificationOutput | undefined

/** Fake model: records what each call sent, rejects every `_im001`, and fails pages listed in `failing`. */
function recordingModel(sent: Record<string, string[][]>, failing: ReadonlySet<string> = new Set()): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      const context = options.context as { images: Array<{ imageId: string }> }
      const pageId = (options.log as { pageId: string }).pageId
      if (failing.has(pageId)) throw new Error(`model failed for ${pageId}`)
      ;(sent[pageId] ??= []).push(context.images.map((img) => img.imageId))
      const verdict = (imageId: string) => ({ image_id: imageId, reasoning: "fixture", is_meaningful: !imageId.endsWith("_im001") })
      return { object: { images: context.images.map((img) => verdict(img.imageId)) } as T, usage: { inputTokens: 1, outputTokens: 1 } } as GenerateObjectResult<T>
    },
  }
}

/** Both runners' sequence: first round over every page, then settle (orphan round + propagation), persisting each write. */
async function runPass(storage: Storage, model: LLMModel): Promise<void> {
  const pages = storage.getPages()
  const classificationOf = classificationIn(storage)
  const plan = buildHashDedupPlan(storage, pages, classificationOf)
  const judgePage = async (pageId: string, include: (imageId: string) => boolean): Promise<boolean> => {
    const existing = classificationOf(pageId)!
    const images = buildMeaningfulnessImages(storage, pageId, existing, include)
    try {
      if (images.length) storage.putNodeData("image-filtering", pageId, await filterPageImageMeaningfulness({ pageId, pageImageBase64: "", pageText: "", images }, existing, config, model))
      return true
    } catch {
      return false
    }
  }
  const judged = new Set<string>()
  for (const current of pages) if (await judgePage(current.pageId, sentInFirstRound(plan))) judged.add(current.pageId)
  const settled = await settleHashDedup(plan, judged, (pageId, imageIds) => judgePage(pageId, (id) => imageIds.has(id)), classificationOf)
  for (const [pageId, updated] of settled) storage.putNodeData("image-filtering", pageId, updated)
}

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

    const sent: Record<string, string[][]> = {}
    await runPass(storage, recordingModel(sent))
    const classificationOf = classificationIn(storage)

    // The logo is judged once (pg001); "art" is judged on pg002 and again on pg003 where it is figure-involved.
    expect(sent).toEqual({ pg001: [["pg001_im001", "pg001_im002"]], pg002: [["pg002_im002"]], pg003: [["pg003_im002"]] })
    const reasons = (pageId: string) => classificationOf(pageId)!.images.map((img) => [img.imageId, img.isPruned, img.reason ?? ""])
    expect(reasons("pg002")).toEqual([["pg002_page", true, "full-page render"], ["pg002_im001", true, "duplicate of pg001_im001: not meaningful: fixture"], ["pg002_im002", false, ""]])
    expect(reasons("pg003")).toEqual([["pg003_page", true, "full-page render"], ["pg003_im001", true, "duplicate of pg001_im001: not meaningful: fixture"], ["pg003_im002", false, ""]])
    // Every write is a new version (pre-pass, after its own model call, after propagation): nothing is overwritten.
    expect(storage.getAllNodeVersions("image-filtering", "pg002").length).toBe(3)
  } finally {
    storage.close()
  }
})

it("judges a failed owner's duplicates on their own pages instead of keeping them unjudged", async () => {
  const storage = createBookStorage("book", root)
  try {
    for (const [n, pageId] of ["pg001", "pg002", "pg003"].entries()) {
      storage.putExtractedPage(page(pageId, n + 1, [image(`${pageId}_im001`, pageId, "logo")]))
      storage.putNodeData("image-filtering", pageId, unpruned(storage, pageId))
    }
    const sent: Record<string, string[][]> = {}
    // The owner's page (pg001) fails its model call.
    await runPass(storage, recordingModel(sent, new Set(["pg001"])))

    // First round: pg002 and pg003 hold only duplicates and send nothing; the orphan round judges each on its page.
    expect(sent).toEqual({ pg002: [["pg002_im001"]], pg003: [["pg003_im001"]] })
    const classificationOf = classificationIn(storage)
    expect(classificationOf("pg002")!.images[1]).toEqual({ imageId: "pg002_im001", isPruned: true, reason: "not meaningful: fixture" })
    expect(classificationOf("pg003")!.images[1]).toEqual({ imageId: "pg003_im001", isPruned: true, reason: "not meaningful: fixture" })
  } finally {
    storage.close()
  }
})

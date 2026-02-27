import type { ExtractedPage } from "@adt/pdf"
import type { LlmLogEntry } from "@adt/llm"

export interface PageData {
  pageId: string
  pageNumber: number
  text: string
}

export interface ImageData {
  imageId: string
  width: number
  height: number
}

export interface NodeDataRow {
  version: number
  data: unknown
}

export interface CroppedImageInput {
  imageId: string
  pageId: string
  version: number
  buffer: Buffer
  width: number
  height: number
}

export interface SegmentedImageInput {
  sourceImageId: string
  segmentIndex: number
  pageId: string
  version: number
  buffer: Buffer
  width: number
  height: number
}

export interface Storage {
  clearExtractedData(): void
  clearNodesByType(nodes: string[]): void
  putExtractedPage(page: ExtractedPage): void

  getPages(): PageData[]
  getPageImageBase64(pageId: string): string
  getImageBase64(imageId: string): string
  getPageImages(pageId: string): ImageData[]

  /** Write a cropped image to disk as {imageId}_crop_v{version}.png and register it in the DB with source="crop". */
  putCroppedImage(input: CroppedImageInput): void

  /** Write a segmented image to disk as {sourceImageId}_seg{NNN}_v{version}.png and register it in the DB with source="segment". */
  putSegmentedImage(input: SegmentedImageInput): void

  putNodeData(node: string, itemId: string, data: unknown): number
  getLatestNodeData(node: string, itemId: string): NodeDataRow | null

  /** Mark a pipeline step as started (running). */
  markStepStarted(step: string): void
  /** Mark a pipeline step as completed successfully. */
  markStepCompleted(step: string): void
  /** Mark a pipeline step as skipped. */
  markStepSkipped(step: string): void
  /** Record a step error. Can be called multiple times (last error wins). */
  recordStepError(step: string, error: string): void
  /** Update the progress message for a running step (e.g., "5/120"). */
  updateStepMessage(step: string, message: string): void
  /** Get all step run records. */
  getStepRuns(): Array<{ step: string; status: string; error: string | null; message: string | null }>
  /** Clear step run records for specific steps (used when clearing downstream data). */
  clearStepRuns(steps: string[]): void

  appendLlmLog(entry: LlmLogEntry): void

  /** Store a debug image (e.g. screenshot) by its log hash so it can be resolved in the LLM log UI. */
  putDebugImage(hash: string, data: Buffer): void

  close(): void
}

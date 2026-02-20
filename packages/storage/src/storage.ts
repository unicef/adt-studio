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

  appendLlmLog(entry: LlmLogEntry): void

  close(): void
}

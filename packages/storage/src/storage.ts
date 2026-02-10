import type { ExtractedPage } from "@adt/pdf"

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

export interface Storage {
  clearExtractedData(): void
  putExtractedPage(page: ExtractedPage): void

  getPages(): PageData[]
  getPageImageBase64(pageId: string): string
  getImageBase64(imageId: string): string
  getPageImages(pageId: string): ImageData[]

  putNodeData(node: string, itemId: string, data: unknown): number
  getLatestNodeData(node: string, itemId: string): NodeDataRow | null

  appendLlmLog(step: string, itemId: string, entry: unknown): void

  close(): void
}

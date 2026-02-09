import type { ExtractedPage, PdfMetadata } from "@adt/pdf"

export interface PageData {
  pageId: string
  pageNumber: number
  text: string
}

export interface NodeDataRow {
  version: number
  data: unknown
}

export interface Storage {
  clearExtractedData(): void
  putPdfMetadata(data: PdfMetadata): void
  putExtractedPage(page: ExtractedPage): void

  getPages(): PageData[]
  getPageImageBase64(pageId: string): string

  putNodeData(node: string, itemId: string, data: unknown): number
  getLatestNodeData(node: string, itemId: string): NodeDataRow | null

  appendLlmLog(entry: unknown): void

  close(): void
}

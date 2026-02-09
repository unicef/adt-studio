import type { ExtractedPage, PdfMetadata } from "@adt/pdf"

export interface Storage {
  clearExtractedData(): void
  putPdfMetadata(data: PdfMetadata): void
  putExtractedPage(page: ExtractedPage): void
  close(): void
}

import type { PdfMetadata } from "@adt/pdf"
import type { BookMetadata } from "@adt/types"

export function toBookMetadata(pdfMetadata: PdfMetadata): BookMetadata {
  const title = normalizeNullable(pdfMetadata.title)
  const author = normalizeNullable(pdfMetadata.author)

  return {
    title,
    authors: author ? [author] : [],
    publisher: null,
    language_code: null,
    cover_page_number: null,
    reasoning: "Extracted from embedded PDF metadata.",
  }
}

function normalizeNullable(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

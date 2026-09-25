import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"

/** Handles HTTP, persisted job errors and SSE using the same stable codes. */
export function localizeExtractionError(message: string): string {
  const code = message.split(":", 1)[0]
  switch (code) {
    case "BOOK_BUSY": return i18n._(msg`This book has an active writer or pending recovery. Wait for it to finish and try again.`)
    case "EXTRACTION_LEGACY": return i18n._(msg`This book has no verified extraction record. Keep editing it, or import the PDF as a new book to extract again.`)
    case "EXTRACTION_INCOMPLETE": return i18n._(msg`Extraction did not complete. Partial data has been kept. Import the PDF as a new book to try again.`)
    case "EXTRACTION_SOURCE_CHANGED": return i18n._(msg`The PDF has changed. Import it as a new book; the existing book will be kept.`)
    case "EXTRACTION_INPUTS_CHANGED": return i18n._(msg`The extraction settings have changed. Import the PDF as a new book; the existing book will be kept.`)
    case "EXTRACTION_ASSETS_INVALID": return i18n._(msg`Original extraction files are missing or damaged. Import the PDF as a new book; the existing book will be kept.`)
    case "EXTRACTION_INPUT_INVALID": return i18n._(msg`The PDF or extraction settings are invalid. Check the source and page range.`)
    case "UNSAFE_RESUME_UNAVAILABLE": return i18n._(msg`The original extraction is verified. Safe downstream resume is not available yet, so no content was changed or generated.`)
    default: return message
  }
}

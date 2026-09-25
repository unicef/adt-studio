import type { ExtractionErrorCode } from "@adt/types"

const guidance = 'Use a fresh, user-chosen label: pnpm pipeline <new-label> <pdf-file> [options].'
const reasons: Record<ExtractionErrorCode, string> = {
  BOOK_BUSY: "Another book writer or unresolved writer recovery is present. Wait for it to finish.",
  EXTRACTION_LEGACY: "Existing content has no trustworthy extraction manifest.",
  EXTRACTION_INCOMPLETE: "Extraction is incomplete or failed; its partial data has been retained.",
  EXTRACTION_SOURCE_CHANGED: "The source PDF bytes differ from this book's extraction.",
  EXTRACTION_INPUTS_CHANGED: "The extraction settings or extraction contract differ.",
  EXTRACTION_ASSETS_INVALID: "Required original extraction data is missing or corrupt.",
  EXTRACTION_INPUT_INVALID: "The PDF or effective extraction inputs are invalid.",
  UNSAFE_RESUME_UNAVAILABLE: "Extraction is reusable. Downstream resume is blocked until shared freshness and preservation policies are available. No downstream work was started.",
}

/** Safe, stable diagnostics: never include source text, credentials or paths. */
export class ExtractionAdmissionError extends Error {
  constructor(readonly code: ExtractionErrorCode) {
    super(`${code}: ${reasons[code]}${code === "BOOK_BUSY" || code === "UNSAFE_RESUME_UNAVAILABLE" ? "" : ` ${guidance}`}`)
    this.name = "ExtractionAdmissionError"
  }
}

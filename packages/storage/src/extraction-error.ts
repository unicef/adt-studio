import { ExtractionResumeBlockedSummary, type ExtractionErrorCode } from "@adt/types"

const guidance = 'Use a fresh, user-chosen label: pnpm pipeline <new-label> <pdf-file> [options].'
const reasons: Record<ExtractionErrorCode, string> = {
  BOOK_BUSY: "Another book writer or unresolved writer recovery is present. Wait for it to finish.",
  EXTRACTION_LEGACY: "Existing content has no trustworthy extraction manifest.",
  EXTRACTION_INCOMPLETE: "Extraction is incomplete or failed; its partial data has been retained.",
  EXTRACTION_SOURCE_CHANGED: "The source PDF bytes differ from this book's extraction.",
  EXTRACTION_INPUTS_CHANGED: "The extraction settings or extraction contract differ.",
  EXTRACTION_ASSETS_INVALID: "Required original extraction data is missing or corrupt.",
  EXTRACTION_INPUT_INVALID: "The PDF or effective extraction inputs are invalid.",
  EXTRACTION_RERUN_STALE: "The book changed after this Extract run was requested. Nothing was changed. Reload the book and try again.",
  EXTRACTION_PART_SETTINGS_CHANGED: "This part's extraction settings no longer match the book it was split from, so it could not be merged back. Nothing was changed. Restore the part's spread, figure extraction and watermark settings and retry.",
  UNSAFE_RESUME_UNAVAILABLE: "Extraction is reusable. Full downstream resume is blocked; only the explicit Sectioning–Storyboard range is supported. No downstream work was started.",
}

/** Safe, stable diagnostics: never include source text, credentials or paths. */
export class ExtractionAdmissionError extends Error {
  readonly summary?: ExtractionResumeBlockedSummary

  constructor(readonly code: ExtractionErrorCode) {
    super(`${code}: ${reasons[code]}${code === "BOOK_BUSY" || code === "UNSAFE_RESUME_UNAVAILABLE" || code === "EXTRACTION_INPUT_INVALID" || code === "EXTRACTION_RERUN_STALE" || code === "EXTRACTION_PART_SETTINGS_CHANGED" ? "" : ` ${guidance}`}`)
    this.name = "ExtractionAdmissionError"
    if (code === "UNSAFE_RESUME_UNAVAILABLE") {
      this.summary = ExtractionResumeBlockedSummary.parse({
        kind: "admission-only",
        extraction: "verified-reusable",
        downstream: "blocked",
        scopeAssessment: "unavailable",
        generated: false,
        contentChanged: false,
      })
    }
  }
}

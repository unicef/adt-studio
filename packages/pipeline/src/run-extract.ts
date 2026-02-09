import fs from "node:fs"
import { extractPdf, type ExtractResult } from "@adt/pdf"
import type { Storage } from "@adt/storage"
import type { Progress } from "./progress.js"

export interface ExtractOptions {
  pdfPath: string
  startPage?: number
  endPage?: number
}

export async function runExtract(
  options: ExtractOptions,
  storage: Storage,
  progress: Progress
): Promise<ExtractResult> {
  const { pdfPath, startPage, endPage } = options

  progress.emit({ type: "step-start", step: "extract" })

  try {
    const pdfBuffer = Buffer.from(fs.readFileSync(pdfPath))

    const result = await extractPdf(
      { pdfBuffer, startPage, endPage },
      (p) => {
        progress.emit({
          type: "step-progress",
          step: "extract",
          message: `page ${p.page}/${p.totalPages}`,
          page: p.page,
          totalPages: p.totalPages,
        })
      }
    )

    storage.clearExtractedData()
    storage.putPdfMetadata(result.pdfMetadata)

    for (const page of result.pages) {
      storage.putExtractedPage(page)
    }

    progress.emit({ type: "step-complete", step: "extract" })

    return result
  } catch (err) {
    progress.emit({
      type: "step-error",
      step: "extract",
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

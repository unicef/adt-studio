import { createBookStorage } from "@adt/storage"
import { getBookConfig } from "../../book-service.js"
import { bookLanguages, readNode, stageStatuses } from "./book-access.js"
import { clampText } from "./budget.js"

const SUMMARY_BUDGET = 900

/**
 * Compact book briefing for the system prompt. Kept small on purpose: it exists
 * so the assistant knows what it is looking at without a tool round-trip, not to
 * replace the read tools.
 */
export function buildBookOverview(safeLabel: string, booksDir: string): string {
  const storage = createBookStorage(safeLabel, booksDir)
  try {
    const metadata = readNode<{
      title?: string | null
      authors?: string[]
      language_code?: string | null
    }>(storage, "metadata", "book")
    const summary = readNode<{ summary?: string }>(storage, "book-summary", "book")
    const languages = bookLanguages(storage, getBookConfig(safeLabel, booksDir))
    const pageCount = storage.getPages().length

    const lines = [
      `- Title: ${metadata?.title ?? "not extracted yet"}`,
      ...(metadata?.authors?.length ? [`- Authors: ${metadata.authors.join(", ")}`] : []),
      `- Pages: ${pageCount}`,
      `- Source language: ${metadata?.language_code ?? "unknown"}`,
      ...(languages.editingLanguage ? [`- Editing language: ${languages.editingLanguage}`] : []),
      ...(languages.outputLanguages.length
        ? [`- Output languages: ${languages.outputLanguages.join(", ")}`]
        : []),
      "",
      "Stage status:",
      ...stageStatuses(storage).map((stage) => `- ${stage.label}: ${stage.status}`),
    ]

    if (summary?.summary) {
      lines.push("", "Summary:", clampText(summary.summary, SUMMARY_BUDGET).text)
    }

    return lines.join("\n")
  } finally {
    storage.close()
  }
}

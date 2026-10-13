import { buildEasyReadSourceBlocks } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { EasyReadOutput } from "@adt/types"

import type { ReadAdtBundle } from "../bundle-reader.js"

/** Rebuild the Easy Read entity from the `<id>_easy_read` texts the archive
 * published, anchored to the recovered storyboard. Seeds only when the project
 * has no Easy Read yet: a re-projection must not replace edits made in Studio. */
export function seedImportedEasyRead(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  generatedAt: string,
): void {
  const sourceTexts = bundle.texts[bundle.manifest.languages.source] ?? {}
  const storage = createBookStorage(label, booksDir)
  try {
    if (storage.getLatestNodeData("easy-read", "book")) return
    const blocks = buildEasyReadSourceBlocks(storage, storage.getPages())
      .map((block) => ({
        ...block,
        entries: block.entries.flatMap((entry) => {
          const text = sourceTexts[entry.easyReadId]
          return typeof text === "string" && text.trim().length > 0 ? [{ ...entry, text }] : []
        }),
      }))
      .filter((block) => block.entries.length > 0)
    if (blocks.length === 0) return
    storage.putNodeData("easy-read", "book", EasyReadOutput.parse({ blocks, generatedAt }))
    storage.markStepCompleted("easy-read", "Recovered from exported ADT texts")
  } finally {
    storage.close()
  }
}

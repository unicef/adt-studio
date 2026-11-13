import { buildEasyReadSourceBlocks } from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { EasyReadOutput } from "@adt/types"

import type { ReadAdtBundle } from "../bundle-reader.js"

/** Rebuild the Easy Read entity from the `<id>_easy_read` texts the archive
 * published, anchored to the recovered storyboard. Seeds only when the project
 * has no Easy Read yet: a re-projection must not replace edits made in Studio.
 * Returns whether the project has Easy Read afterwards. */
export function seedImportedEasyRead(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  generatedAt: string,
): boolean {
  const sourceTexts = bundle.texts[bundle.manifest.languages.source] ?? {}
  const storage = createBookStorage(label, booksDir)
  try {
    if (storage.getLatestNodeData("easy-read", "book")) return true
    const blocks = buildEasyReadSourceBlocks(storage, storage.getPages())
      .map((block) => ({
        ...block,
        entries: block.entries.flatMap((entry) => {
          const text = sourceTexts[entry.easyReadId]
          return typeof text === "string" && text.trim().length > 0 ? [{ ...entry, text }] : []
        }),
      }))
      .filter((block) => block.entries.length > 0)
    if (blocks.length === 0) return false
    storage.putNodeData("easy-read", "book", EasyReadOutput.parse({ blocks, generatedAt }))
    storage.markStepCompleted("easy-read", "Recovered from exported ADT texts")
    return true
  } finally {
    storage.close()
  }
}

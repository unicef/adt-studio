import type { Storage } from "@adt/storage"
import { TextCatalogOutput, type TextCatalogEntry } from "@adt/types"
import { invalidateCoreTtsForDisplayEntries, normalizeLocale } from "@adt/pipeline"

/**
 * Save a whole translation catalog as a new language-entity version and
 * invalidate everything derived from it (speech, timestamps, package, audit).
 * Shared by the text-catalog route and the chat tool so both invalidate alike.
 */
export function saveTranslationCatalog(
  storage: Storage,
  language: string,
  entries: TextCatalogEntry[],
  generatedAt?: string,
): number {
  const previous = storage.getLatestNodeData("text-catalog-translation", language)
  const previousData =
    previous?.data && typeof previous.data === "object"
      ? (previous.data as { generatedAt?: unknown })
      : null

  const data = TextCatalogOutput.parse({
    entries,
    generatedAt:
      generatedAt ??
      (typeof previousData?.generatedAt === "string" ? previousData.generatedAt : undefined) ??
      new Date().toISOString(),
  })

  const version = storage.putNodeData("text-catalog-translation", language, data)

  invalidateCoreTtsForDisplayEntries({
    storage,
    language: normalizeLocale(language),
    entries: data.entries,
  })
  storage.clearNodesByType(["accessibility-assessment"])
  storage.clearStepRuns([
    "core-tts-catalog",
    "tts",
    "word-timestamps",
    "package-web",
    "accessibility-assessment",
  ])

  return version
}

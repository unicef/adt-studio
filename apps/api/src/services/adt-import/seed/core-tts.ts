import {
  createImportedCoreTtsCatalog,
  getCoreTtsCatalog,
  getCoreTtsPreparationLocales,
  mergeEasyReadEntries,
  normalizeLocale,
} from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { EasyReadOutput, TextCatalogOutput } from "@adt/types"

import type { ReadAdtBundle } from "../bundle-reader.js"
import { currentImportedNarration, readArchivedAudioIds, readArchivedSpeechTexts } from "../speech.js"

/** Give every locale the provider-text catalog the Speech stage reads from,
 * recovering the exporter's own speech texts where they still describe the
 * displayed text. Locales that already have a catalog are left alone. */
export function seedImportedCoreTts(
  label: string,
  booksDir: string,
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  generatedAt: string,
): void {
  const storage = createBookStorage(label, booksDir)
  try {
    const catalog = TextCatalogOutput.safeParse(storage.getLatestNodeData("text-catalog", "book")?.data)
    if (!catalog.success) return
    const easyRead = EasyReadOutput.safeParse(storage.getLatestNodeData("easy-read", "book")?.data)
    const sourceEntries = mergeEasyReadEntries(
      catalog.data.entries,
      easyRead.success ? easyRead.data : null,
    )
    const isCurrent = currentImportedNarration(bundle, files, catalog.data.entries)
    const sourceLanguage = normalizeLocale(bundle.manifest.languages.source)
    const archiveLanguages = new Map(
      [bundle.manifest.languages.source, ...bundle.manifest.languages.output]
        .map((language) => [normalizeLocale(language), language] as const),
    )
    const locales = [
      { language: sourceLanguage, usesSourceDisplayText: true },
      ...getCoreTtsPreparationLocales(bundle.manifest.languages.output, sourceLanguage),
    ]
    for (const locale of locales) {
      if (getCoreTtsCatalog(storage, locale.language)) continue
      let entries = sourceEntries
      if (!locale.usesSourceDisplayText) {
        const translated = TextCatalogOutput.safeParse((
          storage.getLatestNodeData("text-catalog-translation", locale.language)
          ?? storage.getLatestNodeData("text-catalog-translation", locale.language.replace("-", "_"))
        )?.data)
        if (!translated.success) continue
        entries = translated.data.entries
      }
      if (entries.length === 0) continue
      const archiveLanguage = archiveLanguages.get(locale.language)
      const speechTexts = readArchivedSpeechTexts(bundle, files, archiveLanguage)
      const archivedAudioIds = readArchivedAudioIds(bundle, files, archiveLanguage)
      storage.putNodeData("core-tts-catalog", locale.language, createImportedCoreTtsCatalog({
        language: locale.language,
        entries,
        speechTexts: speechTexts ?? {},
        // The exporter writes every ready entry to speech_texts.json (and only
        // those get audio), so an id with neither was never prepared. Older
        // archives without the file keep the display-text fallback.
        ...(speechTexts
          ? {
              unpreparedIds: new Set(entries
                .filter((entry) => !Object.hasOwn(speechTexts, entry.id) && !archivedAudioIds.has(entry.id))
                .map((entry) => entry.id)),
            }
          : {}),
        staleIds: new Set(entries
          .filter((entry) => archiveLanguage === undefined || !isCurrent(archiveLanguage, entry.id))
          .map((entry) => entry.id)),
        generatedAt,
      }))
    }
    if (getCoreTtsCatalog(storage, sourceLanguage)) {
      storage.markStepCompleted("core-tts-catalog", "Recovered from exported ADT speech texts")
    }
  } finally {
    storage.close()
  }
}

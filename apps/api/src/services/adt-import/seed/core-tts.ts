import {
  createImportedCoreTtsCatalog,
  flattenEasyReadEntries,
  getCoreTtsCatalog,
  getCoreTtsPreparationLocales,
  normalizeLocale,
} from "@adt/pipeline"
import { createBookStorage } from "@adt/storage"
import { EasyReadOutput, TextCatalogOutput } from "@adt/types"

import type { ReadAdtBundle } from "../bundle-reader.js"

function readSpeechTexts(
  bundle: ReadAdtBundle,
  files: Record<string, Uint8Array>,
  archiveLanguage: string | undefined,
): Record<string, string> {
  if (!archiveLanguage) return {}
  const bytes = files[`${bundle.root}content/i18n/${archiveLanguage}/speech_texts.json`]
  if (!bytes) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  )
}

/** Give every locale the provider-text catalog the Speech stage reads from,
 * recovering the exporter's own speech texts where the archive kept them.
 * Locales that already have a catalog are left alone. */
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
    const sourceEntries = [
      ...catalog.data.entries,
      ...flattenEasyReadEntries(easyRead.success ? easyRead.data : null),
    ]
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
      storage.putNodeData("core-tts-catalog", locale.language, createImportedCoreTtsCatalog({
        language: locale.language,
        entries,
        speechTexts: readSpeechTexts(bundle, files, archiveLanguages.get(locale.language)),
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

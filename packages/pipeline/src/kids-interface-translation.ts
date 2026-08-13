/**
 * Kids Mode interface translation.
 *
 * The kids runtime UI (onboarding, buddy menu, dialogs) reads its strings from
 * the interface-translation catalogs via `tk(key, fallback)`. Only the English
 * catalog ships the `kids-*` keys, so a non-English book's kids UI falls back
 * to English — and, worse, the kids voice packs bake their clips from whatever
 * text the catalog resolves, so an untranslated language speaks English words.
 *
 * This module translates the kids-* keys (English source) into a book's output
 * languages using the same LLM batch translator the book content uses, and
 * stores the result per-book at `<bookDir>/kids-i18n/<lang>.json`. Two readers
 * merge those overrides on top of the shared catalog:
 *   - package-web, so the packaged book's runtime UI is translated, and
 *   - the kids-voice generator, so clips bake from the translated text.
 *
 * Kept per-book (not in the shared catalogs) because the book directory is the
 * only writable, portable home across dev / Docker / desktop.
 */
import fs from "node:fs"
import path from "node:path"
import type { AppConfig, TextCatalogEntry } from "@adt/types"
import type { LLMModel } from "@adt/llm"
import {
  buildCatalogTranslationConfig,
  getTargetLanguages,
  translateCatalogBatch,
} from "./catalog-translation.js"
import { getBaseLanguage, normalizeLocale } from "./language-context.js"

/** Directory inside a book dir holding per-language kids UI overrides. */
export const KIDS_I18N_DIR = "kids-i18n"

const KIDS_KEY_PREFIX = "kids-"

/**
 * The kids-* subset of the English interface catalog — the translation source.
 * Empty if the shared English catalog is missing (nothing to translate).
 */
export function readKidsInterfaceSource(
  webAssetsDir: string,
): Record<string, string> {
  const file = path.join(
    webAssetsDir,
    "interface_translations",
    "en",
    "interface_translations.json",
  )
  if (!fs.existsSync(file)) return {}
  try {
    const all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      string
    >
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(all)) {
      if (key.startsWith(KIDS_KEY_PREFIX)) out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

function overridesPath(bookDir: string, lang: string): string {
  return path.join(bookDir, KIDS_I18N_DIR, `${normalizeLocale(lang)}.json`)
}

function readSharedInterfaceCatalog(
  webAssetsDir: string,
  lang: string,
): Record<string, string> {
  const normalized = normalizeLocale(lang)
  const candidates = [...new Set([normalized, getBaseLanguage(normalized)])]
  for (const candidate of candidates) {
    const file = path.join(
      webAssetsDir,
      "interface_translations",
      candidate,
      "interface_translations.json",
    )
    if (!fs.existsSync(file)) continue
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>
    } catch {
      return {}
    }
  }
  return {}
}

/** Per-book kids UI overrides for one language (empty if none generated). */
export function readKidsInterfaceOverrides(
  bookDir: string,
  lang: string,
): Record<string, string> {
  const file = overridesPath(bookDir, lang)
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>
  } catch {
    return {}
  }
}

export interface KidsInterfaceLanguageStatus {
  language: string
  ready: boolean
  missingKeys: string[]
}

export interface KidsInterfaceParityStatus {
  ready: boolean
  sourceKeyCount: number
  languages: KidsInterfaceLanguageStatus[]
}

export interface KidsInterfaceParityOptions {
  bookDir: string
  webAssetsDir: string
  languages: string[]
}

/**
 * Verify that every book language can resolve every kids-* interface key.
 * Shared catalogs and per-book overrides are merged using the same locale
 * fallback rules as web packaging.
 */
export function getKidsInterfaceParityStatus(
  options: KidsInterfaceParityOptions,
): KidsInterfaceParityStatus {
  const sourceKeys = Object.keys(readKidsInterfaceSource(options.webAssetsDir))
  const languages = [...new Set(options.languages.map(normalizeLocale).filter(Boolean))]
  const statuses = languages.map((language) => {
    const catalog = {
      ...readSharedInterfaceCatalog(options.webAssetsDir, language),
      ...readKidsInterfaceOverrides(options.bookDir, language),
    }
    const missingKeys = sourceKeys.filter(
      (key) => typeof catalog[key] !== "string" || catalog[key].trim() === "",
    )
    return {
      language,
      ready: sourceKeys.length > 0 && missingKeys.length === 0,
      missingKeys,
    }
  })

  return {
    ready:
      sourceKeys.length > 0 &&
      statuses.length > 0 &&
      statuses.every((status) => status.ready),
    sourceKeyCount: sourceKeys.length,
    languages: statuses,
  }
}

export function assertKidsInterfaceLanguageParity(
  options: KidsInterfaceParityOptions,
): KidsInterfaceParityStatus {
  const status = getKidsInterfaceParityStatus(options)
  if (status.ready) return status

  const incomplete = status.languages
    .filter((language) => !language.ready)
    .map((language) => `${language.language} (${language.missingKeys.length} missing)`)
  const detail =
    status.sourceKeyCount === 0
      ? "the English kids interface source catalog has no keys"
      : incomplete.length > 0
        ? incomplete.join(", ")
        : "the book has no languages"
  throw new Error(
    `Kids Mode requires complete interface translations for every book language: ${detail}`,
  )
}

function writeKidsInterfaceOverrides(
  bookDir: string,
  lang: string,
  map: Record<string, string>,
): void {
  const file = overridesPath(bookDir, lang)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`)
}

export interface TranslateKidsInterfaceOptions {
  bookDir: string
  webAssetsDir: string
  /** Book languages; English (the UI catalog source) and duplicates are skipped. */
  targetLanguages: string[]
  appConfig: AppConfig
  llmModel: LLMModel
  /**
   * Re-translate even languages whose override already covers every source
   * key. Off by default so voice generation can cheaply ensure translations
   * exist without redoing complete ones.
   */
  force?: boolean
}

export interface TranslateKidsInterfaceResult {
  /** Languages actually translated + written. */
  languages: string[]
  /** Number of kids keys translated per language. */
  keyCount: number
}

/**
 * Translate the kids UI strings into each output language and write per-book
 * overrides. Skips the source language; a language whose translation fails
 * bubbles the error (callers surface it per generate run).
 */
export async function translateKidsInterface(
  options: TranslateKidsInterfaceOptions,
): Promise<TranslateKidsInterfaceResult> {
  const source = readKidsInterfaceSource(options.webAssetsDir)
  const keys = Object.keys(source)
  const targets = getTargetLanguages(
    options.targetLanguages,
    "en",
  )
  if (keys.length === 0 || targets.length === 0) {
    return { languages: [], keyCount: keys.length }
  }

  const config = buildCatalogTranslationConfig(
    options.appConfig,
    "en",
  )
  const entries: TextCatalogEntry[] = keys.map((id) => ({
    id,
    text: source[id],
  }))

  const languages: string[] = []
  for (const lang of targets) {
    if (!options.force) {
      const existing = readKidsInterfaceOverrides(options.bookDir, lang)
      if (
        keys.every(
          (key) =>
            typeof existing[key] === "string" && existing[key].trim() !== "",
        )
      ) {
        continue
      }
    }
    const translated = await translateCatalogBatch(
      entries,
      lang,
      config,
      options.llmModel,
    )
    const map: Record<string, string> = {}
    for (const entry of translated) map[entry.id] = entry.text
    writeKidsInterfaceOverrides(options.bookDir, lang, map)
    languages.push(normalizeLocale(lang))
  }

  return { languages, keyCount: keys.length }
}

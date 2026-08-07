/**
 * Language + translation atoms.
 *
 * Translations are loaded asynchronously per language: interface strings come
 * from `assets/interface_translations/<lang>/interface_translations.json`
 * (UI labels for the chrome) and content strings come from
 * `content/i18n/<lang>/texts.json` (per-page text catalog).
 *
 * Both feed into a single `translationsAtom` keyed by string id — same shape
 * the legacy `state.translations` had — so consumers don't care which catalog
 * a given key came from.
 */
import { atom } from "jotai"
import { ephemeralAtom, persistedStringAtom } from "@/shared/state/persist"

export const currentLanguageAtom = persistedStringAtom("currentLanguage", "en")

export const translationsAtom = ephemeralAtom<Record<string, string>>({})
/** Prepared provider wording; kept separate so display text never changes. */
export const speechTextsAtom = ephemeralAtom<Record<string, string>>({})
export const audioFilesAtom = ephemeralAtom<Record<string, string>>({})
export const videoFilesAtom = ephemeralAtom<Record<string, string>>({})
export const imageFilesAtom = ephemeralAtom<Record<string, string>>({})

/**
 * Derived: translate a string key with optional `${var}` interpolation.
 * Read-only atom; consumers typically use the `useTranslation()` hook instead.
 */
export const translateAtom = atom((get) => {
  const dict = get(translationsAtom)
  return (key: string, variables: Record<string, string> = {}): string => {
    const template = dict[key]
    if (!template) return key
    return template.replace(/\$\{(.*?)\}/g, (_, name) => variables[name] ?? "")
  }
})

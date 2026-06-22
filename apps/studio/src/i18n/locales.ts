import { i18n } from "@lingui/core"

/**
 * Single source of truth for supported locales.
 *
 * When adding a new language:
 * 1. Add its BCP-47 code to LOCALES
 * 2. Add its flag emoji to LOCALE_FLAGS
 * 3. Add its full English name to LOCALE_NAMES (used by the auto-translate script)
 * 4. Add its display label to LOCALE_LABEL_MESSAGES in LocaleSwitcher.tsx
 * 5. Also update lingui.config.ts (cannot import from src/)
 *
 * See docs/I18N_ADD_LANGUAGE.md for the full guide.
 */
export const LOCALES = ["en", "pt-BR", "es", "fr", "sq"] as const
export type AppLocale = (typeof LOCALES)[number]

/**
 * Activate a locale AND reflect it on `<html lang>`.
 *
 * Always use this instead of calling `i18n.activate()` directly: screen readers
 * pick their pronunciation voice from the document language, so a stale `lang`
 * attribute makes Spanish/French/Portuguese content be read with an English
 * voice (WCAG 3.1.1 / 3.1.2). BCP-47 codes like "pt-BR" are valid `lang` values.
 */
export function activateLocale(locale: AppLocale): void {
  i18n.activate(locale)
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
}

/** Flag emoji for each locale, shown in the language switcher UI. */
export const LOCALE_FLAGS: Record<AppLocale, string> = {
  en: "🇺🇸",
  "pt-BR": "🇧🇷",
  es: "🇪🇸",
  fr: "🇫🇷",
  sq: "🇽🇰",
}

/**
 * Full English language names used in the auto-translate script prompt.
 * Includes future/potential locales beyond the currently active ones.
 * Add an entry here when adding a new locale.
 */
export const LOCALE_NAMES: Record<string, string> = {
  "pt-BR": "Brazilian Portuguese",
  es: "Spanish",
  fr: "French",
  sq: "Albanian",
}

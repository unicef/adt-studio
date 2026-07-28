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

/** localStorage key under which the user's chosen UI locale is persisted. */
export const LOCALE_STORAGE_KEY = "adt:locale"

/**
 * Resolve arbitrary BCP-47 locale tag(s) — e.g. from the OS — to a supported
 * AppLocale. Candidates are tried in order (the list expresses preference);
 * for each, an exact match wins, otherwise a language-only match (so `es-MX`
 * → `es`, `pt` → `pt-BR`). Returns `null` when nothing matches.
 */
export function matchSupportedLocale(
  candidates: string | readonly string[],
): AppLocale | null {
  const list = typeof candidates === "string" ? [candidates] : candidates
  for (const raw of list) {
    if (!raw) continue
    const exact = LOCALES.find((l) => l.toLowerCase() === raw.toLowerCase())
    if (exact) return exact
    const lang = raw.split("-")[0]?.toLowerCase()
    if (!lang) continue
    const byLang = LOCALES.find((l) => l.split("-")[0].toLowerCase() === lang)
    if (byLang) return byLang
  }
  return null
}

/**
 * Read the persisted UI locale, if any. Returns `null` when nothing valid is
 * stored (first launch, cleared storage, or an unsupported value).
 */
export function getStoredLocale(): AppLocale | null {
  if (typeof localStorage === "undefined") return null
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    return stored && LOCALES.includes(stored as AppLocale) ? (stored as AppLocale) : null
  } catch {
    return null
  }
}

/**
 * Activate a locale, persist it, AND reflect it on `<html lang>`.
 *
 * Always use this instead of calling `i18n.activate()` directly: screen readers
 * pick their pronunciation voice from the document language, so a stale `lang`
 * attribute makes Spanish/French/Portuguese content be read with an English
 * voice (WCAG 3.1.1 / 3.1.2). BCP-47 codes like "pt-BR" are valid `lang` values.
 *
 * The chosen locale is saved to localStorage so it survives app restarts.
 */
export function activateLocale(locale: AppLocale): void {
  const changed = i18n.locale !== locale
  i18n.activate(locale)
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale
  }
  // Only touch storage on a real change: the router re-activates the current
  // locale on every navigation, and we don't want a write per route change.
  if (changed && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Persisting is best-effort; ignore quota/privacy-mode failures.
    }
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

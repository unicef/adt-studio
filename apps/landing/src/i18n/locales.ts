/**
 * Single source of truth for supported locales on the landing site.
 *
 * When adding a new language:
 * 1. Add its BCP-47 code to LOCALES
 * 2. Add its flag emoji to LOCALE_FLAGS
 * 3. Add its full English name to LOCALE_NAMES (used by auto-translate tooling)
 * 4. Add its display label to LOCALE_LABEL_MESSAGES in LocaleSwitcher.tsx
 * 5. Also update lingui.config.ts (cannot import from src/)
 */
export const LOCALES = ["en", "pt-BR", "es", "fr"] as const;
export type AppLocale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

/** Flag emoji for each locale, shown in the language switcher UI. */
export const LOCALE_FLAGS: Record<AppLocale, string> = {
  en: "🇺🇸",
  "pt-BR": "🇧🇷",
  es: "🇪🇸",
  fr: "🇫🇷",
};

/**
 * Full English language names used by auto-translate tooling.
 * Add an entry here when adding a new locale.
 */
export const LOCALE_NAMES: Record<string, string> = {
  "pt-BR": "Brazilian Portuguese",
  es: "Spanish",
  fr: "French",
};

export function isAppLocale(value: string): value is AppLocale {
  return (LOCALES as readonly string[]).includes(value);
}

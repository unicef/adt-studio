import { i18n } from "@lingui/core";
import { messages as enMessages } from "@/locales/en.po";
import { messages as ptBRMessages } from "@/locales/pt-BR.po";
import { messages as esMessages } from "@/locales/es.po";
import { messages as frMessages } from "@/locales/fr.po";
import {
  DEFAULT_LOCALE,
  isAppLocale,
  LOCALES,
  type AppLocale,
} from "./locales";

const STORAGE_KEY = "adt:landing:locale";

i18n.load({
  en: enMessages,
  "pt-BR": ptBRMessages,
  es: esMessages,
  fr: frMessages,
});

/** Resolve a browser language tag (e.g. "pt", "pt-PT", "es-419") to a supported locale. */
function matchBrowserLocale(tag: string): AppLocale | null {
  const lower = tag.toLowerCase();
  for (const loc of LOCALES) {
    if (loc.toLowerCase() === lower) return loc;
  }
  const base = lower.split("-")[0];
  for (const loc of LOCALES) {
    if (loc.toLowerCase().split("-")[0] === base) return loc;
  }
  return null;
}

function detectLocale(): AppLocale {
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang && isAppLocale(urlLang)) return urlLang;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && isAppLocale(stored)) return stored;

  for (const tag of navigator.languages ?? [navigator.language]) {
    const matched = matchBrowserLocale(tag);
    if (matched) return matched;
  }

  return DEFAULT_LOCALE;
}

/** Activate a locale and persist the choice to localStorage + the URL. */
export function setLocale(next: AppLocale): void {
  i18n.activate(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage errors (private mode, etc.) — the URL still carries the choice.
  }
  const url = new URL(window.location.href);
  url.searchParams.set("lang", next);
  window.history.replaceState(null, "", url.toString());
  document.documentElement.lang = next;
}

export function initI18n(): void {
  const locale = detectLocale();
  i18n.activate(locale);
  document.documentElement.lang = locale;
}

/**
 * Loads `./assets/config.json` once on boot.
 *
 * The legacy runtime stashed this on `window.appConfig`. We mirror that for
 * compatibility with anything that still reads it (third-party SCORM/EPUB
 * hosts), but the source of truth is `appConfigAtom`.
 */
import { runtimeBase } from "./base-path.js"
import type { AppConfig } from "@/shared/state/config.atoms"

declare global {
  interface Window {
    appConfig?: AppConfig
  }
}

const DEFAULT_CONFIG: AppConfig = {
  languages: { available: ["en"], default: "en" },
  features: {},
}

export async function loadAppConfig(versionParam = ""): Promise<AppConfig> {
  try {
    const url = `${runtimeBase()}assets/config.json${versionParam ? `?v=${versionParam}` : ""}`
    const res = await fetch(url)
    if (!res.ok) return DEFAULT_CONFIG
    const config = (await res.json()) as AppConfig
    if (typeof window !== "undefined") window.appConfig = config
    return {
      ...DEFAULT_CONFIG,
      ...config,
      languages: { ...DEFAULT_CONFIG.languages, ...config.languages },
      features: { ...DEFAULT_CONFIG.features, ...config.features },
    }
  } catch (err) {
    console.warn("Failed to load config.json, using defaults", err)
    return DEFAULT_CONFIG
  }
}

/**
 * Determines the persistence mode for user preferences. Defaults to
 * `localStorage` (matches the runtime's documented default in `persist.ts`).
 * Cookies are only used when a book explicitly opts in via
 * `features.cookieStorage = true` — typically for legacy multi-book deployments
 * on a shared origin where path-scoped cookies are needed to isolate titles.
 */
export function pickStorageMode(config: AppConfig): "cookie" | "localStorage" {
  return config.features.cookieStorage === true ? "cookie" : "localStorage"
}

/**
 * Reconciles the requested language against the book's supported list.
 * Mirrors `initializeLanguage()` from base.js: if the persisted language
 * isn't available, falls back to the default and warns.
 */
export function pickLanguage(
  config: AppConfig,
  storedLanguage: string | null,
  htmlLang: string | null,
): string {
  const available = config.languages.available ?? []
  const fallback = config.languages.default ?? htmlLang ?? "en"
  if (available.length === 0) return storedLanguage ?? fallback
  if (storedLanguage && available.includes(storedLanguage)) return storedLanguage
  if (storedLanguage) {
    console.warn(
      `Stored language "${storedLanguage}" not available; falling back to "${fallback}".`,
    )
  }
  return fallback
}

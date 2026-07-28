/**
 * Base URL prefix for runtime data fetches (config, manifests, i18n).
 *
 * Defaults to `./` — the adt/webpub layout where the page sits next to
 * `assets/` and `content/`. A package that relocates those (e.g. the PNLD
 * export, whose pages live in `content/` and whose data lives under
 * `resources/adt/`) sets `<meta name="adt-base" content="../resources/adt/">`
 * so the loaders resolve `assets/…` and `content/…` under that base instead.
 */
export function runtimeBase(): string {
  if (typeof document === "undefined") return "./"
  const meta = document.querySelector('meta[name="adt-base"]')?.getAttribute("content")
  if (!meta) return "./"
  return meta.endsWith("/") ? meta : `${meta}/`
}

declare global {
  interface Window {
    __ADT_DATA__?: Record<string, unknown>
  }
}

/**
 * Load an ADT runtime data resource (config, manifest, or i18n catalog)
 * addressed by its path relative to the adt base — e.g. `"assets/config.json"`
 * or `"content/i18n/pt-br/texts.json"`.
 *
 * Normally these are fetched as JSON files under `runtimeBase()`. The PNLD
 * export can't ship `.json` (VALIDE rejects the format), so it bakes every data
 * file into a single `window.__ADT_DATA__` map — keyed by this same relative
 * path — loaded via a `<script>` before the runtime boots. When that global is
 * present we read from it (also works offline / over `file://`, no fetch);
 * otherwise we fetch as before (adt/web, webpub, preview — unchanged).
 *
 * Returns the parsed value, or `null` when absent or the fetch fails.
 */
export async function loadAdtData<T = unknown>(
  relPath: string,
  versionParam = "",
): Promise<T | null> {
  const inline = typeof window !== "undefined" ? window.__ADT_DATA__ : undefined
  if (inline && Object.prototype.hasOwnProperty.call(inline, relPath)) {
    return inline[relPath] as T
  }
  try {
    const query = versionParam ? `?v=${versionParam}` : ""
    const res = await fetch(`${runtimeBase()}${relPath}${query}`)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Base URL prefix for runtime data fetches (config, manifests, i18n).
 *
 * Defaults to `./` — the adt/webpub layout where the page sits next to
 * `assets/` and `content/`. A package that relocates those (e.g. the PNLD
 * export, whose pages live in `content/` and whose data lives under
 * `resources/data/`) sets `<meta name="adt-base" content="../resources/data/">`
 * so the loaders resolve `assets/…` and `content/…` under that base instead.
 */
export function runtimeBase(): string {
  if (typeof document === "undefined") return "./"
  const meta = document.querySelector('meta[name="adt-base"]')?.getAttribute("content")
  if (!meta) return "./"
  return meta.endsWith("/") ? meta : `${meta}/`
}

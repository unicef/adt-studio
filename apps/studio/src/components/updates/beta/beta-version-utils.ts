import dayjs from "dayjs"
import "dayjs/locale/en"
import "dayjs/locale/es"
import "dayjs/locale/fr"
import "dayjs/locale/pt-br"
import "dayjs/locale/sq"
import localizedFormat from "dayjs/plugin/localizedFormat"
import type { AvailableRelease } from "@/hooks/use-update-status"

dayjs.extend(localizedFormat)

export function filterVersionsByQuery(
  versions: AvailableRelease[],
  query: string,
): AvailableRelease[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return versions
  const needle = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed
  return versions.filter(
    (release) =>
      release.version.toLowerCase().includes(needle) ||
      release.title?.toLowerCase().includes(trimmed) ||
      release.description?.toLowerCase().includes(trimmed),
  )
}

export function formatReleaseDate(value: string, locale?: string): string {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  return parsed.locale(resolveDayjsLocale(locale)).format("ll")
}

function resolveDayjsLocale(locale?: string): string {
  const locales: Record<string, string> = {
    en: "en",
    es: "es",
    fr: "fr",
    "pt-BR": "pt-br",
    sq: "sq",
  }
  return locales[locale ?? ""] ?? "en"
}

import dayjs, { type Dayjs } from "dayjs"
import "dayjs/locale/en"
import "dayjs/locale/es"
import "dayjs/locale/fr"
import "dayjs/locale/pt-br"
import "dayjs/locale/sq"
import isoWeek from "dayjs/plugin/isoWeek"
import localizedFormat from "dayjs/plugin/localizedFormat"
import type { AvailableRelease } from "@/hooks/use-update-status"

dayjs.extend(isoWeek)
dayjs.extend(localizedFormat)

const dayjsUnit = "isoWeek" as const
const dayjsFormat = "MMMM YYYY"

export type ReleaseDateGroupKind =
  | "today"
  | "yesterday"
  | "this-week"
  | "last-week"
  | "month"
  | "unknown"

export interface ReleaseDateGroup {
  key: string
  kind: ReleaseDateGroupKind
  month?: Dayjs
  releases: AvailableRelease[]
}

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

export function getReleaseSummary(notes?: string): string | undefined {
  if (!notes) return undefined

  const paragraphs = notes.replace(/\r\n/g, "\n").split(/\n\s*\n/)
  for (const paragraph of paragraphs) {
    const line = paragraph.replace(/\s*\n\s*/g, " ").trim()
    if (
      !line ||
      /^#{1,6}\s/.test(line) ||
      /^[-*+]\s/.test(line) ||
      /^!\[/.test(line) ||
      /^<[^>]+>/.test(line)
    ) {
      continue
    }

    const plain = line
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[\*_~`]/g, "")
      .trim()
    if (!plain) continue
    return plain.length > 220 ? `${plain.slice(0, 217).trimEnd()}…` : plain
  }

  return undefined
}

export function groupVersionsByReleaseDate(
  versions: AvailableRelease[],
  now: Date | string | number | Dayjs = dayjs(),
): ReleaseDateGroup[] {
  const reference = dayjs(now)
  const startToday = reference.startOf("day").valueOf()
  const startTomorrow = reference.add(1, "day").startOf("day").valueOf()
  const startYesterday = reference.subtract(1, "day").startOf("day").valueOf()
  const startThisWeek = reference.startOf(dayjsUnit).valueOf()
  const startLastWeek = reference
    .subtract(1, "week")
    .startOf(dayjsUnit)
    .valueOf()

  const sorted = [...versions].sort(
    (left, right) => releaseTimestamp(right) - releaseTimestamp(left),
  )
  const groups = new Map<string, ReleaseDateGroup>()

  for (const release of sorted) {
    const date = parseReleaseDate(release.releaseDate)
    let group: Omit<ReleaseDateGroup, "releases">

    if (!date) {
      group = { key: "unknown", kind: "unknown" }
    } else if (date.valueOf() >= startToday && date.valueOf() < startTomorrow) {
      group = { key: "today", kind: "today" }
    } else if (
      date.valueOf() >= startYesterday &&
      date.valueOf() < startToday
    ) {
      group = { key: "yesterday", kind: "yesterday" }
    } else if (
      date.valueOf() >= startThisWeek &&
      date.valueOf() < startYesterday
    ) {
      group = { key: "this-week", kind: "this-week" }
    } else if (
      date.valueOf() >= startLastWeek &&
      date.valueOf() < startThisWeek
    ) {
      group = { key: "last-week", kind: "last-week" }
    } else {
      const month = date.startOf("month")
      group = {
        key: `month-${month.format("YYYY-MM")}`,
        kind: "month",
        month,
      }
    }

    const existing = groups.get(group.key)
    if (existing) existing.releases.push(release)
    else groups.set(group.key, { ...group, releases: [release] })
  }

  return [...groups.values()]
}

export function formatReleaseDate(value: string, locale?: string): string {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  return parsed.locale(resolveDayjsLocale(locale)).format("ll")
}

export function formatReleaseDateGroup(
  group: ReleaseDateGroup,
  locale?: string,
): string | undefined {
  if (group.kind !== "month" || !group.month) return undefined
  return group.month.locale(resolveDayjsLocale(locale)).format(dayjsFormat)
}

function parseReleaseDate(value?: string): Dayjs | undefined {
  if (!value) return undefined
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : undefined
}

function releaseTimestamp(release: AvailableRelease): number {
  return (
    parseReleaseDate(release.releaseDate)?.valueOf() ?? Number.NEGATIVE_INFINITY
  )
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

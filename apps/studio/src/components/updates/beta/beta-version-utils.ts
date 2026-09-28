import dayjs from "dayjs"
import "dayjs/locale/en"
import "dayjs/locale/es"
import "dayjs/locale/fr"
import "dayjs/locale/pt-br"
import "dayjs/locale/sq"
import localizedFormat from "dayjs/plugin/localizedFormat"
import relativeTime from "dayjs/plugin/relativeTime"
import type { AvailableRelease } from "@/hooks/use-update-status"
import {
  formatVersion,
  previewPullRequestNumber,
  releaseHeadline,
} from "../release-banner-utils"

dayjs.extend(localizedFormat)
dayjs.extend(relativeTime)

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
      release.description?.toLowerCase().includes(trimmed) ||
      sourceSearchText(release).includes(trimmed),
  )
}

function sourceSearchText(release: AvailableRelease): string {
  const prs = release.source?.prs ?? []
  return [
    ...releaseContributors(release).map((login) => `@${login}`),
    ...prs.map((pr) => `#${pr.number} ${pr.title ?? ""}`),
  ]
    .join(" ")
    .toLowerCase()
}

export function releaseContributors(release: AvailableRelease): string[] {
  const prs = release.source?.prs ?? []
  const logins = prs.length ? prs.map((pr) => pr.author) : [release.author]
  return [
    ...new Set(
      logins.filter((login): login is string => Boolean(login) && !login?.endsWith("[bot]")),
    ),
  ]
}

export function githubAvatarUrl(login: string): string | undefined {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(login)
    ? `https://github.com/${login}.png?size=64`
    : undefined
}

export function cleanPullRequestTitle(title: string): string {
  const cleaned = title
    .replace(/^\w+(?:\([^)]*\))?!?:\s*/, "")
    .replace(/\s*(?:\[[^\]]*\]|\(#\d+\))\s*$/, "")
    .trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : title
}

export function releaseDisplayTitle(release: AvailableRelease): string {
  if (release.title) return release.title
  const prNumber = previewPullRequestNumber(release.version)
  const prTitle = release.source?.prs.find((pr) => pr.number === prNumber)?.title
  if (prTitle) return cleanPullRequestTitle(prTitle)
  const headline = releaseHeadline(release.releaseNotes)
  if (headline && !/^what'?s changed$/i.test(headline)) return headline
  return formatVersion(release.version)
}

export function formatRelativeReleaseDate(value: string, locale?: string): string {
  const parsed = dayjs(value)
  if (!parsed.isValid()) return value
  return parsed.locale(resolveDayjsLocale(locale)).fromNow()
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

import type { LucideIcon } from "lucide-react"
import { msg, plural } from "@lingui/core/macro"
import { i18n } from "@lingui/core"
import { STAGES } from "@/components/pipeline/stage-config"
import { getBookCoverUrl, type BookSummary } from "@/api/client"

/** Cover backgrounds picked deterministically per book label. */
const COVER_PALETTE = [
  { bg: "#1e40af", accent: "#7dd3fc" },
  { bg: "#166534", accent: "#86efac" },
  { bg: "#5b21b6", accent: "#ddd6fe" },
  { bg: "#1e293b", accent: "#f59e0b" },
  { bg: "#831843", accent: "#fbcfe8" },
  { bg: "#0f766e", accent: "#5eead4" },
  { bg: "#3f3f46", accent: "#fbbf24" },
  { bg: "#7c2d12", accent: "#fdba74" },
] as const

function hashLabel(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export interface CoverSpec {
  bg: string
  fg: string
  accent: string
  publisherShort: string
  placeholder: boolean
  real: boolean
  src?: string | null
}

export function deriveCover(book: BookSummary): CoverSpec {
  const swatch = COVER_PALETTE[hashLabel(book.label) % COVER_PALETTE.length]
  const publisherShort = (
    book.publisher ??
    book.authors[0] ??
    (book.languageCode
      ? i18n._(msg`${book.languageCode.toUpperCase()} EDITION`)
      : i18n._(msg`ADT STUDIO`))
  ).toUpperCase()
  const hasContent = book.pageCount > 0 || book.hasSourcePdf
  return {
    bg: swatch.bg,
    fg: "#ffffff",
    accent: swatch.accent,
    publisherShort,
    placeholder: !hasContent,
    real: hasContent,
    src: hasContent ? getBookCoverUrl(book.label, book.modifiedAt) : null,
  }
}

export interface StageDisc {
  slug: string
  icon: LucideIcon
  hex: string
}

const STAGE_ORDER = STAGES.filter((s) => s.slug !== "book")

/** Completed stages, mapped to disc glyphs in canonical pipeline order. */
export function presentDiscs(book: BookSummary): StageDisc[] {
  const done = new Set(book.completedStages)
  return STAGE_ORDER.filter((s) => done.has(s.slug)).map((s) => ({
    slug: s.slug,
    icon: s.icon,
    hex: s.hex,
  }))
}

/** Compact relative time — "2h ago", "yesterday", "3 days ago", else a date. */
export function formatRelative(iso: string, locale: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return i18n._(msg`just now`)
  if (mins < 60) return i18n._(msg`${mins}m ago`)
  const hours = Math.floor(mins / 60)
  if (hours < 24) return i18n._(msg`${hours}h ago`)
  const days = Math.floor(hours / 24)
  if (days === 1) return i18n._(msg`yesterday`)
  if (days < 7) return i18n._(msg`${days} days ago`)
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(then)
}

export interface BookVM {
  label: string
  displayTitle: string
  authors: string
  pagesText: string
  modified: string
  lang: string
  needsRebuild: boolean
  isNew: boolean
  cover: CoverSpec
  discs: StageDisc[]
  stageCount: number
  hasStages: boolean
  raw: BookSummary
}

export function toBookVM(book: BookSummary, locale: string): BookVM {
  const discs = presentDiscs(book)
  const pagesText =
    book.pageCount > 0
      ? plural(book.pageCount, { one: "# page", other: "# pages" })
      : i18n._(msg`Not started`)
  return {
    label: book.label,
    displayTitle: book.title ?? book.label,
    authors: book.authors.length > 0 ? book.authors.join(", ") : i18n._(msg`Unknown author`),
    pagesText,
    modified: formatRelative(book.modifiedAt, locale),
    lang: book.languageCode ? book.languageCode.toUpperCase() : "—",
    needsRebuild: book.needsRebuild,
    isNew: book.pageCount === 0 && discs.length === 0,
    cover: deriveCover(book),
    discs,
    stageCount: discs.length,
    hasStages: discs.length > 0,
    raw: book,
  }
}

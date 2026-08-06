/* eslint-disable lingui/no-unlocalized-strings -- invented book titles, dev-only fixtures */
import { useMemo, useState } from "react"
import type {
  PublicationReader,
  PublicationSummary,
  PublicationsOverview,
  PublicationsTotals,
} from "@adt/types"

/**
 * A shelf full of invented books, so the list can be looked at at a realistic size without
 * publishing fourteen books to a real Cloudflare account. Dev-only scaffolding: nothing here
 * is reachable from a production build, and deleting this file plus the three lines that call
 * it removes it completely.
 */

const DEMO_KEY = "adt-studio-publications-demo"

const DAY_MS = 24 * 60 * 60 * 1000
const MB = 1024 * 1024

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString()
}

function daysAhead(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString()
}

function token(seed: string): string {
  return `${seed}${"x".repeat(Math.max(0, 32 - seed.length))}`
}

function url(label: string): string {
  return `https://adt-publish.demo-account.workers.dev/p/${token(label)}`
}

interface DemoBook {
  label: string
  title: string
  versions: number
  updatedDaysAgo: number
  comments: number
  unresolved: number
  bytes: number | null
  code?: boolean
  expiresInDays?: number
  expiredDaysAgo?: number
  revokedDaysAgo?: number
  missing?: boolean
}

const DEMO_BOOKS: DemoBook[] = [
  {
    label: "ciencias-6-ano",
    title: "Ciências da Natureza — 6º ano",
    versions: 4,
    updatedDaysAgo: 0,
    comments: 38,
    unresolved: 11,
    bytes: 62 * MB,
  },
  {
    label: "matematica-fundamental",
    title: "Matemática Fundamental, Volume 2",
    versions: 2,
    updatedDaysAgo: 1,
    comments: 6,
    unresolved: 0,
    bytes: 41 * MB,
    code: true,
    expiresInDays: 21,
  },
  {
    label: "reading-companion",
    title: "The Reading Companion",
    versions: 9,
    updatedDaysAgo: 3,
    comments: 214,
    unresolved: 127,
    bytes: 88 * MB,
  },
  {
    label: "historia-do-brasil",
    title: "História do Brasil: da colônia à república",
    versions: 1,
    updatedDaysAgo: 5,
    comments: 0,
    unresolved: 0,
    bytes: 12 * MB,
    code: true,
  },
  {
    label: "gjuha-shqipe-5",
    title: "Gjuha Shqipe 5 — libri i nxënësit",
    versions: 3,
    updatedDaysAgo: 8,
    comments: 19,
    unresolved: 2,
    bytes: 55 * MB,
    missing: true,
  },
  {
    label: "science-workbook",
    title: "Science Workbook (accessible edition)",
    versions: 6,
    updatedDaysAgo: 11,
    comments: 47,
    unresolved: 5,
    bytes: null,
  },
  {
    label: "geografia-atlas",
    title: "Geografia e Atlas Escolar",
    versions: 2,
    updatedDaysAgo: 14,
    comments: 3,
    unresolved: 1,
    bytes: 97 * MB,
    expiresInDays: 3,
  },
  {
    label: "artes-visuais",
    title: "Artes Visuais para o Ensino Fundamental",
    versions: 1,
    updatedDaysAgo: 19,
    comments: 12,
    unresolved: 0,
    bytes: 34 * MB,
    code: true,
    expiredDaysAgo: 2,
  },
  {
    label: "cuentos-cortos",
    title: "Cuentos cortos para leer en voz alta",
    versions: 5,
    updatedDaysAgo: 23,
    comments: 71,
    unresolved: 8,
    bytes: 27 * MB,
    revokedDaysAgo: 4,
  },
  {
    label: "lecture-facile",
    title: "Lecture facile — édition pilote",
    versions: 2,
    updatedDaysAgo: 30,
    comments: 9,
    unresolved: 0,
    bytes: 18 * MB,
    revokedDaysAgo: 12,
  },
  {
    label: "quimica-organica",
    title: "Química Orgânica — caderno de atividades",
    versions: 7,
    updatedDaysAgo: 41,
    comments: 156,
    unresolved: 23,
    bytes: 73 * MB,
  },
  {
    label: "primeiros-passos",
    title: "Primeiros Passos na Leitura",
    versions: 1,
    updatedDaysAgo: 52,
    comments: 2,
    unresolved: 0,
    bytes: 8 * MB,
    missing: true,
    expiredDaysAgo: 20,
  },
  {
    label: "educacao-fisica",
    title: "Educação Física e Saúde",
    versions: 3,
    updatedDaysAgo: 66,
    comments: 24,
    unresolved: 4,
    bytes: 45 * MB,
  },
  {
    label: "pilot-accessibility-review",
    title: "Pilot: accessibility review copy with a deliberately long title",
    versions: 12,
    updatedDaysAgo: 90,
    comments: 88,
    unresolved: 0,
    bytes: 51 * MB,
    code: true,
  },
]

const DEMO_CODES: Record<string, string> = {
  "matematica-fundamental": "M4T9KP",
  "historia-do-brasil": "TURMA6B",
  "artes-visuais": "ARTE24",
  "pilot-accessibility-review": "PILOT7",
}

function toSummary(book: DemoBook): PublicationSummary {
  return {
    token: token(book.label),
    title: book.title,
    book_label: book.label,
    book_exists: book.missing !== true,
    url: url(book.label),
    current_version: book.versions,
    version_count: book.versions,
    created_at: daysAgo(book.updatedDaysAgo + book.versions * 4),
    last_published_at: daysAgo(book.updatedDaysAgo),
    expires_at:
      book.expiredDaysAgo !== undefined
        ? daysAgo(book.expiredDaysAgo)
        : book.expiresInDays !== undefined
          ? daysAhead(book.expiresInDays)
          : null,
    revoked_at: book.revokedDaysAgo !== undefined ? daysAgo(book.revokedDaysAgo) : null,
    has_access_code: book.code === true,
    access_code: book.code === true ? DEMO_CODES[book.label] ?? "TURMA3B" : null,
    comment_count: book.comments,
    unresolved_count: book.unresolved,
    snapshot_bytes: book.bytes,
    source: "worker",
  }
}

function totalsOf(publications: PublicationSummary[]): PublicationsTotals {
  const now = Date.now()
  return {
    published_count: publications.length,
    active_count: publications.filter(
      (publication) =>
        publication.revoked_at === null &&
        (publication.expires_at === null || Date.parse(publication.expires_at) > now),
    ).length,
    total_snapshot_bytes: publications.reduce(
      (sum, publication) => sum + (publication.snapshot_bytes ?? 0),
      0,
    ),
    snapshot_bytes_complete: publications.every(
      (publication) => publication.snapshot_bytes !== null,
    ),
    total_unresolved: publications.reduce(
      (sum, publication) => sum + publication.unresolved_count,
      0,
    ),
  }
}

const DEMO_READER_NAMES = [
  "Ana Beatriz",
  "Mr. Okonkwo",
  "Sofia",
  "Turma 6B (tablet da sala)",
  "Jean-Pierre",
  "Arta",
  "Coordenação pedagógica",
  "Lucas M.",
]

const DEMO_READER_COLORS = [
  "#e5484d",
  "#f76808",
  "#46a758",
  "#0091ff",
  "#8e4ec6",
  "#12a594",
  "#e93d82",
  "#3e63dd",
]

/** A roster sized from the publication's own comment count, so a book with 214 comments shows a
 *  crowd and a freshly published one shows nobody — including the empty state, which is the
 *  case the panel's wording exists for. */
export function readersForDemoToken(demoToken: string): readonly PublicationReader[] {
  const book = DEMO_BOOKS.find((entry) => token(entry.label) === demoToken)
  if (!book) return []
  const count = book.comments === 0 ? 0 : Math.min(DEMO_READER_NAMES.length, 1 + book.comments / 12)

  return Array.from({ length: Math.floor(count) }, (_, index) => {
    const wrote = Math.max(0, Math.round(book.comments / Math.max(1, Math.floor(count))) - index)
    return {
      id: `${demoToken}-reader-${index}`,
      name: DEMO_READER_NAMES[index] as string,
      color: DEMO_READER_COLORS[index] as string,
      joined_at: daysAgo(book.updatedDaysAgo + index * 2),
      comment_count: wrote,
      last_comment_at: wrote === 0 ? null : daysAgo(book.updatedDaysAgo + index),
    }
  })
}

export interface PublicationsDemo {
  active: boolean
  overview: PublicationsOverview
  toggle: () => void
}

export function usePublicationsDemo(): PublicationsDemo {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(DEMO_KEY) === "1"
    } catch {
      return false
    }
  })

  const overview = useMemo<PublicationsOverview>(() => {
    const publications = DEMO_BOOKS.map(toSummary)
    return { worker_reachable: true, publications, totals: totalsOf(publications) }
  }, [])

  return {
    active,
    overview,
    toggle: () =>
      setActive((current) => {
        try {
          localStorage.setItem(DEMO_KEY, current ? "0" : "1")
        } catch {
          /* private-mode storage failures must never break the toggle */
        }
        return !current
      }),
  }
}

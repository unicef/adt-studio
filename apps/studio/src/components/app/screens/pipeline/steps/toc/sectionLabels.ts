import type { PageSummarySection, TocSection } from "@/api/client"

const FIRST_WORDS_MAX = 56
const SECTION_ID = /^pg(\d{3})\d*_sec(\d+)$/

export interface SectionFacts {
  heading: string | null
  firstWords: string | null
  type: string | null
  index: number | null
}

export function firstWords(text: string | undefined, max = FIRST_WORDS_MAX): string | null {
  const line = text
    ?.split("\n")
    .map((part) => part.trim())
    .find((part) => part !== "")
  if (!line) return null
  if (line.length <= max) return line.replace(/[,;:]$/, "")
  const cut = line.slice(0, max)
  const space = cut.lastIndexOf(" ")
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[,;:.]$/, "")}…`
}

export function parseSectionId(sectionId: string): { pageNumber: number; index: number } | null {
  const match = SECTION_ID.exec(sectionId)
  if (!match) return null
  return { pageNumber: Number(match[1]), index: Number(match[2]) }
}

export function sectionFacts(section: TocSection, summary?: PageSummarySection): SectionFacts {
  const title = section.title.trim()
  const heading = title !== "" && title !== section.sectionId ? title : null
  const index = summary ? summary.sectionIndex + 1 : (parseSectionId(section.sectionId)?.index ?? null)
  return {
    heading,
    firstWords: heading ? null : firstWords(summary?.textPreview),
    type: summary?.sectionType ?? null,
    index,
  }
}

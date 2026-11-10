import { useCallback, useMemo } from "react"
import { useLingui } from "@lingui/react/macro"
import type { PageSummaryItem, PageSummarySection, TocSection } from "@/api/client"
import { getSectionTypeLabel } from "@/lib/section-constants"
import { parseSectionId, sectionFacts } from "./sectionLabels"

export interface TocSectionOption extends TocSection {
  label: string
  detail: string
  search: string
}

export function useTocSectionOptions(sections: readonly TocSection[], pages: readonly PageSummaryItem[]): TocSectionOption[] {
  const { t } = useLingui()
  const summaries = useMemo(() => {
    const byId = new Map<string, PageSummarySection>()
    for (const page of pages) for (const section of page.sections ?? []) byId.set(section.sectionId, section)
    return byId
  }, [pages])

  return useMemo(
    () =>
      sections.map((section) => {
        const facts = sectionFacts(section, summaries.get(section.sectionId))
        const type = facts.type ? getSectionTypeLabel(facts.type) : null
        const numbered = facts.index != null ? t`Section ${facts.index}` : null
        const label = facts.heading ?? facts.firstWords ?? type ?? numbered ?? t`Untitled section`
        const detail = [label === type ? null : type, numbered].filter(Boolean).join(" · ")
        return { ...section, label, detail, search: [label, detail, section.title, section.sectionId].join(" ").toLocaleLowerCase() }
      }),
    [sections, summaries, t],
  )
}

export function useMissingSectionLabel() {
  const { t } = useLingui()
  return useCallback(
    (sectionId: string) => {
      const parsed = parseSectionId(sectionId)
      return parsed ? t`Page ${parsed.pageNumber} · section ${parsed.index}` : t`Linked section`
    },
    [t],
  )
}

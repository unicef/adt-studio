import type { PageDetail, PageSummarySection } from "@/api/client"

export type SectioningTree = NonNullable<PageDetail["sectioningTree"]>
export type RenderedSections = NonNullable<PageDetail["rendering"]>["sections"]

export function togglePruned(base: SectioningTree, sectionIndex: number): SectioningTree {
  if (!base.sections[sectionIndex]) return base
  return {
    ...base,
    sections: base.sections.map((section, index) =>
      index === sectionIndex ? { ...section, isPruned: !section.isPruned } : section,
    ),
  }
}

export function sectioningChanged(saved: SectioningTree | null, pending: SectioningTree | null): boolean {
  if (!pending) return false
  if (!saved || saved.sections.length !== pending.sections.length) return true
  return pending.sections.some((section, index) => !!section.isPruned !== !!saved.sections[index]?.isPruned)
}

export function nextPendingSectioning(
  saved: SectioningTree | null,
  pending: SectioningTree | null,
  sectionIndex: number,
): SectioningTree | null {
  const base = pending ?? saved
  if (!base) return pending
  const next = togglePruned(base, sectionIndex)
  return sectioningChanged(saved, next) ? next : null
}

export function withPendingPrune(sections: PageSummarySection[], pending: SectioningTree | null): PageSummarySection[] {
  if (!pending) return sections
  return sections.map((section) => {
    const draft = pending.sections[section.sectionIndex]
    return draft && !!draft.isPruned !== section.isPruned ? { ...section, isPruned: !!draft.isPruned } : section
  })
}

function hasHtml(rendering: RenderedSections | null | undefined, sectionIndex: number): boolean {
  return !!rendering?.find((section) => section.sectionIndex === sectionIndex)?.html
}

export function restoredWithoutHtml(
  saved: SectioningTree | null,
  pending: SectioningTree | null,
  rendering: RenderedSections | null | undefined,
): number[] {
  if (!pending) return []
  return pending.sections.flatMap((section, index) =>
    !section.isPruned && saved?.sections[index]?.isPruned && !hasHtml(rendering, index) ? [index] : [],
  )
}

export function isCustomActivity(sectionType: string | undefined): boolean {
  return sectionType?.startsWith("activity_custom") ?? false
}

export interface RerenderPlan {
  rerender: number[]
  renderingInSync: boolean
}

export function planRerender(
  saved: SectioningTree | null,
  pending: SectioningTree | null,
  rendering: RenderedSections | null | undefined,
  canRender: boolean,
): RerenderPlan {
  const needed = restoredWithoutHtml(saved, pending, rendering)
  const rerender = canRender
    ? needed.filter((index) => !isCustomActivity(pending?.sections[index]?.sectionType))
    : []
  return { rerender, renderingInSync: rerender.length === needed.length }
}

export function currentSectionIndex(
  sections: PageSummarySection[],
  selected: number | null | undefined,
  focused: number | null | undefined,
): number | null {
  const has = (index: number | null | undefined): index is number =>
    index != null && sections.some((section) => section.sectionIndex === index)
  if (has(selected)) return selected
  if (has(focused)) return focused
  return sections[0]?.sectionIndex ?? null
}

import { Search, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { StepFilterTabs } from "../shared/StepFilterTabs"
import { ALL_SECTIONS } from "./sectionGroups"
import type { CaptionFilters } from "./useCaptionFilters"
import { useSectionLabel } from "./useSectionLabel"

export function CaptionFilterBar({ filters, hex, className }: { filters: CaptionFilters; hex: string; className?: string }) {
  const { t } = useLingui()
  const sectionLabel = useSectionLabel()
  const { counts, tabs } = filters
  const query = filters.ownQuery.trim()
  const show = counts.all > 1 || tabs.length > 0 || filters.filter !== "all" || query !== ""
  if (!show) return null
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <StepFilterTabs
        ariaLabel={t`Show images`}
        accent={hex}
        value={filters.filter}
        onChange={filters.setFilter}
        options={[
          { value: "all", label: t`All`, count: counts.all },
          { value: "describe", label: t`To describe`, count: counts.describe },
          { value: "captioned", label: t`Described`, count: counts.captioned },
          { value: "decorative", label: t`Decorative`, count: counts.decorative },
        ]}
      />
      {tabs.length > 0 && (
        <StepFilterTabs
          ariaLabel={t`Show section`}
          accent={hex}
          value={filters.section}
          onChange={filters.setSection}
          options={[
            { value: ALL_SECTIONS, label: t`All sections`, count: counts.all },
            ...tabs.map((tab) => ({ value: tab.value, label: sectionLabel(tab.sectionIndex, tab.sectionType), count: tab.count })),
          ]}
        />
      )}
      {query !== "" && (
        <span className="flex h-8 items-center gap-1.5 rounded-lg border bg-card pl-2.5 pr-1 text-[12px] text-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
          <Search aria-hidden className="size-3 text-muted-foreground" />
          {t`Matching “${query}”`}
          <button
            type="button"
            onClick={() => filters.setSearch("")}
            aria-label={t`Show every image on this page`}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </span>
      )}
    </div>
  )
}

export function CaptionFilterEmpty({ filters }: { filters: CaptionFilters }) {
  const { t } = useLingui()
  const query = filters.search.trim()
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center text-[12.5px] text-muted-foreground">
      <span>
        {query
          ? t`No images on this page match “${query}”.`
          : filters.filter === "describe"
            ? t`Every image here has a description.`
            : t`No images match this filter.`}
      </span>
      <button type="button" onClick={filters.clear} className="font-medium text-foreground underline-offset-4 transition-colors hover:underline">
        {query ? t`Clear search` : t`Clear filters`}
      </button>
    </div>
  )
}

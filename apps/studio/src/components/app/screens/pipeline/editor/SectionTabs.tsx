import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDrafts } from "./draftStore"
import type { EditorSection } from "./useStoryboardEditor"

export interface SectionTabsProps {
  pageId: string
  sections: EditorSection[]
  activeSectionIndex: number | null
  onSelect: (pageId: string, sectionIndex: number) => void
}

export const SectionTabs = memo(function SectionTabs({
  pageId,
  sections,
  activeSectionIndex,
  onSelect,
}: SectionTabsProps) {
  const { t } = useLingui()
  const drafts = useDrafts(pageId)

  if (sections.length < 2) return null

  return (
    <div
      role="tablist"
      aria-label={t`Sections`}
      className="no-scrollbar flex min-w-0 items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5"
    >
      {sections.map((section, position) => {
        const active = section.sectionIndex === activeSectionIndex
        const edited = section.sectionIndex in drafts
        return (
          <button
            key={section.sectionId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(pageId, section.sectionIndex)}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[11.5px] font-medium tabular-nums transition-[color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
            )}
          >
            {section.isActivity && <Sparkles className="size-3 text-brand-600" aria-hidden />}
            <Trans>Section {position + 1}</Trans>
            {edited && (
              <>
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-amber-500 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200"
                />
                <span className="sr-only">
                  <Trans>Unsaved changes</Trans>
                </span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
})

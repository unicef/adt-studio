import { Trans } from "@lingui/react/macro"
import { TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DockItem } from "@/components/app/screens/pipeline/shared/usePipelineState"
import { sectionsFor, useGroupCopy, type DockNext, type KeyedGroup } from "./model"
import { AddRow, StepRow } from "./parts"
import { SKIN } from "./style"

export interface DockSheetProps {
  openKey: string
  groups: KeyedGroup[]
  available: (key: string) => DockItem[]
  activeSlug: string | null | undefined
  next: DockNext | null
  notices: Partial<Record<string, string>>
  direction: 1 | -1
  onGo: (slug: string) => void
  onAdd?: (slug: string) => void
  onSkipNext?: (key: string) => void
}

export function DockSheet({ openKey, groups, available, activeSlug, next, notices, direction, onGo, onAdd, onSkipNext }: DockSheetProps) {
  const copy = useGroupCopy()
  const sections = sectionsFor(openKey).map((key) => ({
    key,
    items: groups.find((group) => group.key === key)?.items ?? [],
    extra: onAdd ? available(key) : [],
  }))
  const multiple = sections.length > 1
  const suggestedHere = next && sections.some((section) => [...section.items, ...section.extra].some((item) => item.slug === next.slug))
  let index = 0

  return (
    <div
      key={openKey}
      role="group"
      className={cn("animate-in fade-in duration-200 ease-out motion-reduce:animate-none", direction > 0 ? "slide-in-from-right-2" : "slide-in-from-left-2")}
    >
      {suggestedHere && next && (
        <div className="mx-1 mt-1 mb-1.5 flex items-center gap-2.5 rounded-[12px] bg-brand-500/[0.08] py-1.5 pr-1.5 pl-3 text-[12px] animate-in fade-in duration-300 dark:bg-brand-400/[0.12]">
          <span className="size-1.5 shrink-0 rounded-full bg-brand-600 dark:bg-brand-400" />
          <p className={cn("min-w-0 flex-1 truncate", SKIN.muted)}>
            <Trans>
              Suggested next: <span className={cn("font-semibold", SKIN.strong)}>{next.title}</span>
            </Trans>
          </p>
          {onSkipNext && (
            <button
              type="button"
              onClick={() => onSkipNext(next.key)}
              className={cn(
                "h-6 shrink-0 cursor-pointer rounded-md px-2 text-[11.5px] font-medium transition-colors duration-150",
                SKIN.muted,
                "hover:bg-zinc-950/[0.05] hover:text-zinc-950 dark:hover:bg-white/[0.08] dark:hover:text-white",
              )}
            >
              <Trans>Not now</Trans>
            </button>
          )}
        </div>
      )}
      {sections.map((section) => (
        <section key={section.key} className={cn(multiple && "pb-1")}>
          <div className={cn("flex items-baseline justify-between gap-3 px-3 pb-2", multiple ? "pt-1.5" : "pt-2 pb-2.5")}>
            <p className={cn("font-semibold tracking-[-0.01em]", multiple ? "text-[12px]" : "text-[13px]", SKIN.strong)}>{copy(section.key).name}</p>
            <p className={cn("truncate text-[12px]", SKIN.muted)}>{copy(section.key).hint}</p>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {section.items.map((item) => (
              <StepRow
                key={item.slug}
                item={item}
                index={index++}
                here={item.slug === activeSlug}
                suggested={next?.slug === item.slug && item.slug !== activeSlug}
                notice={notices[item.slug]}
                onClick={() => onGo(item.slug)}
              />
            ))}
            {onAdd &&
              section.extra.map((item) => (
                <AddRow
                  key={item.slug}
                  item={item}
                  index={index++}
                  suggested={next?.slug === item.slug}
                  notice={notices[item.slug]}
                  onClick={() => onAdd(item.slug)}
                />
              ))}
          </div>
        </section>
      ))}
      {openKey === "convert" && (
        <div className="mx-1 mt-1.5 flex items-start gap-2.5 rounded-[12px] bg-amber-500/10 px-3 py-2.5 text-[12px] leading-snug text-amber-800 animate-in fade-in duration-300 dark:text-amber-200">
          <TriangleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2.2} />
          <p>
            <Trans>
              Changing these rebuilds the storyboard. Your page edits and everything made from it (image descriptions, quizzes, translations,
              voices) will need to run again.
            </Trans>
          </p>
        </div>
      )}
      <div className="h-1.5" />
    </div>
  )
}

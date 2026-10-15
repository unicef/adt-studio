import { Trans, useLingui } from "@lingui/react/macro"
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
  explain?: boolean
  onGo: (slug: string) => void
  onAdd?: (slug: string) => void
  onSkipNext?: (key: string) => void
}

export function DockSheet({ openKey, groups, available, activeSlug, next, notices, direction, explain = false, onGo, onAdd, onSkipNext }: DockSheetProps) {
  const { t } = useLingui()
  const copy = useGroupCopy()
  const explainHint = (key: string) =>
    key === "accessibility"
      ? t`Recommended. Makes the book usable by readers with disabilities.`
      : key === "enhancements"
        ? t`Optional extras for learning. Add any, in any order.`
        : t`Do these last: they translate and read aloud everything above.`
  const keys = sectionsFor(openKey)
  const sections = keys.map((key) => ({
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
      role="tabpanel"
      className={cn("animate-in fade-in duration-200 ease-out motion-reduce:animate-none", direction > 0 ? "slide-in-from-right-2" : "slide-in-from-left-2")}
    >
      {explain && (
        <div className="px-3 pt-2 pb-3">
          <p className={cn("text-[14px] font-semibold tracking-[-0.01em]", SKIN.strong)}>
            <Trans>Add to your book</Trans>
          </p>
          <p className={cn("mt-0.5 text-[12.5px] leading-snug", SKIN.muted)}>
            <Trans>
              Everything here is optional. Start with accessibility, add any extras, and do languages and voices last, since they translate
              everything above.
            </Trans>
          </p>
        </div>
      )}
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
      {sections.map((section, sectionIndex) => (
        <section key={section.key} className={cn(multiple && "pb-1")}>
          <div className={cn("flex gap-3 px-3 pb-2", explain ? "flex-col gap-0.5 pt-2.5" : "items-baseline justify-between", !explain && (multiple ? "pt-1.5" : "pt-2 pb-2.5"))}>
            <p className={cn("flex items-center gap-2 font-semibold tracking-[-0.01em]", multiple ? "text-[12px]" : "text-[13px]", SKIN.strong)}>
              {explain && (
                <span className="grid size-[18px] place-items-center self-center rounded-full text-[10.5px] font-bold tabular-nums ring-[1.5px] ring-current/30">
                  {sectionIndex + 1}
                </span>
              )}
              {copy(section.key).name}
            </p>
            <p className={cn("text-[12px]", explain ? "pl-[26px]" : "truncate", SKIN.muted)}>{explain ? explainHint(section.key) : copy(section.key).hint}</p>
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
                explain={explain}
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
                  explain={explain}
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

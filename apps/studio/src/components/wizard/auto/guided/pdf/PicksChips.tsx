import { useLingui } from "@lingui/react/macro"
import { Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ScreenId } from "../check/screens"
import type { PdfPick } from "./parts"

/** The picks so far as chips ("Kind of book · Story ✎"); each opens its Check screen again while that's possible. */
export function PicksChips({ picks, onEdit, className }: { picks: PdfPick[]; onEdit: ((screen: ScreenId) => void) | null; className?: string }) {
  const { t, i18n } = useLingui()
  if (!picks.length) return null
  return (
    <nav aria-label={t`Your picks so far`} className={cn("flex flex-wrap gap-1.5", className)}>
      {picks.map((p) => {
        const title = i18n._(p.title)
        const inner = (
          <>
            <span className="text-muted-foreground">{title}</span>
            <span className="font-medium">{p.value}</span>
            {onEdit && <Pencil aria-hidden className="size-3 text-muted-foreground transition-colors group-hover:text-brand-600" />}
          </>
        )
        return onEdit ? (
          <button key={p.screen} type="button" onClick={() => onEdit(p.screen)} aria-label={t`Change ${title}: ${p.value}`} className="group inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--lc-bubble)] px-2.5 text-[12.5px] ring-1 ring-border transition-[box-shadow,transform] duration-150 hover:ring-brand-300 active:scale-[0.97] animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
            {inner}
          </button>
        ) : (
          <span key={p.screen} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--lc-bubble)] px-2.5 text-[12.5px] ring-1 ring-border">
            {inner}
          </span>
        )
      })}
    </nav>
  )
}

/** The picks as a trail for the stepper's line during Check: "Story › Spanish › ● How the pages look". */
export function PicksTrail({ picks, current, onEdit }: { picks: PdfPick[]; current: string; onEdit: ((screen: ScreenId) => void) | null }) {
  const { t, i18n } = useLingui()
  return (
    <nav aria-label={t`Your picks so far`} className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
      {picks.map((p) => {
        const title = i18n._(p.title)
        return (
          <span key={p.screen} className="inline-flex items-center gap-1">
            {onEdit ? (
              <button type="button" onClick={() => onEdit(p.screen)} title={title} aria-label={t`Change ${title}: ${p.value}`} className="rounded-md px-1 text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-brand-400">
                {p.value}
              </button>
            ) : (
              <span className="px-1 text-muted-foreground" title={title}>
                {p.value}
              </span>
            )}
            <span aria-hidden className="text-muted-foreground/50">
              ›
            </span>
          </span>
        )
      })}
      <span className="inline-flex items-center gap-1.5 px-1 font-semibold">
        <span aria-hidden className="size-1.5 rounded-full bg-[var(--gd-step)]" />
        {current}
      </span>
    </nav>
  )
}

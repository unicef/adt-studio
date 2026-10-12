import { useState } from "react"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Option } from "../questions"
import { Preview, isAi } from "../strategies"

export type PickCardsProps = { candidates: Option[]; others: Option[]; value: string; onChange: (v: string) => void; page?: string }

function Thumb({ id, page, size = "sm" }: { id: string; page?: string; size?: "sm" | "md" }) {
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[8px] bg-card ring-1 ring-black/5", size === "md" ? "h-[48px] w-[70px]" : "h-9 w-12")}>
      <Preview id={id} device="desktop" width={size === "md" ? 66 : 46} page={page} className="!shadow-none" />
    </span>
  )
}

function Kind({ id }: { id: string }) {
  return <span className={cn("text-[11px] font-medium", isAi(id) ? "text-brand-700" : "text-muted-foreground")}>{isAi(id) ? <Trans>AI-powered</Trans> : <Trans>Template-based</Trans>}</span>
}

/**
 * The looks the AI didn't pick, kept out of the way behind "Advanced". It opens a small popover that
 * says so plainly; choosing a look closes it and the trigger itself becomes that selection, so the
 * AI's two picks stay the only things on screen until someone deliberately goes looking.
 */
function AdvancedLooks({ others, value, onChange, page }: { others: Option[]; value: string; onChange: (v: string) => void; page?: string }) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const chosen = others.find((o) => o.value === value)
  if (others.length === 0) return null
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-left transition-[background-color,box-shadow,color] duration-200 active:scale-[0.98]",
            chosen
              ? "rounded-[14px] bg-card py-1.5 pl-1.5 pr-3 shadow-[0_6px_18px_-8px_rgba(43,127,255,0.6)] ring-2 ring-brand-500"
              : cn("rounded-full px-3.5 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground", open && "bg-muted text-foreground"),
          )}
        >
          {chosen ? (
            <>
              <Thumb id={chosen.value} page={page} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-semibold leading-tight text-foreground">{chosen.title}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <SlidersHorizontal className="size-3" />
                  <Trans>Advanced</Trans>
                </span>
              </span>
            </>
          ) : (
            <>
              <SlidersHorizontal className="size-4" />
              <span>
                <Trans>Advanced</Trans> <span className="font-medium text-muted-foreground/70">· <Plural value={others.length} one="# more look" other="# more looks" /></span>
              </span>
            </>
          )}
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} className="w-[360px] rounded-2xl p-2">
        <div className="px-2.5 pb-2 pt-1.5">
          <p className="text-[13.5px] font-semibold">
            <Trans>Other looks</Trans>
          </p>
          <p className="text-[12px] leading-snug text-muted-foreground">
            <Trans>The AI didn&apos;t pick these for your book, but you can still use one.</Trans>
          </p>
        </div>
        <div role="radiogroup" aria-label={t`Other looks`} className="flex flex-col gap-1">
          {others.map((o) => {
            const checked = value === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
                className={cn("flex w-full items-center gap-3 rounded-xl p-1.5 pr-3 text-left transition-colors duration-150", checked ? "bg-brand-50" : "hover:bg-muted")}
              >
                <Thumb id={o.value} page={page} size="md" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-semibold leading-tight">{o.title}</span>
                  <span className="text-[12px] leading-snug text-muted-foreground">{o.tagline}</span>
                  <Kind id={o.value} />
                </span>
                {checked && <Check className="size-4 shrink-0 stroke-[3] text-brand-600" />}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The AI's two picks as cards with a thumbnail and their pitch; "Advanced" sits quietly after them. */
export function PickCards({ candidates, others, value, onChange, page }: PickCardsProps) {
  const { t } = useLingui()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div data-decide-switcher role="radiogroup" aria-label={t`Page look`} className="flex items-stretch gap-3">
        {candidates.map((o) => {
          const checked = value === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(o.value)}
              className={cn(
                "relative flex w-[340px] items-center gap-3 rounded-[18px] bg-card p-2.5 pr-4 text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 active:scale-[0.99]",
                checked ? "shadow-[0_10px_26px_-12px_rgba(43,127,255,0.7)] ring-2 ring-brand-500" : "shadow-[0_8px_22px_-16px_rgba(15,23,42,0.4)] ring-1 ring-brand-200 hover:ring-brand-300",
              )}
            >
              <Thumb id={o.value} page={page} size="md" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold leading-tight">{o.title}</span>
                <span className="text-[12px] leading-snug text-muted-foreground">{o.tagline}</span>
              </span>
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors duration-200", checked ? "border-brand-600 bg-brand-600 text-primary-foreground" : "border-border")}>{checked && <Check className="size-3 stroke-[3]" />}</span>
            </button>
          )
        })}
      </div>
      <AdvancedLooks others={others} value={value} onChange={onChange} page={page} />
    </div>
  )
}

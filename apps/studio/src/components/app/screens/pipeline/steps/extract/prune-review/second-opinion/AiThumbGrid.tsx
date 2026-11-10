import { useLingui } from "@lingui/react/macro"
import { Check, HelpCircle, Minus } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "../FilteredThumb"
import type { FilteredImage } from "../useFilteredImages"
import { CATEGORY_LABEL, VERDICT_DOT, VERDICT_LABEL } from "./opinionCopy"
import type { Opinion } from "./opinionStore"

const RING = { keep: "ring-emerald-500", unsure: "ring-amber-400", remove: "ring-zinc-400 dark:ring-zinc-500" } as const

export function VerdictMark({ verdict, small = false }: { verdict: "keep" | "unsure" | "remove"; small?: boolean }) {
  const icon = small ? "size-2" : "size-2.5"
  const enter = "animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
  return (
    <>
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset", RING[verdict], enter)} />
      <span aria-hidden className={cn("absolute top-1 right-1 grid place-items-center rounded-full text-white", small ? "size-3" : "size-3.5", VERDICT_DOT[verdict], enter)}>
        {verdict === "keep" ? <Check className={icon} strokeWidth={3} /> : verdict === "unsure" ? <HelpCircle className={icon} strokeWidth={3} /> : <Minus className={icon} strokeWidth={3} />}
      </span>
    </>
  )
}

export function AiThumbGrid({
  label,
  items,
  active,
  opinionOf,
  onOpen,
}: {
  label: string
  items: readonly FilteredImage[]
  active: ReadonlySet<string>
  opinionOf: (item: FilteredImage) => Opinion | null
  onOpen?: (item: FilteredImage) => void
}) {
  const { t, i18n } = useLingui()
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
      {items.map((item) => {
        const answer = opinionOf(item)
        const checking = active.has(item.key)
        const title = answer
          ? `${i18n._(VERDICT_LABEL[answer.verdict])} · ${i18n._(CATEGORY_LABEL[answer.category])} — ${answer.reasoning}`
          : checking
            ? t`Page ${item.pageNumber}: checking now`
            : t`Page ${item.pageNumber}: waiting`
        return (
          <button
            key={item.key}
            type="button"
            title={title}
            aria-label={title}
            disabled={!onOpen}
            onClick={() => onOpen?.(item)}
            className={cn(
              "relative aspect-square rounded-md outline-none transition-[opacity,box-shadow,transform] duration-300 motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)] enabled:hover:-translate-y-0.5",
              !answer && !checking && "opacity-35",
              checking && "ring-2 ring-[var(--chrome-hex)] ring-offset-1 ring-offset-background",
            )}
          >
            <FilteredThumb label={label} imageId={item.imageId} alt="" className="size-full bg-card" />
            {answer && (
              <VerdictMark verdict={answer.verdict} />
            )}
          </button>
        )
      })}
    </div>
  )
}

import { useEffect, useRef } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { ReviewStep } from "../ranking"
import type { Verdict } from "./judgeStore"

const DOT: Record<Verdict | "open" | "note", string> = {
  right: "bg-emerald-500 dark:bg-emerald-400",
  wrong: "bg-amber-500 dark:bg-amber-400",
  note: "bg-muted-foreground/55",
  open: "bg-muted-foreground/20",
}

export function JudgeDots({
  list,
  index,
  verdictOf,
  commentOf,
  onJump,
}: {
  list: readonly ReviewStep[]
  index: number
  verdictOf: (imageId: string) => Verdict | null
  commentOf: (imageId: string) => string
  onJump: (index: number) => void
}) {
  const { t } = useLingui()
  const track = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = track.current
    const dot = container?.children[index] as HTMLElement | undefined
    if (!container || !dot) return
    const left = dot.offsetLeft
    const target = left - container.clientWidth / 2 + dot.offsetWidth / 2
    if (left < container.scrollLeft + 8 || left + dot.offsetWidth > container.scrollLeft + container.clientWidth - 8) {
      container.scrollTo({ left: Math.max(0, target) })
    }
  }, [index])

  return (
    <div
      ref={track}
      role="list"
      aria-label={t`Left-out images in this review`}
      data-judge-dots
      className="relative flex min-w-0 flex-1 items-center overflow-x-auto scroll-smooth py-1 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden"
    >
      {list.map((step, position) => {
        const item = step.lead
        const verdict = verdictOf(item.imageId)
        const note = commentOf(item.imageId).trim() !== ""
        const tone = verdict ?? (note ? "note" : "open")
        const current = position === index
        const state = verdict === "right" ? t`right to leave out` : verdict === "wrong" ? t`should be kept` : t`not judged`
        return (
          <span key={step.key} role="listitem" className="flex shrink-0">
            <button
              type="button"
              onClick={() => onJump(position)}
              aria-current={current ? "true" : undefined}
              aria-label={t`Page ${item.pageNumber}, image ${item.number}: ${state}`}
              title={t`Page ${item.pageNumber} · image ${item.number}`}
              className="group/dot grid h-5 w-3 place-items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
            >
              <span
                className={cn(
                  "block size-2 rounded-full transition-[background-color,transform,box-shadow] duration-200 ease-out group-hover/dot:scale-125 motion-reduce:transition-none",
                  DOT[tone],
                  current && "scale-125 ring-2 ring-[var(--chrome-hex)] ring-offset-1 ring-offset-card",
                )}
              />
            </button>
          </span>
        )
      })}
    </div>
  )
}

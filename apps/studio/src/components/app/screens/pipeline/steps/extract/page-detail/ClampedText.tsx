import type { ReactNode, Ref } from "react"
import { cn } from "@/lib/utils"
import { SEE_MORE } from "./sections/SeeMoreButton"

const CHARS_PER_LINE = 72

export function needsClamp(text: string, lines: number): boolean {
  const wrapped = text.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0)
  return wrapped > lines
}

export function ClampedText({
  text,
  lines,
  className,
  moreLabel,
  onMore,
  buttonRef,
}: {
  text: string
  lines: number
  className: string
  moreLabel: ReactNode
  onMore: () => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const clamp = needsClamp(text, lines)
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <p className={cn(className, clamp && "overflow-hidden")} style={clamp ? { maxHeight: `${lines}lh` } : undefined}>
          {text}
        </p>
        {clamp && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent" />}
      </div>
      {clamp && (
        <button ref={buttonRef} type="button" aria-haspopup="dialog" onClick={onMore} className={SEE_MORE}>
          {moreLabel}
        </button>
      )}
    </div>
  )
}

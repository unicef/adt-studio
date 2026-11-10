import { useEffect, useRef, useState } from "react"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { rectOf, sameRect, type PageRect } from "./pageRect"
import type { PageBox, PageSize } from "./types"

export function PageHighlight({ entry, size, tone }: { entry: PageBox | null; size: PageSize; tone: "selected" | "hover" }) {
  const rect = entry ? rectOf(entry, size) : null
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<{ rect: PageRect; number: number } | null>(rect && entry ? { rect, number: entry.number } : null)
  const [previous, setPrevious] = useState<PageRect | null>(rect)
  const [glide, setGlide] = useState(false)
  if (!sameRect(previous, rect)) {
    setGlide(previous != null && rect != null)
    setPrevious(rect)
    if (rect && entry) setShown({ rect, number: entry.number })
  }

  useEffect(() => {
    if (tone !== "selected" || !rect) return
    ref.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [tone, entry?.imageId, rect != null])

  if (!shown) return null
  const visible = rect != null
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-[3px] motion-reduce:transition-none!",
        tone === "selected"
          ? "border-2 border-[var(--chrome-hex)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_25%,transparent)]"
          : "border border-[color-mix(in_srgb,var(--chrome-hex)_70%,transparent)] bg-[color-mix(in_srgb,var(--chrome-hex)_8%,transparent)]",
        visible ? "scale-100 opacity-100 starting:scale-[0.96] starting:opacity-0" : "scale-[0.96] opacity-0",
      )}
      style={{
        left: `${shown.rect.left}%`,
        top: `${shown.rect.top}%`,
        width: `${shown.rect.width}%`,
        height: `${shown.rect.height}%`,
        transition: glide
          ? "top 240ms cubic-bezier(0.22,0.61,0.36,1), left 240ms cubic-bezier(0.22,0.61,0.36,1), width 240ms cubic-bezier(0.22,0.61,0.36,1), height 240ms cubic-bezier(0.22,0.61,0.36,1), opacity 200ms ease-out, scale 240ms cubic-bezier(0.22,0.61,0.36,1)"
          : "opacity 200ms ease-out, scale 240ms cubic-bezier(0.22,0.61,0.36,1)",
      }}
    >
      <span
        className={cn(
          "absolute -top-px -left-px grid h-4 min-w-4 place-items-center rounded-[3px] px-1 font-mono text-[10px] font-semibold tabular-nums",
          tone === "selected" ? "bg-[var(--chrome-hex)] text-white" : "bg-[color-mix(in_srgb,var(--chrome-hex)_70%,transparent)] text-white",
        )}
      >
        {shown.number}
      </span>
    </div>
  )
}

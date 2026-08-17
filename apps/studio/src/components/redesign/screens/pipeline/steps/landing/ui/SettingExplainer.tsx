import { useState, useRef, useCallback, useEffect, useLayoutEffect } from "react"
import type { CSSProperties, ReactNode } from "react"
import { Info } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { cn } from "@/lib/utils"

export function SettingExplainer({
  title,
  description,
  visual,
  cta,
  className,
  side = "right",
  align = "start",
  openDelay = 120,
  closeDelay = 120,
  accentColor,
  accentColorSoft,
}: {
  title?: ReactNode
  description?: ReactNode
  visual?: ReactNode
  cta?: ReactNode
  className?: string
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  openDelay?: number
  closeDelay?: number
  /**
   * Accent colors to re-establish inside the portaled popover. Required when
   * the visual uses `var(--accent-color)` because the Radix HoverCard portal
   * does not inherit the LandingPageShell's CSS variable cascade.
   */
  accentColor?: string
  accentColorSoft?: string
}) {
  const hasBody = Boolean(title || description || cta)
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [sideOffset, setSideOffset] = useState(12)

  const computeOffset = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const aside = trigger.closest("aside")
    if (!aside) {
      setSideOffset(12)
      return
    }
    const triggerRect = trigger.getBoundingClientRect()
    const asideRect = aside.getBoundingClientRect()
    const gap = asideRect.right - triggerRect.right
    setSideOffset(Math.max(12, gap + 12))
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    computeOffset()
  }, [open, computeOffset])

  useEffect(() => {
    if (!open) return
    const handle = () => computeOffset()
    window.addEventListener("resize", handle)
    window.addEventListener("scroll", handle, true)
    return () => {
      window.removeEventListener("resize", handle)
      window.removeEventListener("scroll", handle, true)
    }
  }, [open, computeOffset])

  return (
    <HoverCard
      open={open}
      onOpenChange={setOpen}
      openDelay={openDelay}
      closeDelay={closeDelay}
    >
      <HoverCardTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-[var(--accent-color,#525252)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          aria-label={t`More info`}
        >
          <Info className="h-4 w-4" strokeWidth={2} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={sideOffset}
        style={
          accentColor || accentColorSoft
            ? ({
                ...(accentColor
                  ? { "--accent-color": accentColor }
                  : null),
                ...(accentColorSoft
                  ? { "--accent-color-soft": accentColorSoft }
                  : null),
              } as CSSProperties)
            : undefined
        }
        className={cn(
          "w-[300px] rounded-xl border border-border bg-card p-0 shadow-lg",
          "data-[side=right]:slide-in-from-left-2 data-[side=left]:slide-in-from-right-2",
          "data-[side=top]:slide-in-from-bottom-2 data-[side=bottom]:slide-in-from-top-2",
          className,
        )}
      >
        {visual && (
          <div
            className={cn(
              "overflow-hidden bg-card px-4 pt-4 pb-4",
              hasBody
                ? "rounded-t-xl border-b border-border"
                : "rounded-xl",
            )}
          >
            {visual}
          </div>
        )}
        {hasBody && (
          <div className="flex flex-col gap-2 px-4 py-3.5">
            {title && (
              <h4 className="text-[14px] font-semibold leading-tight text-foreground">
                {title}
              </h4>
            )}
            {description && (
              <p className="text-[12.5px] leading-relaxed text-foreground">
                {description}
              </p>
            )}
            {cta && <div className="pt-1">{cta}</div>}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

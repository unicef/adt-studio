import { useLingui } from "@lingui/react/macro"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BannerModel } from "./bannerModel"
import type { BannerCopy } from "./useBannerCopy"

export const LINK = "rounded-sm font-medium text-[var(--chrome-hex)] underline-offset-4 outline-none transition-colors duration-150 hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
export const PRIMARY = "flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--chrome-hex)] px-4 text-[13px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] focus-visible:ring-offset-2"
export const GHOST = "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"

export function DismissButton({ model, className }: { model: BannerModel; className?: string }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      onClick={model.onDismiss}
      aria-label={t`Dismiss until Extract runs again`}
      title={t`Dismiss until Extract runs again`}
      className={cn("grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground", className)}
    >
      <X className="size-4" />
    </button>
  )
}

export function AiStatusLine({ model, copy, className, linkClassName = LINK }: { model: BannerModel; copy: BannerCopy; className?: string; linkClassName?: string }) {
  const opinion = model.ai.opinion
  const act = () => (opinion.running ? opinion.setView("live") : model.ai.onAsk())
  if (!copy.aiStatus && !copy.aiAction) return null
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-baseline gap-x-2", className)} data-banner-ai>
      {copy.aiStatus && <span className="tabular-nums">{copy.aiStatus}</span>}
      {copy.aiAction && (
        <button type="button" onClick={act} className={linkClassName}>
          {copy.aiAction}
        </button>
      )}
    </span>
  )
}

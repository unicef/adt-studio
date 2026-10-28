import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, ArrowLeftRight, EyeOff, FileText, Monitor, Puzzle } from "lucide-react"
import { cn } from "@/lib/utils"
import { STORYBOARD_HEX } from "@/components/app/screens/pipeline/shared/plugins"

export interface CompareSize {
  frameWidth: number
  frameHeight: number
  width: number
  height: number
}

const CHROME_X = 72
const CHROME_Y = 88
const MAX_FRAME_HEIGHT = 520
const MAX_WIDTH = 900

export function compareSize(ratio: number, viewport: { width: number; height: number }, railRight: number): CompareSize {
  const maxHeight = Math.min(MAX_FRAME_HEIGHT, viewport.height * 0.7 - CHROME_Y)
  const maxWidth = (Math.min(MAX_WIDTH, viewport.width - railRight - 40) - CHROME_X) / 2
  const frameHeight = Math.max(160, Math.min(maxHeight, maxWidth / ratio))
  const frameWidth = Math.round(frameHeight * ratio)
  return { frameWidth, frameHeight: Math.round(frameHeight), width: frameWidth * 2 + CHROME_X, height: Math.round(frameHeight) + CHROME_Y }
}

const CHIP = "inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10.5px] font-semibold"

function Frame({ src, label, icon: Icon, size, empty, tint }: { src: string | null; label: React.ReactNode; icon: typeof FileText; size: CompareSize; empty: React.ReactNode; tint?: "stale" | "pruned" }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <figure className="flex flex-col gap-1.5">
      <figcaption className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </figcaption>
      <div
        className={cn(
          "relative grid place-items-center overflow-hidden rounded-[9px] bg-muted/50 ring-1 ring-border",
          tint === "stale" && "ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
          tint === "pruned" && "opacity-70 grayscale",
        )}
        style={{ width: size.frameWidth, height: size.frameHeight }}
      >
        {src ? (
          <>
            {!loaded && <div className="absolute inset-0 bg-muted motion-safe:animate-pulse" />}
            <img
              src={src}
              alt=""
              onLoad={() => setLoaded(true)}
              className={cn("max-h-full max-w-full object-contain transition-opacity duration-200 motion-reduce:transition-none", loaded ? "opacity-100" : "opacity-0")}
            />
          </>
        ) : (
          <span className="px-4 text-center text-[11.5px] text-muted-foreground">{empty}</span>
        )}
      </div>
    </figure>
  )
}

export function PageComparePopover({
  pos,
  size,
  leaving,
  pageNumber,
  pdfSrc,
  renderedSrc,
  pruned,
  stale,
  activity,
}: {
  pos: { top: number; left: number }
  size: CompareSize
  leaving: boolean
  pageNumber: number
  pdfSrc: string | null
  renderedSrc: string | null
  pruned: boolean
  stale: boolean
  activity: boolean
}) {
  const { t } = useLingui()
  return (
    <div
      role="tooltip"
      aria-label={t`Page ${pageNumber}: source PDF and storyboard`}
      className={cn(
        "pointer-events-none fixed z-50 rounded-2xl bg-card p-3 shadow-[0_18px_48px_-18px_rgba(15,23,42,0.45)] ring-1 ring-border dark:shadow-[0_18px_48px_-14px_rgba(0,0,0,0.75)] dark:ring-white/10",
        leaving
          ? "-translate-x-1 opacity-0 transition-[opacity,translate] duration-[120ms] ease-in"
          : "translate-x-0 opacity-100 transition-[opacity,translate] duration-[180ms] ease-out starting:-translate-x-1 starting:opacity-0",
        "motion-reduce:translate-x-0 motion-reduce:starting:translate-x-0",
      )}
      style={{ top: pos.top, left: pos.left, width: size.width, ["--chrome-hex" as string]: STORYBOARD_HEX }}
    >
      <header className="flex h-9 items-center gap-2 px-1">
        <span className="text-[13px] font-semibold text-foreground">
          <Trans>Page {pageNumber}</Trans>
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {activity && (
            <span className={cn(CHIP, "bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]")}>
              <Puzzle className="size-3" />
              <Trans>Activity</Trans>
            </span>
          )}
          {pruned ? (
            <span className={cn(CHIP, "bg-muted text-muted-foreground")}>
              <EyeOff className="size-3" />
              <Trans>Pruned</Trans>
            </span>
          ) : stale ? (
            <span className={cn(CHIP, "border border-[color-mix(in_srgb,var(--chrome-hex)_40%,transparent)] text-[color-mix(in_oklab,var(--chrome-hex)_80%,black)] dark:text-[color-mix(in_oklab,var(--chrome-hex)_70%,white)]")}>
              <AlertTriangle className="size-3" />
              <Trans>Out of date</Trans>
            </span>
          ) : null}
        </span>
      </header>
      <div className="flex items-start gap-2 px-1 pb-1">
        <Frame src={pdfSrc} label={<Trans>Source PDF</Trans>} icon={FileText} size={size} empty={<Trans>No source image</Trans>} />
        <span aria-hidden className="mt-[calc(13px+0.375rem)] grid self-center place-items-center">
          <span className="grid size-6 place-items-center rounded-full bg-muted text-muted-foreground">
            <ArrowLeftRight className="size-3" />
          </span>
        </span>
        <Frame
          src={renderedSrc}
          label={<Trans>Storyboard</Trans>}
          icon={Monitor}
          size={size}
          empty={pruned ? <Trans>This page is pruned and isn't rendered.</Trans> : <Trans>Not rendered yet</Trans>}
          tint={pruned ? "pruned" : stale ? "stale" : undefined}
        />
      </div>
    </div>
  )
}

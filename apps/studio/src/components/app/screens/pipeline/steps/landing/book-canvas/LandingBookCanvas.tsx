import { useEffect, useMemo, useState } from "react"
import { plural } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { ImageOff } from "lucide-react"
import { getSourcePdfThumbnailUrl } from "@/api/client"
import { cn } from "@/lib/utils"
import { countGroups, groupPages, type PageGroup } from "@/components/app/screens/pipeline/shared/groupPages"
import { CANVAS_GAP, CANVAS_ROWS, useCanvasFit } from "./useCanvasFit"

const THUMB_WIDTH = 300
const SHEET = "relative overflow-hidden rounded-lg bg-card shadow-[0_8px_24px_-14px_rgba(15,23,42,0.4)] ring-1 ring-black/5"

const RETRY_DELAY_MS = 1200

function thumbUrl(bookLabel: string, number: number, width: number, attempt: number): string {
  const url = new URL(getSourcePdfThumbnailUrl(bookLabel, number, width), window.location.href)
  if (attempt > 0) url.searchParams.set("retry", String(attempt))
  return url.toString()
}

function PageImage({ bookLabel, number }: { bookLabel: string; number: number }) {
  const [state, setState] = useState<"loading" | "retrying" | "loaded" | "failed">("loading")
  const [attempt, setAttempt] = useState(0)
  const loaded = state === "loaded"

  useEffect(() => {
    if (state !== "retrying") return
    const timer = setTimeout(() => {
      setAttempt(1)
      setState("loading")
    }, RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state])

  if (state === "failed")
    return (
      <div className="absolute inset-0 grid place-items-center bg-muted/60 text-muted-foreground/60 animate-in fade-in duration-300 motion-reduce:animate-none">
        <ImageOff className="size-5" strokeWidth={1.8} />
      </div>
    )
  return (
    <>
      {!loaded && <div className="absolute inset-0 bg-muted motion-safe:animate-pulse" />}
      {state !== "retrying" && (
        <img
          key={attempt}
          src={thumbUrl(bookLabel, number, THUMB_WIDTH, attempt)}
          srcSet={`${thumbUrl(bookLabel, number, THUMB_WIDTH, attempt)} 1x, ${thumbUrl(bookLabel, number, THUMB_WIDTH * 2, attempt)} 2x`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState(attempt === 0 ? "retrying" : "failed")}
          className={cn("size-full object-cover transition-opacity duration-300 motion-reduce:transition-none", loaded ? "opacity-100" : "opacity-0")}
        />
      )}
    </>
  )
}

function PageSheet({ bookLabel, number, className }: { bookLabel: string; number: number; className?: string }) {
  return (
    <div className={cn(SHEET, "aspect-[650/812]", className)}>
      <PageImage bookLabel={bookLabel} number={number} />
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10.5px] font-medium tabular-nums text-white backdrop-blur-sm">
        {number}
      </span>
    </div>
  )
}

function GroupSheet({
  bookLabel,
  group,
  spread,
  first,
  last,
}: {
  bookLabel: string
  group: PageGroup
  spread: boolean
  first: number
  last: number
}) {
  const [left, right] = group
  if (!spread) return <PageSheet bookLabel={bookLabel} number={left} />
  if (right === undefined) {
    const onRight = left === first && first !== last
    return (
      <div className="grid grid-cols-2">
        <PageSheet bookLabel={bookLabel} number={left} className={onRight ? "col-start-2" : undefined} />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2">
      <PageSheet bookLabel={bookLabel} number={left} className="rounded-r-none" />
      <PageSheet bookLabel={bookLabel} number={right} className="rounded-l-none border-l border-black/10" />
    </div>
  )
}

export function LandingBookCanvas({
  bookLabel,
  range,
  spread,
  totalPages,
  failed = false,
}: {
  bookLabel: string
  range: [number, number]
  spread: boolean
  totalPages: number
  failed?: boolean
}) {
  const { t } = useLingui()
  const { ref, cols } = useCanvasFit<HTMLDivElement>()
  const [first, last] = totalPages > 0 ? range : [1, 0]
  const columns = spread ? Math.max(1, Math.round(cols / 2)) : cols
  const groups = useMemo(() => groupPages(first, last, spread), [first, last, spread])
  const placeholders = totalPages > 0 ? 0 : cols * CANVAS_ROWS
  const total = countGroups(first, last, spread)

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-muted/40">
      <div ref={ref} className="absolute inset-y-0 right-0 left-[min(480px,42%)]">
        <div className="size-full overflow-y-auto overscroll-contain px-8 pt-8 pb-40 [scrollbar-width:thin]!">
          <div
            key={spread ? "spread" : "single"}
            className="grid items-start animate-in fade-in duration-300 motion-reduce:animate-none"
            style={{ gridTemplateColumns: `repeat(${placeholders ? cols : columns}, minmax(0, 1fr))`, gap: CANVAS_GAP }}
          >
            {groups.map((group, index) => (
              <div
                key={group.join("-")}
                data-group={group.join("-")}
                className="animate-in fade-in zoom-in-95 fill-mode-both duration-500 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(index, 16) * 30}ms` }}
              >
                <GroupSheet bookLabel={bookLabel} group={group} spread={spread} first={first} last={last} />
              </div>
            ))}
            {Array.from({ length: placeholders }, (_, index) => (
              <div key={`placeholder-${index}`} className={cn(SHEET, "aspect-[650/812] bg-muted transition-opacity duration-300 motion-reduce:transition-none", failed ? "opacity-60" : "motion-safe:animate-pulse")} />
            ))}
          </div>
        </div>
      </div>
      <p className="pointer-events-none absolute right-8 bottom-24 flex items-center gap-2 rounded-full bg-card/90 px-3 py-1.5 text-[12px] text-muted-foreground shadow-sm ring-1 ring-black/5 backdrop-blur">
        {totalPages > 0 && (
          <span className="font-semibold text-foreground tabular-nums">
            {spread
              ? t`Pages ${first}–${last} · becomes ${plural(total, { one: "# page", other: "# pages" })}`
              : t`Pages ${first}–${last} · ${plural(total, { one: "# page", other: "# pages" })}`}
          </span>
        )}
        <span>{t`Extract turns each of these into text, images and structure.`}</span>
      </p>
    </div>
  )
}

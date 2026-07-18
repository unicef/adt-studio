import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useLingui } from "@lingui/react/macro"
import { Link2, Unlink, BookOpen, ChevronLeft, ChevronRight, Sparkles, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { normalizeLeads } from "./pairs"

interface PageGroupingEditorProps {
  startPage: number
  endPage: number
  /** 1-indexed leading page numbers merged with the following page. */
  spreadPairs: number[]
  onChange: (next: number[]) => void
  /** Source page thumbnails as data URLs; index 0 == physical page 1. */
  pageThumbnails: string[]
  /** When true, only the marked spreads are shown (review filter). */
  onlySpreads?: boolean
  /** Leads (1-indexed) that came from auto-detection — shown with a badge. */
  suggestedLeads?: number[]
  /** Leads (1-indexed) already merged in the extracted book — shown as merged. */
  mergedLeads?: number[]
  disabled?: boolean
}

type Group = number[]

/** Fallback page aspect (width / height) before a real page is measured. */
const DEFAULT_ASPECT = 0.72

/**
 * Greedy single-base grouping: every page is its own group unless its number
 * is a merge lead (and its partner is in range), in which case it pairs with
 * the following page. Mirrors `computeGroups` in @adt/pdf — kept in sync by
 * hand since the frontend must not import pipeline code.
 */
function buildGroups(startPage: number, endPage: number, leads: Set<number>): Group[] {
  const groups: Group[] = []
  let p = startPage
  while (p <= endPage) {
    if (leads.has(p) && p + 1 <= endPage) {
      groups.push([p, p + 1])
      p += 2
    } else {
      groups.push([p])
      p++
    }
  }
  return groups
}

export function PageGroupingEditor({
  startPage,
  endPage,
  spreadPairs,
  onChange,
  pageThumbnails,
  onlySpreads = false,
  suggestedLeads,
  mergedLeads,
  disabled = false,
}: PageGroupingEditorProps) {
  const { t } = useLingui()
  const suggested = useMemo(() => new Set(suggestedLeads ?? []), [suggestedLeads])
  const merged = useMemo(() => new Set(mergedLeads ?? []), [mergedLeads])
  const leads = useMemo(() => new Set(spreadPairs), [spreadPairs])
  const groups = useMemo(
    () => buildGroups(startPage, endPage, leads),
    [startPage, endPage, leads],
  )

  const [aspect, setAspect] = useState<number>(DEFAULT_ASPECT)
  const measuredRef = useRef(false)
  const measure = useCallback((ratio: number) => {
    if (measuredRef.current || !Number.isFinite(ratio) || ratio <= 0) return
    measuredRef.current = true
    setAspect(ratio)
  }, [])

  const merge = (lead: number) => {
    if (disabled) return
    onChange(normalizeLeads([...spreadPairs, lead], startPage, endPage))
  }

  const split = (lead: number) => {
    if (disabled) return
    onChange(spreadPairs.filter((p) => p !== lead))
  }

  const visibleGroups = onlySpreads ? groups.filter((g) => g.length === 2) : groups

  if (onlySpreads && visibleGroups.length === 0) {
    return (
      <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-6 text-center">
        <BookOpen className="h-8 w-8 text-[#d4d4d4]" aria-hidden />
        <p className="max-w-[320px] text-sm text-muted-foreground">
          {t`No spreads marked yet. Switch to All pages and link two facing pages to create one.`}
        </p>
      </div>
    )
  }

  return (
    <HorizontalScroller label={t`Book pages. Scroll horizontally to see more.`}>
      {visibleGroups.map((group, idx) => {
        const prev = visibleGroups[idx - 1]
        const canMerge =
          !onlySpreads &&
          !!prev &&
          prev.length === 1 &&
          group.length === 1 &&
          group[0] === prev[0] + 1
        return (
          <Fragment key={group[0]}>
            {idx > 0 &&
              (canMerge ? (
                <MergeButton
                  onClick={() => merge(prev[0])}
                  disabled={disabled}
                  label={t`Merge pages ${prev[0]} and ${group[0]} into a spread`}
                />
              ) : (
                <div className="w-3 shrink-0" aria-hidden />
              ))}
            {group.length === 2 ? (
              <SpreadTile
                left={group[0]}
                right={group[1]}
                leftSrc={pageThumbnails[group[0] - 1]}
                rightSrc={pageThumbnails[group[1] - 1]}
                aspect={aspect}
                onMeasure={measure}
                onSplit={() => split(group[0])}
                merged={merged.has(group[0])}
                suggested={suggested.has(group[0])}
                disabled={disabled}
              />
            ) : (
              <PageTile
                page={group[0]}
                src={pageThumbnails[group[0] - 1]}
                aspect={aspect}
                onMeasure={measure}
              />
            )}
          </Fragment>
        )
      })}
    </HorizontalScroller>
  )
}

/**
 * Scrollable, keyboard-focusable page strip. A focused region scrolls with the
 * arrow keys natively (the native scrollbar shows position); edge fades and
 * arrow buttons add a pointer affordance and a "there's more" cue.
 */
function HorizontalScroller({ children, label }: { children: ReactNode; label: string }) {
  const { t } = useLingui()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft < max - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (contentRef.current) ro.observe(contentRef.current)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [update])

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" })
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="h-full overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
      >
        <div ref={contentRef} className="flex h-full w-max items-center gap-2 px-5 py-5">
          {children}
        </div>
      </div>

      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-14 bg-gradient-to-r from-[#fafafa] to-transparent transition-opacity duration-200",
          canLeft ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-14 bg-gradient-to-l from-[#fafafa] to-transparent transition-opacity duration-200",
          canRight ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      />

      <ScrollArrow
        side="left"
        label={t`Scroll to previous pages`}
        visible={canLeft}
        onClick={() => scrollByPage(-1)}
      />
      <ScrollArrow
        side="right"
        label={t`Scroll to more pages`}
        visible={canRight}
        onClick={() => scrollByPage(1)}
      />
    </div>
  )
}

function ScrollArrow({
  side,
  label,
  visible,
  onClick,
}: {
  side: "left" | "right"
  label: string
  visible: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "absolute top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#525252] shadow-md transition-all duration-200 hover:scale-105 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        side === "left" ? "left-2" : "right-2",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      {side === "left" ? (
        <ChevronLeft className="h-5 w-5" aria-hidden />
      ) : (
        <ChevronRight className="h-5 w-5" aria-hidden />
      )}
    </button>
  )
}

const THUMB_H = "h-[clamp(240px,46vh,420px)]"

function PageThumb({
  page,
  src,
  aspect,
  onMeasure,
}: {
  page: number
  src?: string
  aspect: number
  onMeasure: (ratio: number) => void
}) {
  const { t } = useLingui()
  return (
    <div className={cn(THUMB_H, "shrink-0 bg-white")} style={{ aspectRatio: aspect }}>
      {src ? (
        <img
          src={src}
          loading="lazy"
          decoding="async"
          onLoad={(e) =>
            onMeasure(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
          }
          alt={t`Page ${page}`}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#f0f0f0] text-[12px] text-[#a3a3a3]">
          {page}
        </div>
      )}
    </div>
  )
}

function PageBadge({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
      {children}
    </span>
  )
}

function PageTile({
  page,
  src,
  aspect,
  onMeasure,
}: {
  page: number
  src?: string
  aspect: number
  onMeasure: (ratio: number) => void
}) {
  return (
    <div className="relative shrink-0 overflow-hidden rounded-md border border-[#e5e5e5] opacity-90 shadow-sm transition-all hover:opacity-100">
      <PageThumb page={page} src={src} aspect={aspect} onMeasure={onMeasure} />
      <PageBadge>{page}</PageBadge>
    </div>
  )
}

function SpreadTile({
  left,
  right,
  leftSrc,
  rightSrc,
  aspect,
  onMeasure,
  onSplit,
  merged,
  suggested,
  disabled,
}: {
  left: number
  right: number
  leftSrc?: string
  rightSrc?: string
  aspect: number
  onMeasure: (ratio: number) => void
  onSplit: () => void
  merged: boolean
  suggested: boolean
  disabled: boolean
}) {
  const { t } = useLingui()
  const frame = merged
    ? "border-emerald-500 bg-emerald-500/5"
    : suggested
      ? "border-amber-500 bg-amber-500/5"
      : "border-primary bg-primary/5"
  const pill = merged ? "bg-emerald-600" : suggested ? "bg-amber-500" : "bg-primary"
  const label = merged
    ? t`Merged ${left}–${right}`
    : suggested
      ? t`Detected ${left}–${right}`
      : t`Spread ${left}–${right}`
  const Icon = merged ? Check : suggested ? Sparkles : Link2
  return (
    <div
      className={cn(
        "group relative shrink-0 rounded-lg border-2 p-1.5 shadow-md transition-all",
        frame,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -top-2.5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow",
          pill,
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        {label}
      </span>
      <div className="relative flex overflow-hidden rounded">
        <div className="relative border-r border-dashed border-black/10">
          <PageThumb page={left} src={leftSrc} aspect={aspect} onMeasure={onMeasure} />
          <PageBadge>{left}</PageBadge>
        </div>
        <div className="relative">
          <PageThumb page={right} src={rightSrc} aspect={aspect} onMeasure={onMeasure} />
          <PageBadge>{right}</PageBadge>
        </div>
        <span
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-white shadow-md",
            pill,
          )}
          aria-hidden
        >
          <Link2 className="h-4 w-4" strokeWidth={2.5} />
        </span>
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={onSplit}
          aria-label={t`Split spread ${left}–${right} back into single pages`}
          className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-center gap-1 rounded bg-white/90 py-1 text-[11px] font-medium text-primary opacity-0 shadow-sm transition-opacity duration-150 hover:bg-white focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100"
        >
          <Unlink className="h-3.5 w-3.5" strokeWidth={2} />
          {t`Split`}
        </button>
      )}
    </div>
  )
}

function MergeButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void
  disabled: boolean
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e5e5e5] bg-white text-[#a3a3a3] opacity-60 shadow-sm transition-all duration-150 hover:scale-110 hover:border-primary hover:text-primary hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:scale-100"
    >
      <Link2 className="h-4 w-4" strokeWidth={2} />
    </button>
  )
}

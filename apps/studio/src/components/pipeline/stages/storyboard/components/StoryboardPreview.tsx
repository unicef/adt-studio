import { useMemo } from "react"
import { EyeOff, Image as ImageIcon, LayoutGrid } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

type StoryboardPageLayout =
  | "ai-title-text-image"
  | "ai-title-image-text"
  | "ai-image-text"
  | "ai-text-image-mid"
  | "ai-text-only"
  | "single-column"
  | "image-overlay-bottom"
  | "image-overlay-top"
  | "image-overlay-corner"
  | "grid-template"
  | "two-column"

type StoryboardPageThumb = {
  n: number
  sections: number
  layout: StoryboardPageLayout
  titleWidth: number
  active?: boolean
  pruned?: boolean
}

const PAGE_BASES: Omit<StoryboardPageThumb, "layout">[] = [
  { n: 1, sections: 3, titleWidth: 55 },
  { n: 2, sections: 3, titleWidth: 70 },
  { n: 3, sections: 3, titleWidth: 75, active: true },
  { n: 4, sections: 3, titleWidth: 0 },
  { n: 5, sections: 3, titleWidth: 65 },
  { n: 6, sections: 2, titleWidth: 55, pruned: true },
  { n: 7, sections: 3, titleWidth: 0 },
  { n: 8, sections: 2, titleWidth: 55, pruned: true },
  { n: 9, sections: 4, titleWidth: 70 },
]

const AI_LAYOUT_CYCLE: StoryboardPageLayout[] = [
  "ai-title-text-image",
  "ai-title-image-text",
  "ai-text-only",
  "ai-image-text",
  "ai-text-image-mid",
  "ai-text-only",
  "ai-image-text",
  "ai-text-image-mid",
  "ai-title-text-image",
]

const OVERLAY_LAYOUT_CYCLE: StoryboardPageLayout[] = [
  "image-overlay-bottom",
  "image-overlay-top",
  "image-overlay-bottom",
  "image-overlay-corner",
  "image-overlay-bottom",
  "image-overlay-top",
  "image-overlay-corner",
  "image-overlay-top",
  "image-overlay-bottom",
]

function buildPages(strategy: string): StoryboardPageThumb[] {
  if (strategy === "llm" || strategy === "publisher_styles" || !strategy) {
    return PAGE_BASES.map((p, i) => ({
      ...p,
      layout: AI_LAYOUT_CYCLE[i] ?? "ai-title-text-image",
    }))
  }
  if (strategy === "llm-overlay") {
    return PAGE_BASES.map((p, i) => ({
      ...p,
      layout: OVERLAY_LAYOUT_CYCLE[i] ?? "image-overlay-bottom",
    }))
  }
  const uniform: StoryboardPageLayout =
    strategy === "single_column"
      ? "single-column"
      : strategy === "fixed_layout"
        ? "grid-template"
        : strategy === "two_column_story"
          ? "two-column"
          : "ai-title-text-image"
  return PAGE_BASES.map((p) => ({ ...p, layout: uniform }))
}

export function StoryboardPreview({ strategy }: { strategy: string }) {
  const pages = useMemo(() => buildPages(strategy), [strategy])
  const totalPages = pages.length
  const totalSections = pages.reduce((sum, page) => sum + page.sections, 0)

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-violet-50/30 via-white to-white">
      <div className="flex flex-col w-full h-full px-5 py-4 gap-3 min-h-0">
        {/* Header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1.5">
            <LayoutGrid
              className="w-3.5 h-3.5 text-violet-600"
              strokeWidth={2}
            />
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-violet-700 leading-none">
              <Trans>Storyboard Overview</Trans>
            </span>
          </div>
          <span className="text-[10px] tabular-nums font-medium text-violet-500/80 leading-none">
            <Trans>
              {totalPages} pages · {totalSections} sections
            </Trans>
          </span>
        </div>

        {/* Page grid — fills available height, 3 rows of equal size */}
        <div className="grid grid-cols-3 grid-rows-3 gap-2 flex-1 min-h-0">
          {pages.map((page) => (
            <PageThumbnail key={page.n} page={page} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PageThumbnail({ page }: { page: StoryboardPageThumb }) {
  const { n, sections, layout, titleWidth, active, pruned } = page

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col gap-1 overflow-hidden rounded-md border bg-white p-2 transition-all duration-300",
        active &&
          "border-violet-600 shadow-[0_4px_14px_-4px_rgba(124,58,237,0.35)] ring-2 ring-violet-600/15",
        pruned &&
          "border-dashed border-neutral-300 bg-neutral-50/60 shadow-none",
        !active && !pruned && "border-violet-100 shadow-sm",
      )}
    >
      {/* Card header */}
      <div className="flex items-center justify-between leading-none shrink-0">
        <span
          className={cn(
            "text-[7.5px] font-semibold tracking-[0.12em] uppercase",
            pruned
              ? "text-neutral-400 line-through decoration-[0.5px]"
              : "text-neutral-500",
          )}
        >
          <Trans>Page {n}</Trans>
        </span>
        <span
          className={cn(
            "text-[7.5px] tabular-nums",
            pruned ? "text-neutral-400" : "text-violet-500/70",
          )}
        >
          <Trans>{sections} sections</Trans>
        </span>
      </div>

      {/* Body */}
      {pruned ? (
        <div className="flex flex-1 items-center justify-center">
          <EyeOff
            className="h-7 w-7 text-neutral-300"
            strokeWidth={1.5}
            aria-hidden
          />
        </div>
      ) : (
        <div
          key={layout}
          className="flex flex-1 min-h-0 flex-col gap-1 overflow-hidden motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-[0.97] motion-safe:duration-300 motion-safe:ease-out"
        >
          <PageBody
            layout={layout}
            titleWidth={titleWidth}
            active={active}
          />
        </div>
      )}
    </div>
  )
}

function PageBody({
  layout,
  titleWidth,
  active,
}: {
  layout: StoryboardPageLayout
  titleWidth: number
  active?: boolean
}) {
  const titleBar = titleWidth > 0 && (
    <TitleBar width={titleWidth} active={active} />
  )

  switch (layout) {
    case "ai-title-text-image":
      return (
        <>
          {titleBar}
          <Lines widths={[100, 92, 100, 70]} />
          <ImageBlock variant="short" className="mt-auto" />
        </>
      )
    case "ai-title-image-text":
      return (
        <>
          {titleBar}
          <ImageBlock variant="short" />
          <Lines widths={[100, 92, 78]} />
        </>
      )
    case "ai-image-text":
      return (
        <>
          <ImageBlock variant="tall" />
          <Lines widths={[100, 92, 100, 85, 70]} />
        </>
      )
    case "ai-text-image-mid":
      return (
        <>
          {titleBar}
          <Lines widths={[100, 88]} />
          <ImageBlock variant="short" />
          <Lines widths={[100, 65]} />
        </>
      )
    case "ai-text-only":
      return (
        <>
          {titleBar}
          <Lines widths={[100, 95, 100, 88, 100, 72]} />
        </>
      )
    case "single-column":
      return (
        <>
          <TitleBar width={titleWidth || 70} active={active} />
          <Lines widths={[100, 95, 90]} />
          <ImageBlock variant="short" />
          <Lines widths={[100, 92, 70]} />
        </>
      )
    case "image-overlay-bottom":
      return (
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-md bg-gradient-to-br from-violet-200/80 via-violet-200/50 to-violet-300/40 ring-1 ring-violet-200/60">
          <ImageIcon
            className="absolute left-1/2 top-[28%] -translate-x-1/2 h-3.5 w-3.5 text-violet-400/70"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="absolute inset-x-1 bottom-1 flex flex-col gap-1 rounded-sm bg-white/95 px-1.5 py-1.5 shadow-sm">
            <TitleBar width={titleWidth || 70} active={active} />
            <Lines widths={[100, 65]} />
          </div>
        </div>
      )
    case "image-overlay-top":
      return (
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-md bg-gradient-to-tr from-violet-300/70 via-violet-200/60 to-violet-100/60 ring-1 ring-violet-200/60">
          <ImageIcon
            className="absolute left-1/2 top-[58%] -translate-x-1/2 h-3.5 w-3.5 text-violet-400/70"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="absolute inset-x-1 top-1 flex flex-col gap-1 rounded-sm bg-white/95 px-1.5 py-1.5 shadow-sm">
            <TitleBar width={titleWidth || 80} active={active} />
            <Lines widths={[100, 60]} />
          </div>
        </div>
      )
    case "image-overlay-corner":
      return (
        <div className="relative flex-1 min-h-0 overflow-hidden rounded-md bg-gradient-to-bl from-violet-400/55 via-violet-200/55 to-violet-50/70 ring-1 ring-violet-200/60">
          <ImageIcon
            className="absolute left-[35%] top-[40%] -translate-x-1/2 h-3.5 w-3.5 text-violet-400/70"
            strokeWidth={1.5}
            aria-hidden
          />
          <div className="absolute bottom-1 right-1 flex w-[58%] flex-col gap-0.5 rounded-sm bg-white/95 px-1.5 py-1 shadow-sm">
            <TitleBar width={titleWidth || 75} active={active} />
            <Lines widths={[100, 70]} />
          </div>
        </div>
      )
    case "grid-template":
      return (
        <>
          <TitleBar width={titleWidth || 75} active={active} />
          <div className="grid shrink-0 grid-cols-2 gap-1">
            <ImageBlock variant="short" />
            <ImageBlock variant="short" />
          </div>
          <Lines widths={[100, 92, 88, 70]} />
        </>
      )
    case "two-column":
      return (
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_1.1fr] gap-1.5">
          <ImageBlock variant="full" />
          <div className="flex min-w-0 flex-col gap-1">
            <TitleBar width={titleWidth || 80} active={active} />
            <Lines widths={[100, 92, 78, 95, 60]} />
          </div>
        </div>
      )
  }
}

function TitleBar({
  width,
  active,
}: {
  width: number
  active?: boolean
}) {
  return (
    <div
      className={cn(
        "h-[5px] shrink-0 rounded-full",
        active ? "bg-violet-600" : "bg-violet-500",
      )}
      style={{ width: `${width}%` }}
    />
  )
}

function Lines({ widths }: { widths: number[] }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-[3px] rounded-full bg-violet-200/70"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  )
}

function ImageBlock({
  variant,
  className,
}: {
  variant: "short" | "tall" | "full"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-md bg-violet-100/70 ring-1 ring-violet-200/60",
        variant === "tall" && "h-12 shrink-0",
        variant === "short" && "h-9 shrink-0",
        variant === "full" && "h-full min-h-0",
        className,
      )}
    >
      <ImageIcon
        className="h-3 w-3 text-violet-400"
        strokeWidth={1.5}
        aria-hidden
      />
    </div>
  )
}
